 Entrenamiento obligatorio del modelo de visión por computadora
Cada equipo deberá definir una tarea visual útil para su aplicación, por ejemplo:
● Clasificar imágenes o documentos.
● Detectar productos u otros elementos.
● Reconocer o extraer información.
● Identificar características relevantes para una operación del negocio.

El equipo deberá:
1. Seleccionar e identificar el modelo base.
2. Preparar los datos y las etiquetas necesarias.
3. Separar los datos de entrenamiento, validación y prueba.
4. Ejecutar el entrenamiento o ajuste durante las 24 horas.
5. Guardar los pesos o el adaptador generado.
6. Evaluar el resultado con datos de prueba.
7. Integrar el modelo resultante en la aplicación

8. Ajuste obligatorio del modelo del asistente
Cada aplicación debe incluir un asistente conversacional (chatbot) ajustado a la tarea
clara y enfocada de resolver el problema elegido. Este asistente servirá para registrar
información, pedir datos que falten, explicar resultados, responder dudas o guiar al
usuario dentro de la plataforma.
Para lograrlo, el equipo podrá adaptar un modelo de lenguaje ya existente. Se permite
el uso de técnicas avanzadas como:
• Ajuste fino supervisado (Fine-Tuning): mediante LoRA o QLoRA, que permiten
reentrenar el modelo de forma rápida usando adaptadores que consumen menos
memoria.
• RAG (Generación Aumentada por Recuperación): para conectar el modelo a una
base de datos externa y darle información actualizada.
• Ingeniería de prompts (Prompt Engineering): dándole ejemplos claros al asistente
dentro de sus instrucciones para enseñarle cómo responder.