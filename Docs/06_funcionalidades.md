# Funcionalidades

Estado de cada función: **implementada** (existe en el código y se probó), **simulada**, **pendiente**. Última verificación: 20-nov-2026.

## Implementadas

| Función | Detalle | Evidencia |
|---|---|---|
| Foto → conteo de monedas | `/api/cierre/analizar` + servicio ONNX; denominaciones $1, $2, $5, $10 | `vision/`, `src/lib/vision.ts` |
| Corrección manual | Campos editables y botones + / −; el usuario revisa antes de guardar | `src/components/Contar.tsx` |
| Total determinista | Subtotales y total calculados por código | `src/lib/monedas-asistente.ts` |
| Guardar conteo e historial | Supabase (cuentas) o `sessionStorage` (invitado) | `/api/conteos`, migraciones |
| Cuentas y modo invitado | Supabase Auth por correo; datos aislados por usuario (RLS) | `/api/auth/*` |
| Asistente conversacional | Chat con el conteo real; el modelo redacta, el código verifica cada cifra | `asistente/`, `src/components/AsistenteMonedas.tsx` |
| Fallback determinista | Resumen por código si el asistente falla | `respuestaAuto` |
| Voz | `speechSynthesis` es-MX, «Escuchar resultado» y «Detener» | `src/lib/voz.ts` |
| Orientación sin detecciones y errores diferenciados | Cero monedas, imagen inválida, servicio y conexión | `Contar.tsx` |
| Valoración del conteo | «¿El conteo fue correcto?» con tipos de error | `RetroConteo.tsx` |
| Caja, ventas y cobros | Caja por usuario; cobros con Stripe Checkout y QR | `/api/caja/*`, `/api/cobros` |

## Simuladas o parciales

| Función | Estado |
|---|---|
| Inferencia del asistente en NVIDIA desde producción | Funcionó mediante un túnel temporal; hoy depende de restaurarlo. Sin él, el asistente muestra el resumen determinista (no es el modelo). |
| Cobros con Stripe | Dependen de claves, webhook y Cloudflare Access configurados fuera del repositorio; Stripe Connect está desactivado por defecto. |
| Valoración del conteo | Se guarda **solo en la sesión de la pestaña**; no se persiste en Supabase y no reentrena el modelo. |

## Pendientes

- Persistir la valoración en Supabase (requiere migración y cambios en los repositorios de datos).
- Disponibilidad estable del asistente (túnel con nombre o servidor con GPU propio).
- Recuperación de contraseña (desactivada hasta configurar SMTP).
- Almacenamiento remoto versionado del adaptador `vendia-monedas-lora`.
- Service worker/offline (solo manifest instalable).

## Limitaciones

- El adaptador final se evaluó con 36 casos sintéticos; no hay evaluación con preguntas de usuarios reales.
- El asistente solo explica conteos de monedas MXN; no reconoce objetos ni calcula importes.
- No se conservan el registro por paso completo ni el detalle por caso del último entrenamiento (laboratorio efímero).
- El notebook `asistente/corte.ipynb` corresponde a corte-lora; el adaptador final se entrenó con scripts.
- El detector de visión y su entrenamiento no tienen notebook ni pesos en el repositorio (`vision/models/` vacío); documentación en el documento de visión del equipo.
