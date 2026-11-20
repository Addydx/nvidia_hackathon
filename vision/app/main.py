import io
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from .model import CoinDetector, load_detector, model_path

log = logging.getLogger("vision")
MAX_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    if getattr(app.state, "detector", None) is None:  # los tests inyectan uno propio
        app.state.detector, app.state.error = load_detector()
    if app.state.error:
        log.warning(app.state.error)
    yield


app = FastAPI(title="Servicio de visión · conteo de monedas", lifespan=lifespan)
app.state.detector = None
app.state.error = None


@app.get("/salud")
def salud():
    ok = app.state.detector is not None
    return {"modelo_cargado": ok, "ruta_modelo": str(model_path()), "error": app.state.error}


@app.post("/contar-monedas")
def contar_monedas(foto: UploadFile = File(...)):
    detector: CoinDetector | None = app.state.detector
    if detector is None:
        raise HTTPException(503, app.state.error or "El modelo no está cargado.")

    data = foto.file.read(MAX_BYTES + 1)
    if not data:
        raise HTTPException(400, "La foto está vacía.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "La foto pesa más de 10 MB.")
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")  # respeta la orientación del teléfono
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "El archivo no es una imagen válida.")

    return detector.contar(img)
