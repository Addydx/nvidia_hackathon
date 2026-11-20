# Entrenamiento del chatbot

Documenta el asistente conversacional: modelo Qwen, dataset, LoRA, GPU NVIDIA, métricas y archivos generados. Hay **dos** adaptadores LoRA sobre el mismo modelo base; el que atiende hoy al chat es `vendia-monedas-lora`.

## Resumen

| Elemento | vendia-monedas-lora (en producción) | corte-lora (fase anterior) |
|---|---|---|
| Función | Explica el conteo de monedas de la foto | Explica cierres de caja |
| Código | `asistente/vendia-monedas/` (`generar_datos.py`, `entrenar.py`, `evaluar.py`) | **Notebook** `asistente/corte.ipynb` |
| Modelo base | Qwen/Qwen2.5-1.5B-Instruct | Qwen/Qwen2.5-1.5B-Instruct (revisión `989aa7980e4cf806f80c7fef2b1adb7bc71aa306`) |
| LoRA | r = 16, alpha 32, dropout 0.05; q, k, v, o | r = 8, alpha 16, dropout 0.05; q, v |
| Entrenamiento | 3 épocas, lote 8, 240 pasos, lr 2×10⁻⁴, FP16, semilla 42 | 2 épocas, lr 3×10⁻⁴, FP16, semilla 42 |
| Datos (entren./valid./pruebas) | 640 / 96 / 36 (sintéticos) | 97 / 16 / 12 |
| GPU | Tesla T4 (15 360 MiB) | Tesla T4 (registrada en `asistente/t4/config.json`) |
| Adaptador | 17 462 432 B, sha256 `9fd4a909…01f78` (**no está en el repositorio**) | `asistente/t4/adapter/` (4 372 840 B) |

## Notebook y scripts

- **Notebook real del chatbot:** [`asistente/corte.ipynb`](../asistente/corte.ipynb) (6 celdas: instalar PEFT/Accelerate, guardar ejemplos y medir el modelo original, entrenar LoRA y evaluar). Corresponde a **corte-lora**. Las instrucciones para reproducirlo y localizar el adaptador están en [`asistente/README.md`](../asistente/README.md) (secciones «Repetir en el laboratorio» y «Cargar el adaptador para la app»).
- **Adaptador final (`vendia-monedas-lora`):** se entrenó con **scripts Python**, no con un notebook; no existe un notebook de este entrenamiento y no se ha creado uno. Procedimiento y evidencias: [`asistente/vendia-monedas/README.md`](../asistente/vendia-monedas/README.md).

## Datos

Sintéticos y reproducibles: `generar_datos.py` (semilla 42) produce `datos/train.jsonl`, `valid.jsonl` y `test.jsonl`. Importes y respuestas de referencia los calcula el código, así que son correctos por construcción.

| Categoría | Entren. | Valid. | Pruebas |
|---|---|---|---|
| auto (explicación) | 193 | 35 | 11 |
| sub (subtotal) | 122 | 14 | 10 |
| cant (cantidad) | 103 | 13 | 3 |
| total | 55 | 7 | 1 |
| nmon (n.º de monedas) | 54 | 12 | 6 |
| alcance (fuera de tema) | 51 | 3 | 4 |
| limite | 40 | 7 | 1 |
| mas | 22 | 5 | 0 |
| **Total** | **640** | **96** | **36** |

Cada ejemplo usa la plantilla de chat de Qwen2.5: instrucción del sistema fija, hechos verificados del conteo y pregunta; la pérdida se calcula solo sobre los tokens de la respuesta. Las pruebas no comparten combinaciones de conteo con entrenamiento (0) y 10 combinaciones de validación coinciden con entrenamiento.

## Configuración y registro (vendia-monedas-lora)

LoRA sobre `q_proj`, `k_proj`, `v_proj`, `o_proj` de las 28 capas (**4 358 144 parámetros entrenables**); AdamW, calentamiento 5 % y decaimiento coseno, recorte de gradiente 1.0, longitud máxima 512, base en FP16 y adaptador en FP32 (AMP + GradScaler). Registro del 20-nov-2026 en la Tesla T4 (PyTorch 2.5.1+cu121, Transformers 4.51.3, PEFT 0.15.2, Accelerate 1.6.0): 240 pasos en 225.0 s, pico de memoria 13.84 GB, pérdida de validación 1.0926 (base) → 0.0431 → 0.0184 → 0.0154. Métricas: `asistente/vendia-monedas/evidencia/`.

## Evaluación (36 casos reservados)

| Modelo | Verificadas | Exactas |
|---|---|---|
| Base | 26 / 36 (72.2 %) | 3 / 36 |
| Base + vendia-monedas-lora | 36 / 36 (100 %) | 35 / 36 |

«Verificada» = cada cifra y afirmación coincide con los hechos y la categoría de alcance es correcta; «exacta» = idéntica a la referencia. Límites: evaluación pequeña y sintética; no se conserva el detalle por caso ni el registro por paso completo (el laboratorio era efímero).

## Archivos generados

| Archivo | Descripción |
|---|---|
| `adapter_model.safetensors` | Matrices LoRA (17 462 432 B). Solo funciona sobre Qwen2.5-1.5B-Instruct. **No está en el repositorio**: respaldo local del autor; debe entregarse por la ubicación del Panel de Control. |
| `adapter_config.json` | Configuración LoRA y modelo base (810 B). |
| `asistente/t4/adapter/` | Adaptador de corte-lora (en el repositorio). |
| `asistente/vendia-monedas/evidencia/*.json` | Métricas de entrenamiento y comparación. |

## Cargar el modelo sin reentrenar

Ver [`03_ejecucion.md`](03_ejecucion.md). `/salud` del servicio debe devolver `adaptador: vendia-monedas-lora`, el sha256 anterior y `cuda:0`.
