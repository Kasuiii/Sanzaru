"""Legacy seal-model export helper. For ASL browser inference use scripts/export-asl-onnx.py."""
from pathlib import Path
from core import load_config
from ultralytics import YOLO
root = Path(__file__).resolve().parent
config = load_config(root / "model-config.json")
path = Path(config["model_path"])
if not path.is_absolute():
    path = root / path
if not path.is_file():
    raise SystemExit("Place your trained .pt file at the configured model_path first")
model = YOLO(str(path))
model.export(format="onnx", imgsz=config["image_size"], dynamic=False, half=False, simplify=False, nms=False)
print("Exported ONNX. A browser adapter still needs model-specific preprocessing/output decoding/NMS.")
