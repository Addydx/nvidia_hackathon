# Preguntar sobre mi cierre

Después de confirmar un cierre, escribe una pregunta de hasta 240 caracteres en **Preguntar sobre mi cierre**. El navegador envía el identificador y la pregunta. Next.js verifica la sesión, consulta el cierre y su caja por propietario, y envía al servicio privado la pregunta y los tres importes guardados.

El panel muestra siempre el esperado, el contado y la diferencia con signo. **Respuesta de Qwen** identifica texto generado por el modelo. El servidor comprueba cada frase y su relación con los datos solicitados. Puede aceptar varias maneras de expresar un importe. Cuando una frase no se puede verificar, faltan datos o falla el servicio, aparece **Resumen automático**. Los importes proceden de Caja en ambos casos.

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

El adaptador entrenado está en **asistente/t4/adapter**. El servidor privado de prueba carga ese directorio con PEFT y selecciona CUDA, Metal en Mac o CPU según el equipo. El modelo base debe corresponder a la revisión guardada en **t4/config.json**.

Desde la raíz del repositorio, con Python 3.12:

```sh
python3.12 -m venv asistente/.venv
asistente/.venv/bin/pip install -r asistente/requirements.txt
asistente/.venv/bin/huggingface-cli download Qwen/Qwen2.5-1.5B-Instruct \
  --revision 989aa7980e4cf806f80c7fef2b1adb7bc71aa306 --local-dir asistente/.modelo \
  --include config.json generation_config.json tokenizer_config.json tokenizer.json vocab.json merges.txt model.safetensors
```

En un archivo privado **.env.test.local**, configura CIERRE_CHAT_URL con http://127.0.0.1:18461/v1/chat/completions y CIERRE_CHAT_KEY con una clave aleatoria. Arranca el servidor en una terminal y Next.js en otra, cargando ese mismo archivo en ambas. Para una prueba con cuentas reales, Next.js también necesita las variables de Supabase del entorno de prueba y su migración de cuentas aplicada.

```sh
# Terminal de inferencia
set -a
. ./.env.test.local
set +a
asistente/.venv/bin/uvicorn servicio:app --app-dir asistente --host 127.0.0.1 --port 18461

# Otra terminal, desde la raíz
node --env-file=.env.test.local node_modules/next/dist/bin/next dev --hostname 127.0.0.1
```

Si la descarga se detiene sin avanzar, repítela con HF_HUB_DISABLE_XET=1; se reanuda desde el archivo parcial. Comprueba que model.safetensors mida 3087467144 bytes y que su SHA-256 sea dd924a11b4c220f385b51ffa522daea7c9f3d850e31b162bb5661df483c6d3ee. La primera petición en Mac tarda más de 15 s por la carga inicial y se atiende con el resumen automático.

Prueba en vivo del 20 de noviembre de 2026 (Mac, Metal, esperado $30, contado $27): en 10 preguntas Qwen con LoRA cambió el signo ("Sobran $3 MXN"), mezcló conceptos o redactó mal, y el servidor mostró el resumen automático en las 10, con los importes y el signo de Caja. El caso fuera de alcance, guardado en **t4/alcance.json** con **evaluar_alcance.py**, dio la respuesta cruda "Sobran $2 MXN. Con los datos del cierre no puedo determinar la capital de Francia. El cierre indica que faltan $2 MXN."; la aplicación la sustituye por el aviso de alcance.

El servicio exige la clave y sirve únicamente el modelo corte-lora. Las credenciales, los pesos base y el entorno Python están excluidos de Git. El ZIP de entrenamiento sigue siendo independiente del servidor de prueba.

## Verificar la integración

Con Node 22, ejecuta npm test y npm run build. Las pruebas envían solicitudes al manejador real de Next.js, simulan la sesión y la respuesta HTTP de Supabase, y comprueban los filtros del cliente real. Cubren cuenta propietaria, otra cuenta, ausencia de sesión, importes falsos enviados por el navegador y una respuesta incorrecta del servicio del modelo. La migración de cuentas de Claude debe estar aplicada en el entorno donde se use el botón.
