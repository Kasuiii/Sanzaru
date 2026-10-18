"""Static ASL alphabet adapter. J/Z motion recognition is deliberately excluded."""
import json
import math
from pathlib import Path
from core import overlap_fraction

LETTERS = tuple("ABCDEFGHIKLMNOPQRSTUVWXY")

def load_asl_config(path: Path) -> dict:
    c = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(c, dict) or not isinstance(c.get("model_path"), str) or not c["model_path"].endswith(".pt"):
        raise ValueError("model_path must point to your trusted Ultralytics ASL .pt file")
    if c.get("input_mode") not in ("full-frame", "hand-crop"):
        raise ValueError("input_mode must be full-frame or hand-crop")
    if type(c.get("image_size")) is not int or not 128 <= c["image_size"] <= 1280 or c["image_size"] % 32:
        raise ValueError("image_size must be a multiple of 32 between 128 and 1280")
    for k, low in (("confidence", .7), ("iou", .01), ("association_overlap", .01)):
        if type(c.get(k)) not in (int, float) or not math.isfinite(c[k]) or not low <= c[k] <= 1:
            raise ValueError(k + " is outside the allowed range")
    if not isinstance(c.get("device"), (str, int)):
        raise ValueError("device must be cpu, mps or a CUDA device")
    mapping = c.get("class_map")
    if not isinstance(mapping, dict) or not mapping or any(not isinstance(k, str) or v not in (*LETTERS, "None") for k, v in mapping.items()):
        raise ValueError("class_map must map exact class names to static ASL letters or None. J/Z need a temporal model.")
    return c

def supported_letters(names, config):
    found = {config["class_map"].get(n) for n in names}
    return [letter for letter in LETTERS if letter in found]

def select_letter(predictions, task, hand_box, config):
    eligible = [p for p in predictions if math.isfinite(p.confidence) and 0 <= p.confidence <= 1]
    if task == "detect":
        eligible = [p for p in eligible if p.box is not None and overlap_fraction(p.box, hand_box) >= config["association_overlap"]]
    elif task != "classify":
        raise ValueError("Only detect/classify supported")
    chosen = max(eligible, key=lambda p: p.confidence, default=None)
    label, score = (chosen.label, chosen.confidence) if chosen else (None, 0)
    letter = config["class_map"].get(label, "None") if score >= config["confidence"] else "None"
    return {"letter": letter, "confidence": score if letter in LETTERS else 0,
            "class_name": label, "raw_confidence": score,
            "box": list(chosen.box) if chosen and chosen.box else None}
