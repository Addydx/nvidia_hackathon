import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.counting import contar  # noqa: E402
from app.main import app  # noqa: E402


class FakeDetector:
    """Sustituye al modelo real (no hay pesos en CI): solo prueba el contrato HTTP."""

    def contar(self, imagen):
        assert imagen.mode == "RGB"
        return contar(["peso10", "peso 2", "peso5", "peso10", "otra"])


def png_bytes(size=(20, 10)):
    buf = io.BytesIO()
    Image.new("RGB", size, "gray").save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture
def client():
    app.state.detector, app.state.error = FakeDetector(), None
    with TestClient(app) as c:
        yield c
    app.state.detector = None


def test_contar_normaliza_y_cuenta():
    assert contar(["peso1", "PESO 2", "peso5", "peso10", "peso10", "x"]) == {"1": 1, "2": 1, "5": 1, "10": 2}
    assert contar([]) == {"1": 0, "2": 0, "5": 0, "10": 0}


def test_endpoint_devuelve_cuatro_enteros(client):
    r = client.post("/contar-monedas", files={"foto": ("m.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    assert r.json() == {"1": 0, "2": 1, "5": 1, "10": 2}


def test_rechaza_archivo_no_imagen_y_campo_faltante(client):
    r = client.post("/contar-monedas", files={"foto": ("a.txt", b"hola", "text/plain")})
    assert r.status_code == 400
    assert client.post("/contar-monedas", files={"otro": ("a.png", png_bytes(), "image/png")}).status_code == 422


def test_sin_modelo_da_503_con_mensaje_claro():
    app.state.detector = None
    app.state.error = "No se encontró el modelo en /x/best.pt. Copia ahí tus pesos"
    with TestClient(app) as c:  # sin detector inyectado intentaría cargar; se fija el error
        app.state.detector, app.state.error = None, "No se encontró el modelo en /x/best.pt. Copia ahí tus pesos"
        r = c.post("/contar-monedas", files={"foto": ("m.png", png_bytes(), "image/png")})
        assert r.status_code == 503 and "best.pt" in r.json()["detail"]
        assert c.get("/salud").json()["modelo_cargado"] is False


def test_modelo_ausente_en_arranque_real(monkeypatch, tmp_path):
    from app.model import load_detector

    monkeypatch.setenv("MODEL_PATH", str(tmp_path / "best.pt"))
    detector, error = load_detector()
    assert detector is None and str(tmp_path / "best.pt") in error


def test_verificar_clases():
    from app.model import verificar_clases

    verificar_clases({0: "peso1", 1: "peso 2", 2: "peso5", 3: "peso10"})
    with pytest.raises(ValueError):
        verificar_clases({0: "gato", 1: "perro"})
    with pytest.raises(ValueError):
        verificar_clases({0: "peso1", 1: "peso2", 2: "peso5"})


ONNX = Path(__file__).resolve().parents[1] / "models" / "monedad.onnx"


@pytest.mark.skipif(not ONNX.is_file(), reason="monedad.onnx no está en vision/models (los pesos no se versionan)")
def test_carga_real_del_onnx(monkeypatch):
    from app.model import load_detector

    monkeypatch.setenv("MODEL_PATH", str(ONNX))
    detector, error = load_detector()
    assert error is None and detector.formato == "onnx"
    assert set(detector.contar(Image.new("RGB", (64, 48), "white"))) == {"1", "2", "5", "10"}
