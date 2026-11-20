# Configuración

Requisitos, dependencias, versiones, variables de entorno y configuración de VendIA. Distingue **desarrollo local**, **laboratorio NVIDIA** y **producción**. Ninguna clave aparece aquí: todas se leen de variables de entorno o de un Secret.

## Requisitos

| Entorno | Requisito | Versión verificada |
|---|---|---|
| Local / producción (web) | Node.js | 22 (la imagen usa `node:22-slim`; local: v22.19.0) |
| Local / producción (visión y asistente) | Python | 3.12 (indicado en `asistente/README.md`) |
| Laboratorio NVIDIA | GPU NVIDIA con CUDA | Tesla T4, controlador 545.23.08, CUDA 12.3 |
| Laboratorio NVIDIA | PyTorch / Transformers / PEFT / Accelerate | 2.5.1+cu121 / 4.51.3 / 0.15.2 / 1.6.0 |
| Cuentas y base de datos | Proyecto Supabase (PostgreSQL + Auth) | Migraciones en `supabase/migrations/` |

## Dependencias

**Aplicación web** (`package.json`): Next.js 16.4.6, React 19.3.0, `@supabase/supabase-js` ^2.119.2, `stripe` ^23.2.0, `qrcode` ^1.5.4; desarrollo: TypeScript ^5, ESLint ^9, Vitest ^5.1.1.

```bash
npm install            # instala las dependencias de la web
npm test               # pruebas (Vitest)
npm run lint && npm run build
```

**Servicio de visión** (`vision/requirements.txt`): fastapi ≥ 0.115, uvicorn[standard] ≥ 0.30, python-multipart ≥ 0.0.9, pillow ≥ 10, ultralytics ≥ 8.3, onnxruntime ≥ 1.18.

**Servicio del asistente** (`asistente/requirements.txt`, versiones fijadas): torch 2.5.1, transformers 4.51.3, peft 0.15.2, accelerate 1.6.0, fastapi 0.165.0, uvicorn 0.54.0.

## Variables de entorno

Solo se usan en el servidor (nunca con prefijo `NEXT_PUBLIC_`). Plantilla: `.env.example`; en local se copian a `.env.local` (ignorado por git).

| Variable | Obligatoria | Uso |
|---|---|---|
| `SUPABASE_URL` | Sí | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Escrituras del servidor (RLS sin políticas para `anon`). |
| `SUPABASE_ANON_KEY` | Sí | Inicio de sesión, registro y token de usuario (Supabase Auth). |
| `APP_URL` | Sí | URL pública de la app (enlaces de correos de Auth). |
| `VISION_API_URL` | Sí | Base del servicio de visión (`http://127.0.0.1:8000` en local; `http://vision:8000` en el clúster). |
| `CIERRE_CHAT_URL` | No | Endpoint del asistente (`…/v1/chat/completions`). Vacío = la app usa solo el resumen determinista. |
| `CIERRE_CHAT_KEY` | No | Clave Bearer del asistente. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_OWNER_EMAILS` | Solo para cobros | Cobros con Stripe; sin `STRIPE_OWNER_EMAILS` nadie cobra. |
| `STRIPE_CONNECT_ENABLED`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Opcional | Stripe Connect (desactivado por defecto). |
| `CAJA_STORE=memory` | Solo desarrollo | Almacén en memoria; deshabilitado con `NODE_ENV=production`. |

Servicio de visión (variables del proceso Python): `MODEL_PATH` (por defecto `vision/models/monedad.onnx`) y `VISION_DEVICE` (por defecto `cpu`).
Servicio del asistente (proceso Python): `VENDIA_BASE` (por defecto `Qwen/Qwen2.5-1.5B-Instruct`), `VENDIA_ADAPTADOR` (ruta del adaptador), `VENDIA_API_KEY` (si falta se genera una al arrancar) y `VENDIA_PERMITIR_CPU=1` (solo pruebas sin GPU).

## Configuración por entorno

| Aspecto | Desarrollo local | Laboratorio NVIDIA | Producción |
|---|---|---|---|
| Web | `npm run dev` (puerto 3000) | — | Imagen `ghcr.io/addydx/nvidia-hackathon-web` en K3s |
| Visión (ONNX) | `uvicorn` en `vision/` (CPU) | — | Imagen `…-vision` en K3s; modelo montado en `/models/monedad.onnx` |
| Asistente (Qwen + LoRA) | Opcional (`VENDIA_PERMITIR_CPU=1`) | `uvicorn servicio_monedas:app` en la T4 (127.0.0.1:8001) | Next.js lo llama por un túnel HTTPS (limitación: ver `04_arquitectura.md`) |
| Secretos | `.env.local` | Clave del servicio en archivo local (modo 600) | Secret de Kubernetes `hackathon-env` |
| Dominio | `http://localhost:3000` | IP del laboratorio (sin dominio) | `https://nvidia.addydx.com` |

## Base de datos

Aplica en orden los SQL de `supabase/migrations/` (caja, cierre, eliminar_caja, cuentas, perfiles_y_memoria, conteos, cobros). Detalles de despliegue y recuperación: `deploy/README.md`.
