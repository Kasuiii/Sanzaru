"""Inspect your trusted Ultralytics ASL .pt, without uploading or deploying it."""
import json
import os
from pathlib import Path
from asl_core import load_asl_config, supported_letters
from predictor import UltralyticsPredictor

root = Path(__file__).resolve().parent
path = Path(os.environ.get("ASL_MODEL_CONFIG", root / "asl-config.json"))
config = load_asl_config(path)
weights = Path(config["model_path"])
if not weights.is_absolute():
    weights = path.parent / weights
adapter = UltralyticsPredictor(weights, config)
letters = supported_letters(adapter.names, config)
print(json.dumps({
    "task": adapter.task,
    "classes": adapter.names,
    "supported_static_letters": letters,
    "at_least_five_letters": len(letters) >= 5,
    "missing_default_letters": [x for x in "ABCLY" if x not in letters],
    "unmapped_classes": [x for x in adapter.names if x not in config["class_map"]],
    "input_mode": config["input_mode"],
    "motion_letters_excluded": ["J", "Z"],
}, ensure_ascii=False, indent=2))
