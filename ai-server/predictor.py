"""Replace this adapter if your .pt is NOT an Ultralytics detect/classify model."""
from __future__ import annotations
from pathlib import Path
from PIL import Image
from core import Prediction

class UltralyticsPredictor:
    def __init__(self, model_path: Path, config: dict):
        if not model_path.is_file():
            raise FileNotFoundError("Place your trained model at ai-server/models/best.pt (or update model_path)")
        # Imported only when loading an actual model. No network auto-download:
        # the local file existence check above is intentional.
        from ultralytics import YOLO
        self.model = YOLO(str(model_path))
        self.task = self.model.task
        if self.task not in ("detect", "classify"):
            raise ValueError(f"Model task {self.task!r} is not supported. Pose keypoints need a separate gesture classifier/adapter.")
        names = self.model.names
        self.names = list(names.values()) if isinstance(names, dict) else list(names)
        self.config = config

    def predict(self, image: Image.Image) -> list[Prediction]:
        settings = dict(source=image, imgsz=self.config["image_size"], device=self.config["device"],
                        verbose=False, save=False, stream=False)
        if self.task == "detect":
            settings.update(conf=self.config["confidence"], iou=self.config["iou"], max_det=10)
        result = self.model.predict(**settings)[0]
        if self.task == "classify":
            if result.probs is None:
                return []
            index = int(result.probs.top1)
            return [Prediction(str(result.names[index]), float(result.probs.top1conf.item()))]
        if result.boxes is None:
            return []
        boxes = result.boxes.xyxyn.cpu().tolist()
        classes = result.boxes.cls.cpu().tolist()
        scores = result.boxes.conf.cpu().tolist()
        return [Prediction(str(result.names[int(i)]), float(score), tuple(max(0.0, min(1.0, float(v))) for v in box))
                for box, i, score in zip(boxes, classes, scores)]
