# Preguntar sobre mi cierre

Después de confirmar un cierre, pulsa **Preguntar sobre mi cierre**. El botón pregunta qué pasó y por qué. El navegador envía el identificador del cierre. Next.js verifica la sesión con el módulo de cuentas y busca el cierre unido a una caja de ese usuario en Supabase. Solo envía a la GPU el efectivo esperado, el contado y la diferencia guardada. Si falta un dato, lo pide por nombre.

La respuesta visible usa una frase comprobada contra la diferencia. Si el modelo añade una causa, cambia el signo, devuelve otra redacción o tarda más de 15 segundos, el servidor construye la frase a partir de los centavos guardados. La prueba de calidad de abajo evalúa las salidas crudas de Qwen antes de esta comprobación.

## Repetir en el laboratorio

1. En JupyterLab abre **Upload Files**, selecciona **corte.ipynb** y comprueba el nombre en el diálogo. Abre el notebook con Python 3 y una T4 disponible.
2. Ejecuta **Run → Run All Cells**. La primera celda prepara PEFT y Accelerate. El laboratorio usado tenía Python 3.10.12, PyTorch 2.5.1+cu121, Transformers 4.51.3, PEFT 0.15.2 y Accelerate 1.6.0. El modelo base debe estar en la caché local o disponible para descargar.
3. La segunda etapa guarda 97 ejemplos de entrenamiento, 16 de validación y 12 preguntas reservadas, con dinero en centavos. Guarda cada respuesta base en cuanto se genera. El caso de $3 es una regresión conocida por el equipo. El patrón de dos datos ausentes aparece en entrenamiento con otra pregunta.
4. La última etapa entrena dos épocas con FP16, semilla 42 y LoRA de rango 8 en las proyecciones Q y V. Solo entrena con los tokens de respuesta. Después mide pérdida con validación y repite las 12 preguntas con idéntica generación determinista y límite de 64 tokens.
5. Descarga el ZIP en la carpeta corte_runs. Incluye ejemplos, respuestas, configuración, registro, tokenizador y adaptador. La ejecución documentada fue 20261120-082440. La carpeta t4 de este PR contiene los archivos de esa ejecución necesarios para evaluar y cargar LoRA. El tokenizador también se puede leer del modelo base.

## Qué cambió en los 12 casos

Revisión manual de base.json y ajustado.json. Cada celda muestra base → LoRA. **Importe** comprueba si aparece el valor absoluto de la diferencia en pesos, independientemente del signo. **Resultado** exige una explicación clara de faltante, sobrante o igualdad sin contradicciones. En los casos incompletos exige identificar todos los datos que faltan. **Causa** marca con × una explicación que atribuye o descarta un motivo sin evidencia. Los errores adicionales se describen debajo.

| Caso | Esperado / contado (MXN) | Importe | Resultado | Causa sin respaldo |
|---|---|---|---|---|
| 1 | 30 / 27 | ✓ → ✓ | × → ✓ | — → — |
| 2 | 105.25 / 100 | ✓ → ✓ | × → ✓ | × → — |
| 3 | 5 / 0 | ✓ → ✓ | ✓ → × | × → — |
| 4 | 125 / 126 | ✓ → ✓ | × → ✓ | × → — |
| 5 | 99.99 / 100 | ✓ → ✓ | × → × | × → × |
| 6 | 0 / 25 | ✓ → ✓ | ✓ → ✓ | — → — |
| 7 | 0 / 0 | ✓ → ✓ | ✓ → ✓ | — → — |
| 8 | 91 / 91 | ✓ → ✓ | × → × | — → — |
| 9 | 45.75 / 45.75 | ✓ → ✓ | ✓ → ✓ | — → — |
| 10 | ausente / 80 | n/a | ✓ → ✓ | — → — |
| 11 | 300 / ausente | n/a | × → ✓ | — → — |
| 12 | ambos ausentes | n/a | ✓ → × | — → — |

Ambos mencionaron la magnitud exacta en 9/9 casos completos. El resultado correcto pasó de 4/9 a 6/9 y ambos identificaron los datos faltantes en 2/3 casos. Las respuestas con causas sin respaldo pasaron de 4/12 a 1/12. En el caso 8 el base sitúa ambos importes en cero y afirma que el pago tuvo éxito. El ajustado dice que el cierre es nulo. En el caso 5 el ajustado descarta un error de cambio sin evidencia y afirma que los importes coinciden. En el caso 3 el ajustado invierte el signo. Con los datos de prueba y el mismo criterio, la respuesta textual coincide con el objetivo en 0/12 y 7/12, respectivamente.

## Cargar el adaptador para la app

El adaptador está en **asistente/t4/adapter**. En un servidor de inferencia privado con GPU y una instalación de vLLM compatible con su controlador, ejecuta desde la raíz del repo el siguiente ejemplo. La clave se suministra en el entorno del servidor.

```sh
vllm serve Qwen/Qwen2.5-1.5B-Instruct \
  --revision 989aa7980e4cf806f80c7fef2b1adb7bc71aa306 \
  --dtype half --max-model-len 512 --enable-lora \
  --lora-modules corte-lora=asistente/t4/adapter \
  --host 127.0.0.1 --port 8001 --api-key "$CIERRE_CHAT_KEY"
```

Configura **CIERRE_CHAT_URL** solo en el servidor Next.js con la URL completa del servicio, por ejemplo http://127.0.0.1:8001/v1/chat/completions si ambos procesos comparten máquina y red. Para máquinas distintas usa la dirección privada protegida correspondiente. Guarda **CIERRE_CHAT_KEY** en el gestor de secretos del despliegue o en .env.local para desarrollo. El nombre solicitado al servicio es corte-lora. Este PR incluye el adaptador y la conexión opcional. El despliegue de ese servicio queda pendiente. [Carga de adaptadores en vLLM](https://docs.vllm.ai/en/stable/features/lora/).

## Verificar la integración

Con Node 22, ejecuta npm test y npm run build. Las pruebas envían solicitudes al manejador real de Next.js, simulan la sesión y la respuesta HTTP de Supabase, y comprueban los filtros del cliente real. Cubren cuenta propietaria, otra cuenta, ausencia de sesión, importes falsos enviados por el navegador y una respuesta incorrecta del servicio del modelo. La migración de cuentas de Claude debe estar aplicada en el entorno donde se use el botón.
