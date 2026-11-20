# Ejecución

Cómo iniciar VendIA, cargar ONNX y Qwen y comprobar los servicios. Cada bloque indica **dónde** ejecutarlo.

## Desarrollo local (tu equipo)

**Visión (ONNX)** — terminal 1, carpeta `vision/`. Requiere el archivo `vision/models/monedad.onnx` (los pesos están ignorados por git: copia el tuyo o `MODEL_PATH=/ruta/modelo.onnx`).

```bash
cd vision
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/salud        # debe devolver "modelo_cargado": true
```

**Web (Next.js)** — terminal 2, raíz del repositorio:

```bash
npm install
cp .env.example .env.local              # completa SUPABASE_* y VISION_API_URL=http://127.0.0.1:8000
npm run dev                             # http://localhost:3000
```

Sin Supabase, solo para desarrollo: `CAJA_STORE=memory npm run dev`. Sin `CIERRE_CHAT_URL` el asistente responde con el resumen determinista.

**Verificación del código:** `npm test`, `npm run lint`, `npm run build`; visión: `cd vision && .venv/bin/pytest` (requiere `requirements-dev.txt`).

## Laboratorio NVIDIA (Tesla T4, terminal de JupyterLab)

Qwen + LoRA no se ejecutan en la web: viven en el servicio `asistente/servicio_monedas.py` (FastAPI, exige CUDA).

```bash
# Si falta el adaptador, súbelo (JupyterLab → Upload) a …/vendia/vendia-monedas-lora/
cd /dli/task/my_assessment/hackathon/vendia && source /dli/task/vendia-env/bin/activate
rm -f .clave-api                         # solo si quieres una clave nueva
nohup python -m uvicorn servicio_monedas:app --host 127.0.0.1 --port 8001 > servicio.log 2>&1 &
grep -o "/arranque/[A-Za-z0-9_-]*" servicio.log    # ruta de arranque: entrega la clave UNA sola vez
```

Si no definiste `VENDIA_API_KEY`, el servicio genera la clave, la guarda en `.clave-api` (modo 600) y la entrega una vez por esa ruta. **No la publiques ni la subas a git.** Comprobación (con la clave en la variable `CLAVE`):

```bash
curl -s -H "Authorization: Bearer $CLAVE" http://127.0.0.1:8001/salud
# esperado: adaptador=vendia-monedas-lora, adaptador_sha256=9fd4a909…01f78, dispositivo=cuda:0, gpu=Tesla T4
```

Reentrenar (solo si se perdió el adaptador): `python generar_datos.py && python entrenar.py && python evaluar.py` en `asistente/vendia-monedas/` (≈ 4 min en la T4).

## Conectar la web con el modelo del laboratorio

El laboratorio no recibe conexiones entrantes. Se usó un túnel HTTPS **saliente** de `cloudflared` hacia `127.0.0.1:8001` (nunca hacia JupyterLab):

```bash
nohup cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8001 > cf.log 2>&1 &
grep -o "https://[a-z0-9-]*\.trycloudflare\.com" cf.log | head -1
```

Con esa URL, define en el servidor de la web `CIERRE_CHAT_URL=https://<túnel>/v1/chat/completions` y `CIERRE_CHAT_KEY=<clave>`. **El túnel es temporal** (ver `04_arquitectura.md`): cambia en cada arranque.

## Producción (K3s en server-home)

La web y la visión se publican como imágenes con GitHub Actions al hacer push a `main` (`.github/workflows/images.yml`). Despliegue (en server-home):

```bash
export KUBECONFIG=~/.kube/hackathon.kubeconfig
k3s kubectl -n hackathon set image deploy/web '*=ghcr.io/addydx/nvidia-hackathon-web:sha-<commit>'
k3s kubectl -n hackathon rollout status deploy/web
```

Actualizar el modelo ONNX, el Secret o volver atrás: `deploy/README.md`.

## Comprobaciones de extremo a extremo

| Qué | Cómo | Esperado |
|---|---|---|
| Visión | `curl http://127.0.0.1:8000/salud` | `modelo_cargado: true` |
| Asistente (laboratorio) | `/salud` con Bearer | adaptador `vendia-monedas-lora`, `cuda:0` |
| Autenticación | `curl` a `/salud` sin cabecera | 401 |
| Aplicación | Subir una foto en `/` | Total y chat; la etiqueta del chat dice «Responde con el modelo de NVIDIA» o «Resumen calculado en la app» |
