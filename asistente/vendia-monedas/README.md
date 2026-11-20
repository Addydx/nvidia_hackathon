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

## Conexión con la app (VERIFICADA 2026-11-20)
Next.js → `CIERRE_CHAT_URL` (`https://<túnel>.trycloudflare.com/v1/chat/completions`) + `CIERRE_CHAT_KEY` (Bearer), ambos solo
en el Secret `hackathon-env` del namespace `hackathon`. El túnel apunta SOLO a `127.0.0.1:8001` (nunca a JupyterLab).
`/salud` confirma `adaptador: vendia-monedas-lora`, `dispositivo: cuda:0`, `gpu: Tesla T4`, y el sha256 del adaptador.
La app descarta respuestas de otro adaptador o con cifras no verificadas y usa el resumen determinista (`origen: "resumen"`).

### Respaldo
Adaptador + config en `~/vendia-respaldo/` (Mac del autor, modo 700). sha256 `9fd4a909…01f78`, 17,462,432 B.

### Recuperar el servicio (si el laboratorio se apagó o se reinició)
Sin el adaptador en el laboratorio: subir `vendia-monedas-lora/` a `/dli/task/my_assessment/hackathon/vendia/` (JupyterLab → Upload)
o reentrenar con `python entrenar.py`. Luego, en una terminal del laboratorio:
```bash
cd /dli/task/my_assessment/hackathon/vendia && source /dli/task/vendia-env/bin/activate
rm -f .clave-api && nohup python -m uvicorn servicio_monedas:app --host 127.0.0.1 --port 8001 > servicio.log 2>&1 &
# ruta de arranque (entrega la clave UNA vez):  grep -o "/arranque/[A-Za-z0-9_-]*" servicio.log
nohup /dli/task/cf/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8001 > cf.log 2>&1 &
grep -o "https://[a-z0-9-]*\.trycloudflare\.com" cf.log | head -1       # URL nueva del túnel
```
Después, actualizar `CIERRE_CHAT_URL` y `CIERRE_CHAT_KEY` en el Secret y reiniciar: 
`kubectl -n hackathon rollout restart deploy/web`.

### Limitaciones
- El laboratorio DLI es efímero y el túnel «quick» de Cloudflare no tiene SLA: la URL cambia en cada arranque y caduca al
  cerrar `cloudflared` o apagarse el laboratorio. Para algo estable: túnel con nombre (cuenta Cloudflare) o host propio con GPU.
- Con el laboratorio apagado la app sigue funcionando: muestra el resumen determinista con las mismas cifras
  (`origen: "resumen"`, sin etiqueta de modelo) y nunca lo presenta como inferencia de NVIDIA.
