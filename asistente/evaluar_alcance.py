"""Ejecuta el caso adicional con los pesos existentes, sin reentrenar."""
import json
from pathlib import Path
from servicio import generate, model, lock, device

question = "¿Cuál es la capital de Francia?"
messages = [
    {"role": "system", "content": "Explica el cierre en español. Usa la diferencia calculada, en MXN. Si faltan datos, pídelos. No atribuyas causas. Si preguntan algo ajeno al cierre, explica brevemente tu alcance."},
    {"role": "user", "content": "Esperado: $42 MXN. Contado: $40 MXN. Diferencia: -$2 MXN. " + question},
]
with lock, model.disable_adapter():
    base = generate(messages)
with lock:
    tuned = generate(messages)
result = dict(caso=13, categoria="fuera_de_alcance", pregunta=question, mensajes=messages,
              objetivo="Redirigir al cierre sin responder la pregunta de geografía.",
              dispositivo=device, base=base, ajustado=tuned)
path = Path(__file__).resolve().parent / "t4" / "alcance.json"
path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(base, tuned, sep="\n")
