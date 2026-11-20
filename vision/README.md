# Servicio de visión · conteo de monedas

FastAPI que carga los pesos YOLO entrenados (`best.pt`) y cuenta monedas de $1, $2, $5 y $10 en una foto. La lógica sale de `vendia.py` (predicción y conteo); el entrenamiento y Colab quedan fuera.

## Dónde va el modelo

```
vision/models/best.pt
```

O en otra ruta con `MODEL_PATH=/ruta/a/best.pt`. En Colab es `/content/runs_monedas/entrenamiento_monedas/weights/best.pt`: descárgalo y cópialo ahí. Los pesos están ignorados por git (`models/*.pt`).

Sin `best.pt` el servicio **arranca igual**, registra el aviso y responde `503` con la ruta esperada en `POST /contar-monedas`; `GET /salud` muestra `modelo_cargado: false`.

## Arrancar (CPU, puerto 8000)

```bash
cd vision
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

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

Cubren el conteo, el contrato HTTP (con un detector simulado) y el arranque sin modelo. **No** validan la precisión del modelo: eso requiere `best.pt` y una foto con conteo manual conocido (pendiente).
