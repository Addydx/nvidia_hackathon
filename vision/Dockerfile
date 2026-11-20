# Servicio de visión (FastAPI + onnxruntime en CPU). Los pesos NO van en la imagen:
# se montan en solo lectura en /models y MODEL_PATH apunta ahí.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    MODEL_PATH=/models/monedad.onnx VISION_DEVICE=cpu \
    HOME=/tmp YOLO_CONFIG_DIR=/tmp/ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt .
# torch solo-CPU: evita arrastrar CUDA (ultralytics lo importa aunque el modelo sea .onnx)
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install -r requirements.txt
COPY app ./app
RUN useradd --uid 10001 --no-create-home app
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
