"""Run: python -m uvicorn asl_app:app --host 127.0.0.1 --port 8001

Both signers use this same ASL model. Keep a single worker on a small machine.
No input frames are saved. The original app.py remains for the legacy game.
"""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import time
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app import decode_image, DEFAULT_ORIGINS, MAX_BYTES
from core import valid_box
from predictor import UltralyticsPredictor
from asl_core import load_asl_config, select_letter, supported_letters

ROOT = Path(__file__).resolve().parent
PROTOCOL = "asl-alphabet-v1"

def create_asl_app(predictor=None, config_path=None, allowed_origins=None, api_token=None):
    config_path = Path(config_path or os.environ.get("ASL_MODEL_CONFIG", ROOT / "asl-config.json"))
    origins = allowed_origins if allowed_origins is not None else [x.strip() for x in os.environ.get("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if x.strip()]
    if not origins or "*" in origins:
        raise ValueError("Use explicit ALLOWED_ORIGINS")
    secret = os.environ.get("AI_API_TOKEN", "") if api_token is None else api_token

    @asynccontextmanager
    async def lifespan(app):
        app.state.lock = asyncio.Lock()
        app.state.predictor = None
        app.state.error = ""
        try:
            config = load_asl_config(config_path)
            model_path = Path(config["model_path"])
            if not model_path.is_absolute(): model_path = config_path.parent / model_path
            adapter = predictor or await asyncio.to_thread(UltralyticsPredictor, model_path, config)
            if adapter.task not in ("detect", "classify"): raise ValueError("Use a detect/classify ASL model")
            digest = hashlib.sha256()
            if predictor is None:
                with model_path.open("rb") as f:
                    while chunk := f.read(1048576): digest.update(chunk)
            else: digest.update(b"test-predictor")
            digest.update(json.dumps({"map":config["class_map"],"input":config["input_mode"],"classes":adapter.names,"size":config["image_size"],"confidence":config["confidence"],"iou":config["iou"],"association_overlap":config["association_overlap"]},sort_keys=True).encode())
            app.state.model_id = digest.hexdigest()
            app.state.config = config
            app.state.predictor = adapter
        except Exception as e:
            app.state.error = str(e)
            logging.warning("ASL model startup failed: %s", type(e).__name__)
        yield

    app = FastAPI(title="SANZARU ASL alphabet API", version="3.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=False,allow_methods=["GET","POST"],allow_headers=["Content-Type","Authorization"])
    def authorize(request):
        if request.headers.get("origin") is not None and request.headers["origin"] not in origins: raise HTTPException(403,"Website origin is not allowed. Update ALLOWED_ORIGINS.")
        if secret and not hmac.compare_digest(request.headers.get("authorization","").encode(),("Bearer "+secret).encode()): raise HTTPException(401,"API token is missing or incorrect")

    @app.get("/health")
    async def health(request:Request):
        authorize(request)
        adapter = app.state.predictor
        if adapter is None: return JSONResponse({"protocol":PROTOCOL,"ready":False,"error":app.state.error},status_code=503,headers={"Cache-Control":"no-store"})
        c = app.state.config
        letters = supported_letters(adapter.names,c)
        return JSONResponse({"protocol":PROTOCOL,"ready":len(letters)>=5,"task":adapter.task,"classes":adapter.names,"letters":letters,
          "model_id":app.state.model_id,"confidence":c["confidence"],"input_mode":c["input_mode"],"excluded_motion_letters":["J","Z"],
          "error":"Map at least five static letters" if len(letters)<5 else ""},headers={"Cache-Control":"no-store"})

    @app.post("/predict")
    async def predict(request:Request,x1:float=Query(ge=0,le=1),y1:float=Query(ge=0,le=1),x2:float=Query(ge=0,le=1),y2:float=Query(ge=0,le=1)):
        authorize(request)
        adapter = app.state.predictor
        if adapter is None: raise HTTPException(503,"ASL model is not loaded. Check /health.")
        c = app.state.config
        if len(supported_letters(adapter.names,c))<5: raise HTTPException(409,"Map at least five static ASL letters")
        box=(x1,y1,x2,y2)
        if not valid_box(box): raise HTTPException(422,"Invalid tracked hand bounds")
        if request.headers.get("content-type","").split(";")[0] not in ("image/jpeg","image/png"): raise HTTPException(415,"Send raw JPEG/PNG bytes")
        if app.state.lock.locked(): raise HTTPException(503,"Inference busy; use a newer frame",headers={"Retry-After":"1"})
        async with app.state.lock:
            content=bytearray()
            async for chunk in request.stream():
                content.extend(chunk)
                if len(content)>MAX_BYTES: raise HTTPException(413,"Frame exceeds 1 MB")
            try: image=await asyncio.to_thread(decode_image,bytes(content))
            except ValueError as e: raise HTTPException(400,str(e)) from e
            started=time.perf_counter()
            try:
                predictions=await asyncio.to_thread(adapter.predict,image)
                result=select_letter(predictions,adapter.task,box,c)
            except Exception as e:
                logging.warning("ASL inference failed: %s",type(e).__name__)
                raise HTTPException(500,"ASL inference failed. Check model and dependency versions.") from e
            finally: image.close()
            return JSONResponse({**result,"protocol":PROTOCOL,"model_id":app.state.model_id,"inference_ms":round((time.perf_counter()-started)*1000,1)},headers={"Cache-Control":"no-store"})
    return app

app=create_asl_app()
