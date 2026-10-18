"""Protocol/permissions tests with a fake predictor, not ASL accuracy tests."""
from io import BytesIO
import json
from pathlib import Path
import tempfile
import threading
import unittest
from fastapi.testclient import TestClient
from PIL import Image
from asl_app import create_asl_app
from asl_core import load_asl_config, select_letter, supported_letters
from core import Prediction

ROOT = Path(__file__).resolve().parent
CONFIG = load_asl_config(ROOT / "asl-config.json")
OUT = BytesIO()
Image.new("RGB", (64, 48), "gray").save(OUT, format="JPEG")
FRAME = OUT.getvalue()
URL = "/predict?x1=.2&y1=.2&x2=.8&y2=.8"
HEADERS = {"Content-Type": "image/jpeg", "Origin": "http://localhost:8787", "Authorization": "Bearer test-only-token"}

class FakePredictor:
    task = "detect"
    names = list("ABCLY") + ["nothing", "J", "Z"]
    predictions = [Prediction("A", .94, (.3, .3, .6, .6))]
    def predict(self, image):
        assert image.mode == "RGB"
        return self.predictions

class AslCoreTests(unittest.TestCase):
    def test_exact_mapping_static_letters_and_neutral(self):
        self.assertEqual(supported_letters(FakePredictor.names, CONFIG), list("ABCLY"))
        for label in ["nothing", "J", "Z", "Closed_Fist", "unmapped"]:
            self.assertEqual(select_letter([Prediction(label, .99)], "classify", (0, 0, 1, 1), CONFIG)["letter"], "None")
        predictions = [Prediction("nothing", .99), Prediction("A", .9)]
        self.assertEqual(select_letter(predictions, "classify", (0, 0, 1, 1), CONFIG)["letter"], "None")
        self.assertEqual(select_letter([Prediction("B", .6)], "classify", (0, 0, 1, 1), CONFIG)["letter"], "None")
        self.assertEqual(select_letter([Prediction("C", .9)], "classify", (0, 0, 1, 1), CONFIG)["letter"], "C")

    def test_detection_requires_association_with_tracked_hand(self):
        choices = [Prediction("A", .92, (.2, .2, .4, .4)), Prediction("B", .99, (.8, .8, .9, .9))]
        self.assertEqual(select_letter(choices, "detect", (.1, .1, .5, .5), CONFIG)["letter"], "A")
        self.assertEqual(select_letter(choices, "detect", (.6, .1, .7, .3), CONFIG)["letter"], "None")
        self.assertEqual(select_letter([Prediction("A", float("nan"), (.2, .2, .4, .4))], "detect", (.1, .1, .5, .5), CONFIG)["letter"], "None")

    def test_config_rejects_motion_and_unsafe_threshold(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            for change in [{"class_map": {"J": "J"}}, {"confidence": .2}, {"input_mode": "guess"}, {"image_size": 17}]:
                path.write_text(json.dumps({**CONFIG, **change}))
                with self.assertRaises(ValueError): load_asl_config(path)

class AslServiceTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_asl_app(predictor=FakePredictor(), api_token="test-only-token"))
        self.client.__enter__()
    def tearDown(self): self.client.__exit__(None, None, None)

    def test_health_prediction_and_fingerprint(self):
        info = self.client.get("/health", headers=HEADERS).json()
        self.assertEqual(info["protocol"], "asl-alphabet-v1")
        self.assertTrue(info["ready"])
        self.assertEqual(info["letters"], list("ABCLY"))
        self.assertEqual(len(info["model_id"]), 64)
        response = self.client.post(URL, headers=HEADERS, content=FRAME)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["letter"], "A")
        self.assertEqual(response.json()["model_id"], info["model_id"])
        self.assertEqual(response.headers["cache-control"], "no-store")
        with TestClient(create_asl_app(predictor=FakePredictor(), api_token="")) as other:
            self.assertEqual(other.get("/health").json()["model_id"], info["model_id"])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(json.dumps({**CONFIG, "confidence": .8}))
            with TestClient(create_asl_app(predictor=FakePredictor(), config_path=path, api_token="")) as other:
                self.assertNotEqual(other.get("/health").json()["model_id"], info["model_id"])

    def test_permissions_origin_and_input_limits(self):
        self.assertEqual(self.client.get("/health").status_code, 401)
        self.assertEqual(self.client.get("/health", headers={**HEADERS, "Origin": "https://other.invalid"}).status_code, 403)
        preflight = self.client.options(URL, headers={"Origin": "http://localhost:8787", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
        self.assertEqual(preflight.status_code, 200)
        self.assertEqual(preflight.headers["access-control-allow-origin"], "http://localhost:8787")
        self.assertEqual(self.client.post(URL, headers={**HEADERS, "Content-Type": "text/plain"}, content=FRAME).status_code, 415)
        self.assertEqual(self.client.post(URL, headers=HEADERS, content=b"invalid").status_code, 400)
        self.assertEqual(self.client.post(URL, headers=HEADERS, content=b"x" * 1_000_001).status_code, 413)
        self.assertEqual(self.client.post("/predict?x1=.9&y1=.2&x2=.1&y2=.5", headers=HEADERS, content=FRAME).status_code, 422)

    def test_missing_model_and_insufficient_mapping_are_not_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(json.dumps({**CONFIG, "model_path": "missing.pt"}))
            with TestClient(create_asl_app(config_path=path, api_token="")) as client:
                response = client.get("/health")
                self.assertEqual(response.status_code, 503)
                self.assertFalse(response.json()["ready"])
        adapter = FakePredictor()
        adapter.names = ["A", "J", "Z"]
        with TestClient(create_asl_app(predictor=adapter, api_token="")) as client:
            self.assertFalse(client.get("/health").json()["ready"])
            self.assertEqual(client.post(URL, headers={"Content-Type": "image/jpeg"}, content=FRAME).status_code, 409)

    def test_busy_frames_are_rejected_instead_of_queued(self):
        entered, release = threading.Event(), threading.Event()
        class BlockingPredictor(FakePredictor):
            def predict(self, image):
                entered.set()
                if not release.wait(5): raise RuntimeError("test timeout")
                return self.predictions
        with TestClient(create_asl_app(predictor=BlockingPredictor(), api_token="")) as client:
            results = []
            thread = threading.Thread(target=lambda: results.append(client.post(URL, headers={"Content-Type": "image/jpeg"}, content=FRAME)))
            thread.start()
            try:
                self.assertTrue(entered.wait(2))
                response = client.post(URL, headers={"Content-Type": "image/jpeg"}, content=FRAME)
                self.assertEqual(response.status_code, 503)
                self.assertIn("busy", response.json()["detail"])
            finally: release.set(); thread.join(5)
            self.assertEqual(results[0].status_code, 200)

if __name__ == "__main__": unittest.main()
