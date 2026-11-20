"""Servicio privado de inferencia del asistente de monedas de VendIA (FastAPI).

Carga Qwen2.5-1.5B-Instruct + el adaptador LoRA «vendia-monedas-lora» y genera con CUDA. Protocolo compatible con OpenAI
(/v1/chat/completions) para que la app Next.js lo use igual que el servicio anterior. Toda ruta exige «Authorization: Bearer <clave>».

Arranque (ver README.md):  VENDIA_API_KEY=... uvicorn servicio_monedas:app --host 127.0.0.1 --port 8001
Si no se define VENDIA_API_KEY se genera una clave aleatoria, se guarda en «.clave-api» (modo 600) y se publica UNA sola vez en la
ruta de arranque que aparece en el registro (útil para entregársela al servidor de la app sin imprimirla).
"""
import hashlib
import logging
import os
import secrets
import threading
from pathlib import Path

import peft
import torch
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import PlainTextResponse
from peft import PeftModel
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer

log = logging.getLogger("vendia")
AQUI = Path(__file__).resolve().parent
BASE = os.environ.get("VENDIA_BASE", "Qwen/Qwen2.5-1.5B-Instruct")
ADAPTADOR = Path(os.environ.get("VENDIA_ADAPTADOR", AQUI / "vendia-monedas-lora"))
NOMBRE = "vendia-monedas"
PERMITIR_CPU = os.environ.get("VENDIA_PERMITIR_CPU") == "1"

KEY = os.environ.get("VENDIA_API_KEY", "")
RUTA_ARRANQUE = None
if not KEY:
    KEY = secrets.token_hex(24)
    (AQUI / ".clave-api").write_text(KEY)
    os.chmod(AQUI / ".clave-api", 0o600)
    RUTA_ARRANQUE = "/arranque/" + secrets.token_urlsafe(18)
    print("RUTA_DE_ARRANQUE", RUTA_ARRANQUE, flush=True)

if torch.cuda.is_available():
    DISPOSITIVO = "cuda:0"
elif PERMITIR_CPU:
    DISPOSITIVO = "cpu"
else:
    raise RuntimeError("CUDA no disponible: este servicio debe ejecutarse en la GPU NVIDIA (VENDIA_PERMITIR_CPU=1 solo para pruebas)")

tokenizer = AutoTokenizer.from_pretrained(BASE)
_base = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16 if DISPOSITIVO != "cpu" else torch.float32,
                                             device_map={"": 0} if DISPOSITIVO != "cpu" else None)
model = PeftModel.from_pretrained(_base, ADAPTADOR).eval()
if DISPOSITIVO == "cpu":
    model = model.to("cpu")
ADAPTADOR_SHA = hashlib.sha256((ADAPTADOR / "adapter_model.safetensors").read_bytes()).hexdigest()
GPU = torch.cuda.get_device_name(0) if DISPOSITIVO != "cpu" else "cpu"
lock = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def _auth(authorization: str):
    esperado = ("Bearer " + KEY).encode()
    if not secrets.compare_digest(authorization.encode(), esperado):
        raise HTTPException(401, "No autorizado")


class Mensaje(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(max_length=4096)


class Chat(BaseModel):
    model: str
    messages: list[Mensaje] = Field(min_length=1, max_length=3)
    max_tokens: int = Field(default=96, ge=1, le=160)


@app.get("/salud")
def salud(authorization: str = Header(default="")):
    _auth(authorization)
    return {"ok": True, "modelo_cargado": True, "adaptador_cargado": True, "modelo_base": BASE, "nombre_modelo": NOMBRE,
            "adaptador": ADAPTADOR.name, "adaptador_sha256": ADAPTADOR_SHA, "dispositivo": DISPOSITIVO, "gpu": GPU,
            "cuda": torch.cuda.is_available(), "torch": torch.__version__, "peft": peft.__version__}


@app.post("/v1/chat/completions")
def chat(body: Chat, authorization: str = Header(default="")):
    _auth(authorization)
    if body.model != NOMBRE:
        raise HTTPException(404, "Modelo no disponible")
    ids = tokenizer.apply_chat_template([m.model_dump() for m in body.messages], add_generation_prompt=True, return_tensors="pt").to(DISPOSITIVO)
    with lock, torch.inference_mode():
        out = model.generate(ids, attention_mask=torch.ones_like(ids), max_new_tokens=body.max_tokens, do_sample=False,
                             pad_token_id=tokenizer.eos_token_id)
    texto = tokenizer.decode(out[0, ids.shape[1]:], skip_special_tokens=True).strip()
    return {"model": NOMBRE, "adapter": ADAPTADOR.name, "adapter_sha256": ADAPTADOR_SHA, "device": DISPOSITIVO,
            "choices": [{"message": {"role": "assistant", "content": texto}}]}


if RUTA_ARRANQUE:
    _entregada = {"si": False}

    @app.get(RUTA_ARRANQUE, response_class=PlainTextResponse)
    def arranque():
        """Entrega la clave generada UNA sola vez; después la ruta deja de existir."""
        if _entregada["si"]:
            raise HTTPException(404)
        _entregada["si"] = True
        log.warning("clave entregada; ruta de arranque desactivada")
        return (AQUI / ".clave-api").read_text()
