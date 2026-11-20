# VendIA · asistente de monedas (LoRA)

Asistente conversacional que explica **solo** el conteo de monedas MXN ($1, $2, $5, $10) detectado en una foto.
El código calcula subtotales y total (hechos verificados); el modelo únicamente los redacta. Toda respuesta pasa por
`verificar` (cifras y afirmaciones); si falla o el servicio no responde, la app muestra un resumen determinista.

## Entrenamiento (verificado en NVIDIA Tesla T4)
- Base: `Qwen/Qwen2.5-1.5B-Instruct`; LoRA (4,358,144 parámetros entrenables), fp16, semilla 42.
- Datos sintéticos reproducibles: `generar_datos.py` → `datos/{train,valid,test}.jsonl` (640 / 96 / 36).
- 240 pasos, 225 s; pérdida de validación 1.0926 (base) → 0.0154. Pico de memoria 13.84 GB.
- Pruebas reservadas (36), respuestas verificadas: **base 26/36 (72.2 %) → ajustado 36/36 (100 %)**; exactas 3 → 35.
  Detalle por tipo en `evidencia/metricas_comparacion.json`.
- El adaptador (`adapter_model.safetensors`, 17,462,432 B, sha256 `9fd4a909…01f78`) vive en el laboratorio DLI, que es
  **efímero**; no está en el repo (pendiente de descargar con permiso). Se reproduce con `entrenar.py` (~4 min en T4).

## Servicio
`asistente/servicio_monedas.py` (FastAPI, CUDA): `/v1/chat/completions` y `/salud`, ambos con `Authorization: Bearer`.
Responde `adapter: "vendia-monedas-lora"`; la app rechaza respuestas de otro adaptador.
Variables: `VENDIA_BASE`, `VENDIA_ADAPTADOR`, `VENDIA_API_KEY` (la clave solo en servidor).

## Reiniciar el modelo en el laboratorio
```bash
cd /dli/task/my_assessment/hackathon/vendia
source /dli/task/vendia-env/bin/activate
python entrenar.py && python evaluar.py            # solo si falta el adaptador
VENDIA_API_KEY=$(cat .clave-api) uvicorn servicio_monedas:app --host 127.0.0.1 --port 8001
```

## Conexión con la app (estado: PENDIENTE)
La app usa `CIERRE_CHAT_URL` / `CIERRE_CHAT_KEY` (solo servidor). El laboratorio no acepta conexiones entrantes y no se
publicó el puerto ni se usó un túnel sin autorización. Opciones: túnel HTTPS autenticado (los «quick tunnels» caducan al
cerrarse el proceso y no tienen SLA) o ejecutar el servicio en un host propio con GPU. Mientras tanto la app usa el
resumen determinista (`origen: "resumen"`), con las mismas cifras.
