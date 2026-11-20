# Corte de caja

PWA para vendedores ambulantes. Hoy incluye **Caja** (abrir caja, ventas en efectivo, efectivo esperado) y, en **Cierre**, la captura de una foto y el conteo de monedas ($1, $2, $5, $10) que devuelve el modelo de visión. La documentación del equipo está en [`Docs/`](Docs).

## Documentación técnica (hackathon NVIDIA Oaxaca 2026)

| Documento | Contenido |
|---|---|
| [`Docs/01_configuracion.md`](Docs/01_configuracion.md) | Requisitos, dependencias, versiones, variables de entorno y configuración |
| [`Docs/02_entrenamiento_chat.md`](Docs/02_entrenamiento_chat.md) | Qwen + LoRA: dataset, GPU NVIDIA, métricas y archivos generados |
| [`Docs/03_ejecucion.md`](Docs/03_ejecucion.md) | Cómo iniciar VendIA, cargar ONNX y Qwen y comprobar los servicios |
| [`Docs/04_arquitectura.md`](Docs/04_arquitectura.md) | Next.js, Supabase, ONNX, FastAPI, Qwen y NVIDIA |
| [`Docs/05_componentes_licencias.md`](Docs/05_componentes_licencias.md) | Componentes, herramientas de IA, fuentes y licencias |
| [`Docs/06_funcionalidades.md`](Docs/06_funcionalidades.md) | Funciones implementadas, simuladas, pendientes y limitaciones |

Versiones Word: [`VendIA_Documentacion_Tecnica.docx`](Docs/entregables/VendIA_Documentacion_Tecnica.docx) y [`VendIA_Entrenamiento_y_Estado.docx`](Docs/entregables/VendIA_Entrenamiento_y_Estado.docx).
Cuaderno del chatbot (corte-lora): [`asistente/corte.ipynb`](asistente/corte.ipynb). El adaptador final `vendia-monedas-lora` se entrenó con los scripts de [`asistente/vendia-monedas/`](asistente/vendia-monedas/README.md).

Stack: Next.js (App Router) + TypeScript + Supabase PostgreSQL. Importes en **centavos enteros**; todas las escrituras pasan por Route Handlers del servidor con la service role key (nunca llega al navegador).

## Ejecutar

```bash
npm install
cp .env.example .env.local   # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y VISION_API_URL
npm run dev                  # http://localhost:3000
```

### Configurar Supabase

1. Crea un proyecto en Supabase.
2. Aplica [`supabase/migrations/20261119000000_caja.sql`](supabase/migrations/20261119000000_caja.sql) (SQL Editor, o `supabase db push` con la CLI).
3. Pon `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` (ignorado por git).

Las tablas tienen RLS activo y sin políticas: solo el servidor (service role) puede leer o escribir.

### Modo local sin Supabase (solo desarrollo)

`CAJA_STORE=memory npm run dev` usa un almacén en memoria (se pierde al reiniciar el servidor; deshabilitado con `NODE_ENV=production`).

## Diseño

- `POST /api/caja/abrir` abre caja (una sola abierta a la vez, garantizado por índice único parcial).
- `POST /api/caja/ventas` guarda una venta. El **id lo genera el cliente** y es la llave primaria: `INSERT … ON CONFLICT DO NOTHING`, así reintentar nunca duplica. Mismo id con otro importe → 409.
- `GET /api/caja` devuelve caja, ventas y efectivo esperado (= cambio inicial + ventas guardadas).
- Si el guardado falla, el importe se conserva (también en `localStorage`, sobrevive a recargas) y «Reintentar» reenvía el mismo id. «Venta guardada» aparece solo tras la confirmación del servidor. Al cargar, un pendiente que el servidor ya tiene se reconcilia sin duplicar.

## Cierre: foto y conteo

El servicio Python vive en [`vision/`](vision/README.md) (`uvicorn app.main:app --port 8000`; necesita `vision/models/monedad.onnx`). Configura `VISION_API_URL=http://127.0.0.1:8000` en `.env.local`.

- Pantalla `/cierre`: «Tomar foto» (cámara) y «Elegir foto», vista previa y «Analizar foto».
- El navegador envía `multipart/form-data` con el campo `foto` a `POST /api/cierre/analizar`. Esa ruta valida (imagen, máx. 10 MB) y reenvía la foto, también como campo `foto`, a `POST {VISION_API_URL}/contar-monedas`. `VISION_API_URL` solo existe en el servidor.
- Respuesta esperada de Python: JSON con las cuatro denominaciones como enteros, p. ej. `{"1": 4, "2": 3, "5": 2, "10": 1}` (también acepta un objeto envolvente `conteo`/`monedas` y llaves como `"$1"`). Si la forma no coincide se muestra un error claro y nunca un conteo inventado. Ver [`src/lib/vision.ts`](src/lib/vision.ts).
- Si Python falla o no está, la foto se conserva y el botón cambia a «Reintentar».

## Pruebas

```bash
npm test        # vitest: importes, servicio, idempotencia, concurrencia
npm run lint && npm run build
```

Ver el resumen de resultados de validación en la entrega de la fase.

## Pendiente

- Validar contra un proyecto Supabase real (ver arriba).
- Probar `/cierre` con `monedad.onnx` y una foto de monedas mexicanas de conteo manual conocido y comparar los cuatro conteos.
- No hay service worker/offline todavía; solo manifest instalable.
- El diseño de Stitch no se pudo consultar (requiere sesión); se siguió la paleta indicada (carbón, verde lima, rojo).
