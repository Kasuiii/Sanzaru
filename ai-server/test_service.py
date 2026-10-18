"""Contract tests use a fake predictor; they do not measure your model accuracy."""
import asyncio
from io import BytesIO
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from PIL import Image
from app import create_app
from core import Prediction, SEALS, load_config, missing_seals, overlap_fraction, select_gesture
from predictor import UltralyticsPredictor

ROOT = Path(__file__).resolve().parent
CONFIG = load_config(ROOT / "model-config.json")
def jpeg():
    stream = BytesIO()
    Image.new("RGB", (64,48), "gray").save(stream, format="JPEG")
    return stream.getvalue()
FRAME = jpeg()
URL = "/predict?x1=0.2&y1=0.2&x2=0.8&y2=0.8"
HEADERS = {"Content-Type":"image/jpeg", "Origin":"http://localhost:8787", "Authorization":"Bearer test-only-token"}

class FakePredictor:
    task = "detect"
    names = list(SEALS)
    predictions = [Prediction("Closed_Fist", .91, (.3,.3,.6,.6))]
    def predict(self, image):
        assert image.mode == "RGB"
        return self.predictions

class CoreTests(unittest.TestCase):
    def test_mapping_and_hand_association(self):
        predictions=[Prediction("Closed_Fist",.9,(.2,.2,.4,.4)),Prediction("Victory",.99,(.75,.75,.95,.95))]
        result=select_gesture(predictions,"detect",(.1,.1,.5,.5),CONFIG)
        self.assertEqual(result["gesture"],"Closed_Fist")
        self.assertEqual(select_gesture(predictions,"detect",(.55,.1,.7,.3),CONFIG)["gesture"],"None")
        self.assertEqual(overlap_fraction((0,0,.5,.5),(.6,.6,1,1)),0)
    def test_neutral_low_confidence_and_classify(self):
        self.assertEqual(select_gesture([Prediction("background",.98),Prediction("Victory",.8)],"classify",(0,0,1,1),CONFIG)["gesture"],"None")
        self.assertEqual(select_gesture([Prediction("Victory",.5)],"classify",(0,0,1,1),CONFIG)["gesture"],"None")
        self.assertEqual(select_gesture([Prediction("thumb_up",.9)],"classify",(0,0,1,1),CONFIG)["gesture"],"Thumb_Up")
        self.assertEqual(missing_seals(["fist"],CONFIG["class_map"]),["Open_Palm","Victory","Thumb_Up"])
    def test_config_rejects_unsupported_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"config.json"
            for change in [{"class_map":{"magic":"made_up"}},{"input_mode":"guess"},{"confidence":.1},{"image_size":17}]:
                path.write_text(json.dumps({**CONFIG,**change}))
                with self.assertRaises(ValueError):load_config(path)

class AdapterTests(unittest.TestCase):
    def test_ultralytics_detection_and_classification_result_contracts(self):
        class Tensor:
            def __init__(self,value):self.value=value
            def cpu(self):return self
            def tolist(self):return self.value
            def item(self):return self.value
        names={0:"Closed_Fist",1:"Open_Palm",2:"Victory",3:"Thumb_Up"}
        detection=SimpleNamespace(names=names,boxes=SimpleNamespace(xyxyn=Tensor([[.1,.2,.4,.6]]),cls=Tensor([2]),conf=Tensor([.92])))
        classification=SimpleNamespace(names=names,probs=SimpleNamespace(top1=3,top1conf=Tensor(.88)))
        for task,result,expected in [("detect",detection,"Victory"),("classify",classification,"Thumb_Up")]:
            class FakeYOLO:
                def __init__(self,*args):self.task=task;self.names=names
                def predict(self,**kwargs):
                    self.kwargs=kwargs
                    return [result]
            with tempfile.TemporaryDirectory() as directory, patch.dict("sys.modules",{"ultralytics":SimpleNamespace(YOLO=FakeYOLO)}):
                path=Path(directory)/"best.pt";path.write_bytes(b"test-placeholder-not-real-weights")
                adapter=UltralyticsPredictor(path,CONFIG)
                result=adapter.predict(Image.new("RGB",(80,60)))
                self.assertEqual(result[0].label,expected)
                self.assertFalse(adapter.model.kwargs["save"])
                if task=="detect":self.assertEqual(result[0].box,(.1,.2,.4,.6))
                else:self.assertIsNone(result[0].box)

class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(create_app(predictor=FakePredictor(),api_token="test-only-token"))
        self.client.__enter__()
    def tearDown(self):
        self.client.__exit__(None,None,None)
    def test_health_image_and_no_image_storage(self):
        health=self.client.get("/health",headers=HEADERS)
        self.assertEqual(health.status_code,200)
        self.assertTrue(health.json()["ready"])
        response=self.client.post(URL,headers=HEADERS,content=FRAME)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()["gesture"],"Closed_Fist")
        self.assertGreaterEqual(response.json()["inference_ms"],0)
        self.assertEqual(response.headers["Cache-Control"],"no-store")
    def test_auth_cors_and_bounded_input(self):
        self.assertEqual(self.client.post(URL,content=FRAME,headers={"Content-Type":"image/jpeg"}).status_code,401)
        self.assertEqual(self.client.post(URL,content=FRAME,headers={**HEADERS,"Origin":"https://untrusted.invalid"}).status_code,403)
        response=self.client.options(URL,headers={"Origin":"http://localhost:8787","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,content-type"})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.headers["access-control-allow-origin"],"http://localhost:8787")
        self.assertEqual(self.client.options(URL,headers={"Origin":"https://untrusted.invalid","Access-Control-Request-Method":"POST"}).status_code,400)
        self.assertEqual(self.client.post(URL,headers={**HEADERS,"Content-Type":"text/plain"},content=FRAME).status_code,415)
        self.assertEqual(self.client.post(URL,headers=HEADERS,content=b"not a JPEG").status_code,400)
        self.assertEqual(self.client.post(URL,headers=HEADERS,content=b"x"*1_000_001).status_code,413)
        self.assertEqual(self.client.post("/predict?x1=.9&y1=.2&x2=.1&y2=.5",headers=HEADERS,content=FRAME).status_code,422)
    def test_missing_model_or_mapping_never_claims_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"config.json"
            path.write_text(json.dumps({**CONFIG,"model_path":"missing.pt"}))
            with TestClient(create_app(config_path=path,api_token="")) as client:
                response=client.get("/health")
                self.assertEqual(response.status_code,503)
                self.assertFalse(response.json()["ready"])
        adapter=FakePredictor();adapter.names=["fist"]
        with TestClient(create_app(predictor=adapter,api_token="")) as client:
            self.assertFalse(client.get("/health").json()["ready"])
            self.assertEqual(client.post(URL,headers={"Content-Type":"image/jpeg"},content=FRAME).status_code,409)
    def test_busy_inference_does_not_queue_old_frames(self):
        entered,release=threading.Event(),threading.Event()
        class BlockingPredictor(FakePredictor):
            def predict(self,image):
                entered.set()
                if not release.wait(3):raise RuntimeError("test timeout")
                return super().predict(image)
        with TestClient(create_app(predictor=BlockingPredictor(),api_token="")) as client:
            results=[]
            thread=threading.Thread(target=lambda:results.append(client.post(URL,headers={"Content-Type":"image/jpeg"},content=FRAME)))
            thread.start()
            try:
                self.assertTrue(entered.wait(2))
                self.assertEqual(client.post(URL,headers={"Content-Type":"image/jpeg"},content=FRAME).status_code,503)
            finally:
                release.set();thread.join(timeout=3)
            self.assertEqual(results[0].status_code,200)

if __name__ == "__main__":unittest.main(verbosity=2)
