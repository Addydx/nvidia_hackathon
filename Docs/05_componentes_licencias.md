# Componentes, herramientas de IA y licencias

Procedencia, fuentes y licencias de lo que VendIA reutiliza. Las licencias marcadas «no verificada» proceden de la documentación pública del proyecto y deben confirmarse antes de la entrega.

## Modelos y pesos

| Componente | Procedencia | Licencia | Uso |
|---|---|---|---|
| YOLO11n (`yolo11n.pt`) | Ultralytics (preentrenado) | AGPL-3.0 o Enterprise (según el documento de visión) | Base del detector de monedas, exportado a ONNX. |
| Modelo ONNX de monedas (`monedad.onnx`) | Ajuste propio de YOLO11n con monedas mexicanas | Hereda la del modelo base (AGPL-3.0) | Servicio `vision/`. Los pesos no están en el repositorio. |
| Qwen2.5-1.5B-Instruct | Equipo Qwen, Alibaba Cloud (Hugging Face `Qwen/Qwen2.5-1.5B-Instruct`) | Apache 2.0 (tarjeta del modelo; no verificada) | Modelo base del asistente. |
| `vendia-monedas-lora` / `corte-lora` | Adaptadores LoRA entrenados por el equipo sobre Qwen | Dependen del modelo base | Asistente conversacional. |

## Datos

| Conjunto | Procedencia | Notas |
|---|---|---|
| Monedas mexicanas (visión) | Roboflow Universe, proyecto `custom_monedas_detector.v4i.coco` (803 imágenes, 1 327 anotaciones) | **Licencia del dataset no verificada**; confirmar en Roboflow. |
| Datos del asistente | **Sintéticos**, generados por `asistente/vendia-monedas/generar_datos.py` (semilla 42) | Sin datos de usuarios; revisados mediante el verificador de importes. |

## Bibliotecas relevantes

| Biblioteca | Uso | Licencia (no verificada salvo indicación) |
|---|---|---|
| Next.js, React | Web | MIT |
| `@supabase/supabase-js` | Auth y base de datos | MIT |
| Stripe (`stripe`), `qrcode` | Cobros y QR | MIT |
| TypeScript | Lenguaje | Apache 2.0 |
| ESLint, Vitest | Calidad y pruebas | MIT |
| FastAPI, Uvicorn | Servicios Python | MIT / BSD-3 |
| onnxruntime | Inferencia ONNX en CPU | MIT |
| Ultralytics | Carga del modelo YOLO en `vision/` | AGPL-3.0 |
| Pillow | Lectura de imágenes | HPND |
| PyTorch | Entrenamiento e inferencia del asistente | BSD-3 |
| Transformers, PEFT, Accelerate | Qwen y LoRA | Apache 2.0 |

Nota para el equipo: Ultralytics y los pesos YOLO11 son AGPL-3.0; revisar las obligaciones de esa licencia al distribuir el servicio de visión.

## Componentes preexistentes y trabajo del hackathon

- **Preexistentes declarados:** pesos preentrenados YOLO11n y Qwen2.5-1.5B-Instruct; las bibliotecas anteriores.
- **Trabajo del equipo (repositorio):** aplicación Next.js, servicios FastAPI, generación del dataset sintético, scripts de entrenamiento y evaluación del adaptador, verificador de importes e integración.
- **Pendiente de revisión del equipo:** confirmar qué parte del ajuste y de la integración se realizó dentro de las 24 horas del concurso (las bases no permiten presentar como entrenamiento del concurso un ajuste previo). El historial de git empieza el 19-nov-2026.

## Declaración del uso de IA

> «Para la elaboración de este trabajo se utilizó **Claude Code (modelo Claude Sonnet 5.5), de Anthropic,** como apoyo en la **implementación y revisión de código, la generación y verificación del dataset sintético, la ejecución del entrenamiento y la evaluación del adaptador LoRA en el laboratorio NVIDIA, el diseño de la interfaz y la redacción de la documentación técnica**. Quienes firman este trabajo han revisado y editado el contenido, verificado las fuentes y asumen plena responsabilidad por la versión final.»

**Datos verificables:** los commits del repositorio llevan la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. La rama remota `codex/asistente-cierre` sugiere el uso de otra herramienta en la fase corte-lora.

**Pendiente para el equipo (completar antes de entregar):**

- [ ] Confirmar y listar **todas** las herramientas de IA usadas (incluida la de la rama `codex/asistente-cierre`, si aplica) y sus compañías.
- [ ] Revisar y editar el texto anterior.
- [ ] Nombre y firma del líder de equipo: ______________________  Fecha: ____________
