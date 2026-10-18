"""Optional inference service; run with one process. It never stores camera frames."""
from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
import hmac
from io import BytesIO
import logging
import os
from pathlib import Path
import time
import warnings
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from core import SEALS, load_config, missing_seals, select_gesture, valid_box
from predictor import UltralyticsPredictor

ROOT = Path(__file__).resolve().parent
MAX_BYTES = 1_000_000
MAX_PIXELS = 4_000_000
DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787,http://127.0.0.1:8787"

def decode_image(data: bytes) -> Image.Image:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.format not in ("JPEG", "PNG") or source.width * source.height > MAX_PIXELS:
                    raise ValueError("Use a JPEG/PNG image of at most 4 million pixels")
                source.load()
                return source.convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("Cannot decode this image") from exc

def create_app(predictor=None, config_path: Path | None = None, allowed_origins: list[str] | None = None, api_token: str | None = None):
    config_path = config_path or Path(os.environ.get("MODEL_CONFIG", str(ROOT / "model-config.json")))
    origins = allowed_origins if allowed_origins is not None else [s.strip() for s in os.environ.get("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if s.strip()]
    if not origins or "*" in origins:
        raise ValueError("ALLOWED_ORIGINS must contain explicit web origins, not *")
    secret = os.environ.get("AI_API_TOKEN", "") if api_token is None else api_token

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.lock = asyncio.Lock()
        app.state.predictor = None
        app.state.error = ""
        app.state.config = None
        try:
            config = load_config(config_path)
            model_path = Path(config["model_path"])
            if not model_path.is_absolute():
                model_path = config_path.parent / model_path
            app.state.config = config
            adapter = predictor if predictor is not None else await asyncio.to_thread(UltralyticsPredictor, model_path, config)
            if adapter.task not in ("detect", "classify"):
                raise ValueError("This service supports detect/classify only")
            app.state.predictor = adapter
        except Exception as exc:
            app.state.error = str(exc)
            logging.warning("Model startup failed: %s", type(exc).__name__)
        yield

    app = FastAPI(title="SANZARU custom gesture API", version="1.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False,
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])

    def authorize(request: Request):
        origin = request.headers.get("origin")
        if origin is not None and origin not in origins:
            raise HTTPException(403, "This website origin is not allowed. Update ALLOWED_ORIGINS.")
        if secret:
            header = request.headers.get("authorization", "")
            if not hmac.compare_digest(header.encode(), ("Bearer " + secret).encode()):
                raise HTTPException(401, "API token is missing or incorrect")

    @app.get("/health")
    async def health(request: Request):
        authorize(request)
        adapter, config = app.state.predictor, app.state.config
        if adapter is None or config is None:
            return JSONResponse({"protocol":1,"ready":False,"error":app.state.error or "Model is not loaded"}, status_code=503, headers={"Cache-Control":"no-store"})
        missing = missing_seals(adapter.names, config["class_map"])
        return JSONResponse({"protocol":1,"ready":not missing,"task":adapter.task,"classes":adapter.names,
            "mapped_gestures":[s for s in SEALS if s not in missing],"missing_gestures":missing,
            "input_mode":config["input_mode"],"confidence":config["confidence"],
            "error":"Map all four spell gestures before playing" if missing else ""}, headers={"Cache-Control":"no-store"})

    @app.post("/predict")
    async def predict(request: Request, x1: float = Query(ge=0,le=1), y1: float = Query(ge=0,le=1), x2: float = Query(ge=0,le=1), y2: float = Query(ge=0,le=1)):
        authorize(request)
        adapter, config = app.state.predictor, app.state.config
        if adapter is None or config is None:
            raise HTTPException(503, "Model not loaded. Check /health and the Python terminal.")
        if missing_seals(adapter.names, config["class_map"]):
            raise HTTPException(409, "Model class mapping does not cover all four spell gestures")
        hand_box = (x1,y1,x2,y2)
        if not valid_box(hand_box):
            raise HTTPException(422, "Invalid tracked-hand box")
        if request.headers.get("content-type", "").split(";")[0].lower() not in ("image/jpeg", "image/png"):
            raise HTTPException(415, "Send a raw JPEG or PNG image, not a filename or multipart form")
        if app.state.lock.locked():
            raise HTTPException(503, "Inference busy; retry with a newer frame", headers={"Retry-After":"1"})
        async with app.state.lock:
            content = bytearray()
            async for chunk in request.stream():
                content.extend(chunk)
                if len(content) > MAX_BYTES:
                    raise HTTPException(413, "Frame exceeds 1 MB")
            try:
                image = await asyncio.to_thread(decode_image, bytes(content))
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
            started = time.perf_counter()
            try:
                results = await asyncio.to_thread(adapter.predict, image)
                payload = select_gesture(results, adapter.task, hand_box, config)
            except Exception as exc:
                logging.warning("Inference failed: %s", type(exc).__name__)
                raise HTTPException(500, "Model inference failed. Check model/dependency compatibility in Python.") from exc
            finally:
                image.close()
            payload.update(protocol=1, inference_ms=round((time.perf_counter()-started)*1000,1))
            return JSONResponse(payload, headers={"Cache-Control":"no-store"})
    return app

app = create_app()
