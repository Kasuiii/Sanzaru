"""Run in your training environment: python inspect_model.py"""
from pathlib import Path
import json
from core import load_config, missing_seals
from predictor import UltralyticsPredictor
root = Path(__file__).resolve().parent
config = load_config(root / "model-config.json")
model_path = Path(config["model_path"])
if not model_path.is_absolute():
    model_path = root / model_path
adapter = UltralyticsPredictor(model_path, config)
print(json.dumps({"task":adapter.task,"classes":adapter.names,"missing_gestures":missing_seals(adapter.names,config["class_map"]),"input_mode":config["input_mode"]},ensure_ascii=False,indent=2))
