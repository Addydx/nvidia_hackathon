Corte de caja para vendedores ambulantes
Problema
Al cerrar el puesto, el vendedor cuenta sus monedas. Si no anotó las ventas ni cuánto dinero tenía para dar cambio, le cuesta saber si le falta o le sobra dinero.
Solución
Una PWA que el vendedor abre en el navegador del teléfono. Registra ventas en efectivo y guarda un corte de caja que puede consultar después.
Cómo funciona
Al abrir el puesto, el vendedor registra cuánto dinero tiene para dar cambio.
En cada venta, anota el importe. La app guarda la hora y muestra las ventas del día.
Al cerrar, sube una imagen con las monedas separadas. La app muestra cuántas encontró de cada valor. El vendedor puede corregir el conteo.
La app suma el cambio inicial y las ventas para calcular cuánto debería haber. Compara ese total con el valor de las monedas contadas.
El asistente explica si la caja cuadra, falta dinero o sobra. El vendedor confirma y guarda el corte.
Ejemplo. El vendedor empieza con $20 y cobra $10. Debería tener $30. Si confirma que contó $25, la app calcula una diferencia de $5 y el asistente explica que faltan $5.
Los dos modelos
Visión. Recibe la imagen y devuelve cuántas monedas hay de cada valor que el equipo entrenó para reconocer.
Asistente. Recibe los importes calculados por la app y explica el resultado con palabras simples.
El equipo entrena o ajusta ambos modelos en los servidores del concurso e integra los resultados en la PWA. El equipo registra qué herramienta NVIDIA usó y para qué.

