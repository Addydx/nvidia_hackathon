"""Servicio de prueba privado. Arrancar con uvicorn en la interfaz local."""
import os
import secrets
from pathlib import Path
from threading import Lock

import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path(__file__).resolve().parent
BASE = os.environ.get("CIERRE_BASE", str(ROOT / ".modelo"))
KEY = os.environ.get("CIERRE_CHAT_KEY", "")
if not KEY:
    raise ValueError("Configura CIERRE_CHAT_KEY")
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
tokenizer = AutoTokenizer.from_pretrained(BASE, local_files_only=True)
base = AutoModelForCausalLM.from_pretrained(
    BASE, local_files_only=True, torch_dtype=torch.float32 if device == "cpu" else torch.float16
)
model = PeftModel.from_pretrained(base, ROOT / "t4" / "adapter").to(device).eval()
lock = Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class Message(BaseModel):
    role: str
    content: str = Field(max_length=4096)


class Chat(BaseModel):
    model: str
    messages: list[Message] = Field(min_length=1, max_length=3)
    max_tokens: int = Field(default=64, ge=1, le=128)


def generate(messages, max_tokens=64):
    tokens = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt").to(device)
    with torch.inference_mode():
        output = model.generate(tokens, attention_mask=torch.ones_like(tokens), max_new_tokens=max_tokens,
                                do_sample=False, pad_token_id=tokenizer.eos_token_id)
    return tokenizer.decode(output[0, tokens.shape[1]:], skip_special_tokens=True).strip()


@app.post("/v1/chat/completions")
def chat(body: Chat, authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization.encode(), ("Bearer " + KEY).encode()):
        raise HTTPException(401)
    if body.model != "corte-lora":
        raise HTTPException(404)
    with lock:
        answer = generate([m.model_dump() for m in body.messages], body.max_tokens)
    return {"model": "corte-lora", "choices": [{"message": {"role": "assistant", "content": answer}}]}
