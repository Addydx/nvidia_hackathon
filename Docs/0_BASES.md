Hackathon NVIDIA Oaxaca 2026

CONVOCATORIA

# Bases del hackathon de Economía Digital

**Digitalización en procesos de negocios**

## 1. Objetivo

En 24 horas y en equipos de cuatro estudiantes, desarrollarán una aplicación móvil funcional que digitalice y mejore un proceso concreto de un negocio. Deberán describir cómo se realiza hoy, identificar la dificultad principal y demostrar cómo cambia el proceso con la aplicación.

Cada proyecto deberá integrar obligatoriamente:

- Un modelo de visión por computadora entrenado o ajustado por el equipo.
- Un asistente conversacional con un modelo ajustado por el equipo.
- Herramientas de NVIDIA y uso de los servidores proporcionados para el concurso.

El modelo de visión por computadora y el asistente deberán cumplir una función dentro del recorrido principal del proceso elegido.

## 2. Tema y contexto

La digitalización de procesos de negocio consiste en usar tecnología para mejorar la forma en que se realiza una actividad cotidiana, como registrar una venta, recibir mercancía o revisar un cobro.

El hackathon toma como contexto la [Ley de Economía Digital para Pagos Digitales y Electrónicos](https://dof.gob.mx/nota_detalle.php?codigo=5803017&fecha=04/11/2026#gsc.tab=0). Durante el taller correspondiente, un especialista explicará su alcance y los conceptos que deberán considerar los equipos.

Cada equipo elegirá un proceso, identificará quién lo realiza y describirá sus pasos, la información que utiliza y dónde se pierde tiempo o se producen errores. La aplicación deberá resolver ese punto y permitir comparar el proceso actual con el flujo digitalizado.

### Pregunta del reto

¿Cómo podemos mejorar un proceso cotidiano de un negocio mediante una aplicación móvil que integre visión por computadora y un asistente de inteligencia artificial?

## 3. Procesos que pueden digitalizarse

Cada equipo elegirá un proceso específico. Estas son algunas opciones.

- Registrar ventas y gastos que actualmente se anotan en papel.
- Recibir mercancía, identificar productos en fotografías y actualizar existencias.
- Cerrar la caja y conciliar ventas, cobros y gastos del día.
- Registrar costos de compra y consultar su efecto en precios y márgenes.
- Dar seguimiento a cobros, pagos o transferencias y vincularlos con las operaciones del negocio.
- Registrar pedidos y consultar su estado hasta la entrega.
- Organizar comprobantes para revisar ingresos, egresos o estimaciones fiscales.
- Registrar solicitudes de clientes y dar seguimiento a su atención.

Pueden elegir otro proceso de una micro, pequeña o mediana empresa, o de un negocio del comercio informal. Expliquen quién lo realiza, qué dificultad atenderán y qué función cumplirán ambos modelos de IA.

Elijan un proceso y acoten el recorrido a una tarea que puedan implementar y demostrar en 24 horas.

## 4. Equipos y trabajo autónomo

- Cada equipo estará integrado por cuatro estudiantes y un coach.
- El diseño, la implementación, la preparación de datos, el entrenamiento, la evaluación y los entregables deberán ser realizados por los estudiantes durante la duración del hackathon.
- Durante las 24 horas no podrán recibir asesoría de su coach, docentes, ni otras personas externas al equipo.
- Esta restricción incluye ayuda presencial o remota para resolver el proyecto, corregir código, preparar datos, entrenar modelos o elaborar la presentación.
- Podrán consultar documentación pública, recursos educativos y herramientas de asistencia de IA.
- El equipo deberá declarar el uso de herramientas de IA en el formato indicado en la sección 9. Sus integrantes serán responsables de comprender, verificar y explicar lo entregado.
- El personal de organización podrá resolver dudas sobre las bases y atender problemas de acceso o funcionamiento de la infraestructura. No proporcionará asesoría para desarrollar la solución.
- Las aclaraciones que afecten a todos los participantes se comunicarán por el Panel de Control del Hackathon Nvidia Oaxaca 2026.

## 5. Etapas de la competencia

| Etapa | Duración | Actividad |
| --- | --- | --- |
| Explicación de las bases | 30 minutos | Presentación del reto, reglas, entregables, evaluación y preguntas |
| Taller de HCI | 30 minutos | Usuarios, definición del problema, diseño y evaluación de la interacción |
| Taller sobre la ley | 30 minutos | Contexto, conceptos y alcance de la Ley de Economía Digital |
| Taller de gestión de negocios | 30 minutos | Identificación del proceso actual, puntos de mejora y medidas para comparar el flujo digitalizado |
| Desarrollo | 24 horas | Construcción del producto, entrenamiento, evaluación y preparación de entregables |
| Presentación | 15 minutos por equipo | Exposición y demostración de 10 minutos, seguidas de 5 minutos de preguntas |

Las 24 horas comenzarán al concluir los talleres. El comité anunciará las horas exactas de inicio, cierre y presentación.

Todos los entregables deberán registrarse antes del cierre Panel de Control del Hackathon Nvidia Oaxaca 2026.

## 6. Producto obligatorio

La aplicación podrá ser nativa, multiplataforma o una aplicación web progresiva — PWA— utilizable desde un teléfono.

Deberá cumplir con lo siguiente:

### a) Completar una tarea del proceso de negocio

El usuario deberá poder iniciar la tarea, capturar o consultar la información necesaria, revisar el resultado y completarla en la aplicación. El equipo mostrará qué pasos del proceso actual se digitalizan.

Cuando la tarea requiera guardar información, ésta deberá poder consultarse posteriormente.

### b) Integrar los dos componentes de IA

El modelo de visión por computadora y el asistente podrán utilizarse dentro de la aplicación (edge-computing) o a través de una API ejecutándose en un servidor local del equipo. El equipo explicará cómo interviene cada uno en el proceso elegido.

No será suficiente presentar los modelos funcionando por separado (por ejemplo cuadernos o APIs).

### c) Utilizar los modelos entrenados por el equipo

La aplicación deberá utilizar los pesos o adaptadores generados durante la competencia. Se deberá poder verificar la relación entre el entrenamiento entregado y el modelo que utiliza el producto.

### d) Permitir revisión y corrección

Cuando la IA interprete información que se utilizará para registrar operaciones o realizar acciones, el usuario deberá poder revisarla y corregirla antes de confirmar.

### e) Manejar errores

La aplicación deberá informar cuando una imagen no pueda procesarse, falten datos, falle una conexión o el asistente no pueda resolver una solicitud.

Una presentación o un prototipo de pantallas navegables, sin las funciones implementadas, no cumple con el producto obligatorio.

## 7. Entrenamiento obligatorio del modelo de visión por computadora

Cada equipo deberá definir una tarea visual útil para su aplicación, por ejemplo:

- Clasificar imágenes o documentos.
- Detectar productos u otros elementos.
- Reconocer o extraer información.
- Identificar características relevantes para una operación del negocio.

Se permite utilizar un modelo preentrenado y adaptarlo mediante transferencia de aprendizaje o ajuste fino. No se exige entrenar desde cero.

El equipo deberá:

1. Seleccionar e identificar el modelo base.
2. Preparar los datos y las etiquetas necesarias.
3. Separar los datos de entrenamiento, validación y prueba.
4. Ejecutar el entrenamiento o ajuste durante las 24 horas.
5. Guardar los pesos o el adaptador generado.
6. Evaluar el resultado con datos de prueba.
7. Integrar el modelo resultante en la aplicación.

Los conjuntos tendrán estas funciones:

| Conjunto | Uso |
| --- | --- |
| Entrenamiento | Actualizar los parámetros del modelo |
| Validación | Elegir configuraciones y revisar el comportamiento durante el desarrollo |
| Prueba | Evaluar al final con ejemplos reservados |

No deberán colocarse imágenes duplicadas ni versiones de la misma imagen en conjuntos distintos.

Utilizar únicamente un servicio de visión u OCR ya entrenado no acredita este requisito. Se podrán utilizar esos servicios como complemento, identificando claramente qué componente entrenó el equipo.

## 8. Ajuste obligatorio del modelo del asistente

Cada aplicación debe incluir un asistente conversacional (chatbot) ajustado a la tarea clara y enfocada de resolver el problema elegido. Este asistente servirá para registrar información, pedir datos que falten, explicar resultados, responder dudas o guiar al usuario dentro de la plataforma. Para lograrlo, el equipo podrá adaptar un modelo de lenguaje ya existente. Se permite el uso de técnicas avanzadas como:

- Ajuste fino supervisado (Fine-Tuning): mediante LoRA o QLoRA, que permiten reentrenar el modelo de forma rápida usando adaptadores que consumen menos memoria.
- RAG (Generación Aumentada por Recuperación): para conectar el modelo a una base de datos externa y darle información actualizada.
- Ingeniería de prompts (Prompt Engineering): dándole ejemplos claros al asistente dentro de sus instrucciones para enseñarle cómo responder.

Cada equipo deberá documentar y entregar los siguientes puntos según la estrategia técnica que haya seleccionado para su proyecto:

### Planificación y Selección

- Modelo base: Identificar el modelo de lenguaje inicial seleccionado para el proyecto.
- Objetivo del asistente: Definir con claridad el comportamiento, rol o funciones específicas que se desean lograr.

### Si el método incluye Entrenamiento o Ajuste del Modelo

- Datos de preparación: Presentar el conjunto de ejemplos utilizados para el proceso de aprendizaje.
- División de datos: Mostrar la separación de los datos en bloques para entrenamiento, validación y pruebas.
- Resultado del proceso: Guardar y entregar los archivos de configuración o pesos finales obtenidos.
- Evaluación comparativa: Presentar una comparación entre el rendimiento del modelo original y el modelo modificado.

### Si el método incluye Conexión a Información Externa o Diseño de Instrucciones

- Fuentes de información: Documentar la estructura de la base de datos o el origen de los conocimientos del asistente.
- Flujo de datos: Explicar cómo el sistema recupera la información antes de entregar la respuesta final.
- Diseño del prompt: Presentar las instrucciones del sistema y los ejemplos prácticos integrados para guiar las respuestas.
- Pruebas de consistencia: Documentar los escenarios de prueba realizados para asegurar que el asistente respete sus reglas.

### Implementación Final

- Integración funcional: Incorporar el asistente conversacional configurado dentro de la aplicación para su uso real.

## 9. Uso de los servidores y herramientas NVIDIA

Los equipos cuentan con el acceso a los servidores NVIDIA proporcionados previamente.

Cada equipo deberá:

- Preparar y enviar al servidor los datos, el código, la configuración y el modelo base, cuando corresponda.
- Ejecutar en esos servidores el entrenamiento del componente de imágenes y el ajuste del asistente.
- Conservar los registros de ejecución.
- Guardar los pesos o adaptadores obtenidos.
- Utilizar al menos una herramienta de software NVIDIA para entrenar, optimizar o desplegar alguno de los modelos.
- Explicar qué herramienta utilizó y qué función cumplió.

Los integrantes del equipo deberán preparar, ejecutar y verificar sus procesos en los servidores de Nvidia.

Todos los trabajos deberán incluir la siguiente sección, además de estar firmado por su líder de equipo:

**Declaración del uso de IA:** indicar si para el desarrollo de este trabajo han utilizado ayuda de alguna Inteligencia Artificial. Lo anterior deberá ser declarado a través del siguiente texto:

> “Para la elaboración de este trabajo se utilizó [HERRAMIENTA Y COMPAÑÍA] como apoyo en [DESCRIBIR LAS ACTIVIDADES REALIZADAS CON IA]. Quienes firman este trabajo han revisado y editado el contenido, verificado las fuentes y asumen plena responsabilidad por la versión final.”

Antes del inicio, la organización comunicará las instrucciones de acceso, almacenamiento, transferencia de archivos, ejecución de trabajos y uso compartido de los recursos de la competencia.

Los equipos deberán respetar los límites asignados y no interferir con los trabajos de otros participantes.

La ejecución de los modelos para la aplicación podrá realizarse en el servidor o en otro entorno permitido por la organización. No es obligatorio que los modelos se ejecuten dentro del teléfono.

## 10. Datos, recursos previos y autoría

Se permite utilizar:

- Modelos preentrenados.
- Bibliotecas y componentes de propósito general.
- Conjuntos de datos públicos.
- Datos sintéticos.
- Ejemplos y documentación técnica.

El equipo deberá identificar su procedencia y respetar las licencias correspondientes.

La preparación específica de la solución, el entrenamiento y su integración deberán realizarse durante las 24 horas. Se permite partir de pesos preentrenados declarados; no se permite presentar como entrenamiento del concurso un ajuste específico realizado previamente.

Los datos sintéticos deberán identificarse como tales y revisarse antes de utilizarlos.

Las demostraciones deberán utilizar datos sintéticos, anonimizados o autorizados. No deberán exponerse contraseñas, claves de acceso ni información personal o financiera de terceros.

## 11. Condiciones para cálculos y pagos

Estas funciones son opcionales.

Si el proyecto incorpora cálculos financieros o fiscales:

- Deberán realizarse con reglas implementadas y verificables.
- Se documentarán las fuentes, el periodo, los supuestos y el alcance.
- Se presentarán casos con resultados esperados.
- El asistente podrá explicar los resultados calculados.
- Las estimaciones deberán identificarse claramente y no presentarse como determinaciones oficiales.

Si incorpora cobros, transferencias o pagos:

- Se permitirá utilizar un entorno de prueba.
- Se deberá demostrar la solicitud, respuesta y estado de la operación.
- Se deberá considerar al menos un caso de fallo.
- No será obligatorio mover dinero real, presentar declaraciones ni pagar impuestos.
- Una pantalla de éxito sin integración deberá identificarse como simulación.

Las funciones secundarias pendientes o simuladas deberán declararse. El recorrido principal y los dos componentes obligatorios de IA deberán estar implementados.

## 12. Diseño y evaluación con HCI

Cada equipo deberá aplicar los contenidos del taller de Interacción Humano-Computadora.

Como mínimo, deberá:

1. Describir al usuario, la tarea principal y cómo se realiza hoy el proceso. Identificar el paso que se busca mejorar.
2. Diseñar un flujo digital comprensible que permita completar esa tarea.
3. Justificar tres decisiones de diseño.
4. Permitir revisar y corregir información.
5. Comunicar errores y estados de las operaciones.
6. Realizar una prueba breve con al menos dos usuarios ajenos al equipo.

Las personas participantes en las pruebas podrán utilizar la aplicación y comentar su experiencia. Su participación no deberá convertirse en asesoría para desarrollar el proyecto.

El equipo registrará qué tarea se solicitó, qué dificultades se observaron y qué mejoras se realizaron. Si las personas no pertenecen al público objetivo, deberá señalarse esta limitación.

## 13. Evaluación técnica mínima

### Aplicación

Presentar al menos cinco casos de prueba del recorrido principal, incluyendo:

- Un caso habitual.
- Un caso con datos incompletos o inválidos.
- Un caso de fallo de la IA o de un servicio.

Para cada caso se indicará la entrada, el resultado esperado y el obtenido. Comparen el proceso actual y el digitalizado con al menos una medida pertinente, como pasos, tiempo o errores. Indiquen cómo hicieron la comparación y qué limitaciones tuvo.

### Modelo de visión por computadora

Presentar:

- Cantidad y distribución de los datos.
- Una métrica adecuada a la tarea.
- Explicación de cómo se calculó.
- Ejemplos de aciertos y errores.
- Comparación con el modelo base, cuando éste permita evaluar la misma tarea. Si no es comparable, explicar el motivo.

### Asistente

Presentar al menos diez casos de prueba reservados, distintos de los utilizados para entrenamiento y validación.

Deberán incluir solicitudes habituales, información incompleta, una solicitud fuera de alcance y un caso que requiera reconocer una limitación o solicitar confirmación.

Se compararán las respuestas del modelo base y del ajustado utilizando las mismas condiciones y criterios de evaluación.

No se exige obtener mejoras en todos los casos. Se evaluarán la ejecución del entrenamiento, la calidad de la evaluación y la interpretación honesta de los resultados.

## 14. Entregables obligatorios

### A. Aplicación funcional

- Archivo instalable o enlace de acceso.
- Instrucciones de instalación y uso.
- Cuenta de demostración, si se necesita.
- Datos de prueba.
- Identificación de la versión entregada.

### B. Código fuente

Repositorio o archivo que contenga:

- Código de la aplicación y de los servicios desarrollados.
- Código o cuadernos de ambos entrenamientos.
- Configuración y dependencias.
- Instrucciones para ejecutar el producto y cargar los modelos.
- Descripción de la conexión entre aplicación, modelos y servicios.
- Declaración de componentes previos, herramientas de IA, fuentes y licencias.
- Lista de funciones implementadas, simuladas y pendientes.

No se deberán incluir claves secretas.

### C. Paquete de entrenamiento de ambos modelos

Para cada modelo:

| Elemento | Contenido |
| --- | --- |
| Modelo base | Nombre, versión, procedencia y licencia |
| Datos | Datos utilizados o acceso permitido, procedencia, preparación y distribución entre conjuntos |
| Configuración | Parámetros y procedimiento de entrenamiento |
| Registro | Fecha, duración, GPU utilizada y pasos o épocas ejecutados |
| Artefacto generado | Pesos o adaptador y referencia al modelo base necesario |
| Evaluación | Métricas, casos de prueba y resultados |

Los archivos grandes podrán entregarse mediante una ubicación agregado en Panel de Control del Hackathon Nvidia Oaxaca 2026. Deberán permanecer accesibles para el jurado.

Las capturas de pantalla podrán complementar las evidencias, pero no sustituirán los registros, el código ni los archivos generados.

### D. Ficha del proyecto

Documento PDF de un máximo de cuatro páginas con:

- Nombre del proyecto e integrantes.
- Problema y público objetivo.
- Descripción del proceso actual y relación con la economía digital.
- Recorrido digitalizado y comparación con el proceso actual.
- Función de cada modelo.
- Uso de herramientas de NVIDIA.
- Tres decisiones de diseño justificadas.
- Resultados principales.
- Limitaciones.

### E. Evidencias de evaluación

Archivo con las pruebas de la aplicación, los resultados de ambos modelos y las observaciones de las dos pruebas de uso.

### F. Presentación

Archivo PDF para apoyar la exposición ante el jurado.

### G. Video de respaldo

Video de un máximo de tres minutos que muestre el recorrido principal y el funcionamiento de ambos componentes de IA. Las funciones simuladas deberán identificarse.

El video servirá como respaldo ante problemas durante la demostración.

## 15. Presentación ante el jurado

Cada equipo dispondrá de 10 minutos para exponer y demostrar su proyecto, seguidos de 5 minutos de preguntas del jurado. El turno completo será de 15 minutos.

| Parte | Tiempo aprox. |
| --- | --- |
| Problema, usuario y solución | 2 minutos |
| Entrenamiento, evaluación y decisiones de diseño | 3 minutos |
| Presentación de negocios: Demo | 5 minutos |
| Preguntas del jurado | 5 minutos |
| Total | 15 minutos |

La presentación deberá incluir:

- El negocio, el usuario, el proceso actual y la dificultad que se busca resolver.
- La demostración del proceso digitalizado y la evidencia de la mejora observada.
- El entrenamiento y la evaluación del modelo de visión y del asistente.
- El uso de los servidores y herramientas NVIDIA.
- Las decisiones de diseño y los resultados de las pruebas de uso.
- Las limitaciones y funciones pendientes o simuladas.

Durante la demostración, el equipo deberá:

- Completar el recorrido principal.
- Procesar una imagen nueva, distinta de las utilizadas para entrenar.
- Realizar una consulta nueva al asistente.
- Mostrar cómo el usuario revisa o confirma la información.
- Acreditar que la aplicación utiliza los modelos entrenados durante la competencia.

La exposición finalizará al minuto 10. Los últimos 5 minutos se dedicarán a las preguntas del jurado.

El jurado podrá solicitar una entrada distinta, revisar registros o pedir explicaciones sobre el código, el entrenamiento y los resultados.

Si ocurre un fallo, podrá utilizarse el video de respaldo. El jurado valorará el funcionamiento de acuerdo con la evidencia disponible.

### Ajustes de concordancia en las bases

- En la sección 5, la etapa de presentación tendrá una duración de 15 minutos por equipo: 10 de exposición y 5 de preguntas.
- En la sección 19, el último punto será: “Preparamos una exposición de 10 minutos y 5 minutos adicionales de preguntas”.

## 16. Criterios de evaluación

| Criterio | Puntos | Qué se evaluará |
| --- | --- | --- |
| Problema y pertinencia | 10 | Usuario definido, proceso actual, dificultad identificada y pertinencia para la economía digital |
| Producto funcional | 20 | Flujo digitalizado completo, integración de ambos modelos, manejo de errores y evidencia de la mejora |
| Modelo de visión | 20 | Datos, entrenamiento, evaluación e integración |
| Asistente | 20 | Ajuste demostrado, comparación, utilidad y manejo de límites |
| Herramientas NVIDIA | 10 | Uso verificable y contribución técnica |
| HCI y experiencia de uso | 15 | Claridad, experiencia del usuario, decisiones justificadas y pruebas |
| Presentación y documentación | 5 | Claridad, evidencias y posibilidad de reproducir el trabajo |
| Total | 100 |  |

La cantidad de funciones no otorgará puntos por sí misma.

En caso de empate, se considerará primero la suma de los criterios de ambos modelos, seguida de producto funcional y HCI, en ese orden.

## 17. Cierre de la competencia

Al concluir las 24 horas:

- Se cerrará el registro de entregables.
- Los entrenamientos deberán haber finalizado y sus archivos deberán estar guardados.
- Se identificará la versión final del código.
- No se permitirán modificaciones posteriores al código, datos, modelos ni presentación.
- Se permitirá iniciar los servicios y cargar los archivos entregados para realizar la demostración.

Los incidentes de infraestructura deberán reportarse por el Panel de Control del Hackathon Nvidia Oaxaca 2026 en cuanto ocurran. El comité determinará y comunicará cualquier medida aplicable; reportar un incidente no concede automáticamente una extensión.

## 18. Requisitos para ser evaluado

El equipo deberá:

- Estar integrado por cuatro estudiantes.
- Entregar dentro del plazo.
- Presentar una aplicación móvil funcional.
- Integrar el componente de imágenes y el asistente.
- Acreditar el entrenamiento o ajuste de ambos durante la competencia.
- Demostrar el uso de servidores y herramientas NVIDIA.
- Entregar los materiales obligatorios.
- Realizar la presentación ante el jurado.

El plagio, la falsificación de evidencias, la asesoría externa prohibida comprobable o presentar un componente simulado como implementado serán causas de descalificación. El comité documentará y comunicará la causa al equipo.

## 19. Lista de verificación antes de entregar

- [ ] Somos cuatro integrantes.
- [ ] Identificamos al usuario, describimos el proceso actual y delimitamos la tarea que digitalizamos.
- [ ] Se declaró el uso de herramientas de IA.
- [ ] La aplicación funciona en un teléfono o emulador.
- [ ] El recorrido principal utiliza imágenes y asistente.
- [ ] Entrenamos o ajustamos el modelo de visión.
- [ ] Ajustamos el modelo del asistente.
- [ ] Conservamos los registros y archivos de ambos entrenamientos.
- [ ] La aplicación utiliza los modelos resultantes.
- [ ] Documentamos el uso de herramientas de NVIDIA.
- [ ] Evaluamos con datos reservados.
- [ ] Realizamos las pruebas funcionales y de uso y comparamos el proceso actual con el digitalizado.
- [ ] Identificamos limitaciones y simulaciones.
- [ ] Entregamos aplicación, código, modelos, ficha, evidencias, presentación y video.
- [ ] Verificamos que los enlaces y archivos sean accesibles.
- [ ] Preparamos una exposición de 10 minutos y 5 minutos adicionales de preguntas.

Los conceptos y lineamientos establecidos en la presente convocatoria cuentan con la revisión y aprobación del Comité Organizador, siendo vigentes desde el momento de su difusión. Las situaciones no contempladas en este documento serán evaluadas y resueltas exclusivamente por el Comité Evaluador.
