import logging
import os
import threading
from pathlib import Path

from .counting import VALORES, contar, normalizar_clase

log = logging.getLogger("vision")

# vision/models/monedad.onnx por defecto (también acepta best.pt); configurable con MODEL_PATH.
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "monedad.onnx"


def model_path() -> Path:
    return Path(os.environ.get("MODEL_PATH", DEFAULT_MODEL_PATH)).expanduser()


class ModelNotAvailable(Exception):
    pass


def verificar_clases(names: dict) -> None:
    """El modelo debe detectar exactamente $1, $2, $5 y $10 (peso1, peso2, peso5, peso10)."""
    encontradas = {normalizar_clase(n) for n in names.values()}
    if encontradas != set(VALORES):
        raise ValueError(
            f"Las clases del modelo {sorted(names.values())} no corresponden a {sorted(VALORES)}"
        )


class CoinDetector:
    """Envuelve el modelo YOLO de best.pt. La inferencia se serializa con un candado."""

    def __init__(self, path: Path, device: str = "cpu", imgsz: int = 640, conf: float = 0.25):
        # Import perezoso: ultralytics/torch son pesados y los tests no los necesitan.
        from ultralytics import YOLO

        # Ultralytics carga .pt y .onnx con la misma API (el .onnx usa onnxruntime en CPU).
        self._model = YOLO(str(path), task="detect")
        self.formato = path.suffix.lower().lstrip(".")
        verificar_clases(self._model.names)
        self.device, self.imgsz, self.conf = device, imgsz, conf
        self._lock = threading.Lock()

    def contar(self, imagen) -> dict[str, int]:
        with self._lock:
            result = self._model.predict(
                source=imagen,
                imgsz=self.imgsz,
                conf=self.conf,
                device=self.device,
                verbose=False,
                # Una moneda física no puede ser dos denominaciones: el NMS agnóstico
                # descarta la caja duplicada con otra clase sobre la misma moneda.
                agnostic_nms=True,
            )[0]
        nombres = (self._model.names[int(box.cls.item())] for box in result.boxes)
        return contar(nombres)


def load_detector() -> tuple[CoinDetector | None, str | None]:
    """Devuelve (detector, None) o (None, mensaje de error legible)."""
    path = model_path()
    if not path.is_file():
        return None, (
            f"No se encontró el modelo en {path}. Copia ahí tus pesos entrenados (best.pt) "
            "o define MODEL_PATH con otra ruta."
        )
    try:
        device = os.environ.get("VISION_DEVICE", "cpu")
        return CoinDetector(path, device=device), None
    except Exception as e:  # pesos corruptos, ultralytics ausente, etc.
        log.exception("No se pudo cargar el modelo")
        return None, f"No se pudo cargar el modelo {path}: {type(e).__name__}: {e}"
