# Servicio de visión · conteo de monedas

FastAPI que carga los pesos YOLO entrenados (`.onnx` o `best.pt`) y cuenta monedas de $1, $2, $5 y $10 en una foto. La lógica sale de `vendia.py` (predicción y conteo); el entrenamiento y Colab quedan fuera.

## Dónde va el modelo

```
vision/models/monedad.onnx      # por defecto
```

Se elige otro archivo con `MODEL_PATH=/ruta/al/modelo.onnx` (o un `best.pt`: se carga con la misma API). El `.onnx` corre en CPU con `onnxruntime`, ya incluido en `requirements.txt`. Los pesos (`*.pt`, `*.onnx`) están ignorados por git. Al cargar se verifica que las clases sean exactamente `peso1`, `peso2`, `peso5` y `peso10` ($1, $2, $5 y $10); si no, `modelo_cargado` queda en `false` con el motivo en `error`.

Sin modelo el servicio **arranca igual**, registra el aviso y responde `503` con la ruta esperada en `POST /contar-monedas`.

## Arrancar (CPU, puerto 8000)

```bash
cd vision
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
# otro modelo: MODEL_PATH=/ruta/best.pt uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Comprueba la carga: `curl http://127.0.0.1:8000/salud` debe devolver `"modelo_cargado": true`.

La inferencia usa CPU por defecto; `VISION_DEVICE=0` usaría la primera GPU. Variables: `MODEL_PATH`, `VISION_DEVICE` (por defecto `cpu`).

## Conectar con Next.js

En `.env.local` de la raíz (solo servidor):

```
VISION_API_URL=http://127.0.0.1:8000
```

Reinicia `npm run dev` y abre `/cierre`. Usa `127.0.0.1` y no `localhost`, que en algunos equipos resuelve a IPv6.

## API

`POST /contar-monedas` (`multipart/form-data`, campo `foto`, imagen ≤ 10 MB) →

```json
{"1": 0, "2": 1, "5": 1, "10": 2}
```

Cuatro enteros. Errores: `400` imagen vacía/inválida, `413` > 10 MB, `422` falta el campo `foto`, `503` modelo no disponible. Se aplica la orientación EXIF de la foto y se detecta con `imgsz=640`, `conf=0.25` (los valores de `vendia.py`).

## Pruebas

```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

Cubren el conteo, la verificación de clases, el contrato HTTP (con un detector simulado), el arranque sin modelo y, si `monedad.onnx` está presente, su carga real. **No** validan la precisión del modelo: eso requiere `best.pt` y una foto con conteo manual conocido (pendiente).
