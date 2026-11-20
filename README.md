# Corte de caja

PWA para vendedores ambulantes. Hoy incluye **Caja** (abrir caja, ventas en efectivo, efectivo esperado) y, en **Cierre**, la captura de una foto y el conteo de monedas ($1, $2, $5, $10) que devuelve el modelo de visión. La documentación del equipo está en [`Docs/`](Docs).

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

El servicio Python vive en [`vision/`](vision/README.md) (`uvicorn app.main:app --port 8000`; necesita `vision/models/best.pt`). Configura `VISION_API_URL=http://127.0.0.1:8000` en `.env.local`.

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
- Probar `/cierre` con `best.pt` real y una foto de conteo manual conocido y comparar los cuatro conteos.
- No hay service worker/offline todavía; solo manifest instalable.
- El diseño de Stitch no se pudo consultar (requiere sesión); se siguió la paleta indicada (carbón, verde lima, rojo).
