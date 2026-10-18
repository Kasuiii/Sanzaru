"""Model-independent validation and hand/gesture association. No camera IO."""
from __future__ import annotations
from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Any

SEALS = ("Closed_Fist", "Open_Palm", "Victory", "Thumb_Up")

@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    box: tuple[float, float, float, float] | None = None

def load_config(path: Path) -> dict[str, Any]:
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(config, dict):
        raise ValueError("model-config.json must be an object")
    if not isinstance(config.get("model_path"), str) or not config["model_path"].endswith(".pt"):
        raise ValueError("model_path must point to your trusted Ultralytics .pt file")
    if config.get("input_mode") not in ("full-frame", "hand-crop"):
        raise ValueError("input_mode must be full-frame or hand-crop")
    size = config.get("image_size")
    if type(size) is not int or size < 128 or size > 1280 or size % 32:
        raise ValueError("image_size must be a multiple of 32 from 128 to 1280")
    for key, lo, hi in [("confidence", 0.6, 1), ("iou", 0.01, 1), ("association_overlap", 0.01, 1)]:
        value = config.get(key)
        if type(value) not in (int, float) or not math.isfinite(value) or not lo <= value <= hi:
            raise ValueError(f"{key} must be between {lo} and {hi}")
    if not isinstance(config.get("device"), (str, int)):
        raise ValueError("device must be cpu, mps, or a CUDA device such as 0")
    mapping = config.get("class_map")
    if not isinstance(mapping, dict) or not mapping:
        raise ValueError("class_map must map your exact model class names to game gestures")
    if any(not isinstance(k, str) or v not in (*SEALS, "None") for k, v in mapping.items()):
        raise ValueError("class_map values must be Closed_Fist, Open_Palm, Victory, Thumb_Up or None")
    return config

def valid_box(box: tuple[float, float, float, float]) -> bool:
    return len(box) == 4 and all(math.isfinite(v) and 0 <= v <= 1 for v in box) and box[0] < box[2] and box[1] < box[3]

def overlap_fraction(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    """Intersection / smaller box area: robust to a tight detector vs padded hand ROI."""
    if not valid_box(a) or not valid_box(b):
        return 0.0
    intersection = max(0.0, min(a[2], b[2]) - max(a[0], b[0])) * max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return intersection / min((a[2]-a[0])*(a[3]-a[1]), (b[2]-b[0])*(b[3]-b[1]))

def missing_seals(names: list[str], mapping: dict[str, str]) -> list[str]:
    supported = {mapping.get(name, "None") for name in names}
    return [gesture for gesture in SEALS if gesture not in supported]

def select_gesture(predictions: list[Prediction], task: str, hand_box: tuple[float, float, float, float], config: dict[str, Any]) -> dict[str, Any]:
    eligible = [p for p in predictions if math.isfinite(p.confidence) and 0 <= p.confidence <= 1]
    if task == "detect":
        eligible = [p for p in eligible if p.box is not None and overlap_fraction(p.box, hand_box) >= config["association_overlap"]]
    elif task != "classify":
        raise ValueError("Only detect and classify are supported")
    # Choose the best observation BEFORE mapping: a confident neutral must not
    # be replaced by a lower-confidence spell merely because it has a mapping.
    chosen = max(eligible, key=lambda p: p.confidence, default=None)
    label = chosen.label if chosen else None
    score = chosen.confidence if chosen else 0.0
    gesture = config["class_map"].get(label, "None") if score >= config["confidence"] else "None"
    return {"gesture": gesture, "confidence": score if gesture in SEALS else 0.0,
            "class_name": label, "raw_confidence": score,
            "box": list(chosen.box) if chosen and chosen.box else None}
