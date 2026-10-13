# Entrenamiento: entorno de pruebas aislado

Primera preparación de Etapa 3, exclusivamente en `base44/setup-b8f0f68b`.

Por defecto, este paquete crea PostgreSQL en memoria con PGlite. Añade un modo opcional de prueba con almacenamiento local independiente. Ninguno recibe URL de conexión, utiliza el cliente de la app ni importa credenciales, usuarios o emisores reales. La base temporal se elimina al terminar; la local conserva sus datos en el mismo disco. La instalación inicial descarga una dependencia; la ejecución de las pruebas no necesita acceder a servicios alojados.

## Ejecutar

Desde la raíz del repositorio, con Node 20 o superior:

```sh
npm ci --prefix training-isolation --ignore-scripts
npm test --prefix training-isolation
```

Las dependencias están fijadas a `@electric-sql/pglite@0.5.9`, `playwright@1.58.2` y `pdf-lib@1.17.1`, con lockfile propio. Playwright se usa exclusivamente para verificar la nueva interfaz en navegador. No se cambian package.json ni package-lock.json de la app, ni se incluyen estas herramientas en su bundle. Se eligió PostgreSQL en memoria porque en esta sesión no hay Docker/PostgreSQL nativo y el backend activo es DatabasePad, no un proyecto Supabase identificado entre los conectados. No se creó un proyecto cloud ni se modificó Mi Taller de Costura.

## Qué valida

- Compilación y ejecución del SQL de diseño contra PostgreSQL con prerrequisitos sintéticos.
- Superadmin y subadmin ven datos administrativos; edit y readonly ven solo el emisor asignado por ID.
- Usuarios inactivos, sin identidad o sin puente aprovisionado no reciben datos.
- Readonly y el resto de roles no pueden escribir directamente: las mutaciones quedan reservadas al servidor futuro.
- Ningún cliente puede leer tablas privadas de identidad, claves, tokens o respuestas.
- Desactivar un usuario o reasignar un emisor revoca el alcance inmediatamente.
- Integridad de evidencia ligada a sesión, exclusividad del objeto aprobado y bloqueo de dos intentos abiertos.
- Declaración del quiz fija a 50, tablas públicas sin claves correctas, RLS en las 23 tablas propuestas.
- El borrador fuente conserva su bloqueo y ROLLBACK; no se genera una migración desplegable.

Resultado inicial: 163 pruebas de SQL/RLS pasaron. Después de añadir PDF privados: **344 pruebas de SQL/API y 67 pruebas de navegador pasaron, 0 fallaron**, contando los tests principales y sus subpruebas. También se verificó el arranque de `server.mjs`: `/health` respondió 200 con `sandbox=true` y `storage=memory`.

## API y autenticación local añadidas

```sh
npm start --prefix training-isolation
```

Solo escucha en `http://127.0.0.1:4317`. Al arrancar imprime cuatro cuentas DEMO y contraseñas aleatorias que se regeneran cada vez, además de IDs de un emisor sintético asignado a demo-edit y un programa DEMO de 14 días. Abre esa dirección en el navegador para usar la nueva interfaz. No hay conexiones a la app activa. Con el comando predeterminado, terminar el proceso elimina usuarios, sesiones y todos los datos. El modo persistente requiere el comando separado indicado abajo.

## Vista de prueba

La interfaz en `web/` usa HTML, CSS y JavaScript sin dependencias de frontend, fuentes remotas ni CDN. Todas las peticiones van a rutas relativas de esta misma API local. El servidor entrega únicamente diez archivos de la interfaz mediante una lista cerrada de rutas; no permite descargar el código de servidor, las credenciales ni archivos arbitrarios. CSP limita recursos y conexiones al mismo origen. El token vive solo en memoria: recargar la página exige iniciar sesión otra vez.

Vistas: Resumen, Programas, Agenda, Evidencias, Biblioteca, Actualizaciones, Quiz final, Cierre e Historial. Los administradores tienen formularios de revisión, evaluación, validación, constructor de programas y gestión/publicación del catálogo; el reclutador trabaja con sus emisores y contenido publicado; readonly consulta su alcance sin formularios de escritura. La autorización final permanece en el servidor. El programa inicial es DEMO; el catálogo admite contenido manual en este entorno temporal. No hay acciones de publicación o descarga ficticias. Los mensajes confirman exclusivamente guardado temporal real.

Para ensayar visualmente: entra como Reclutador con la contraseña de demo-edit, inscribe el emisor y agrega una sesión en Agenda; después envía su práctica desde Evidencias. Cierra sesión y entra como Superadmin o Subadmin para revisar la práctica, guardar una evaluación y validarla. Historial conserva revisiones y notas durante la ejecución del servidor. Solo lectura no tiene emisor asignado al arrancar; el test de navegador asigna un emisor ficticio para verificar esa vista.

Capturas de la ejecución automatizada (datos ficticios): [escritorio](preview/training-desktop.png), [móvil](preview/training-mobile.png), [catálogo de materiales](preview/training-library.png), [constructor de programas](preview/training-programs.png), [agenda](preview/training-agenda.png), [actualización opcional](preview/training-updates.png), [resultados del quiz](preview/training-exams.png), [quiz móvil](preview/training-quiz-mobile.png) [persistencia local](preview/training-persistent.png) y [revisión del cierre](preview/training-closing-review.png). No son una URL pública del sitio.

Para repetir las pruebas de navegador:

```sh
npx --prefix training-isolation playwright install chromium
npm run test:ui --prefix training-isolation
```

Alternativamente, `BROWSER_EXECUTABLE_PATH` puede señalar un Chromium instalado localmente. En esta sesión la descarga estándar del navegador falló; la revisión se ejecutó con Chromium 133 extraído de un paquete de QA temporal. Playwright permanece fijado en el paquete de pruebas, pero ese Chromium alternativo no se añade como dependencia ni se entrega en el repositorio.

Los tests recorren login, inscripción, conversión de hora de Costa Rica a UTC, agenda, evidencias, bloqueo de autoaprobación, revisión, evaluación, validación, historial, logout, pantalla móvil, ausencia de desbordamiento horizontal y ausencia de peticiones externas. También prueban que texto con HTML no ejecuta scripts y que ninguna sesión se guarda en localStorage/sessionStorage. Las capturas se generan opcionalmente con `UI_SCREENSHOT_DIR`.

## Catálogo de temas y materiales

La Biblioteca tiene pestañas Temas y Materiales. Superadmin y subadmin pueden crear borradores, generar nuevas revisiones y publicar. Las cuentas edit y readonly ven solamente revisiones publicadas (y archivadas conservadas para historial), con permisos de vista previa y descarga verificados en servidor. Por defecto se muestra la revisión más reciente visible de cada contenido; la casilla de revisiones anteriores permite consultar su historial.

Cada edición crea otra fila con el mismo content_key y revision incrementada. No sobrescribe la fila anterior, sus archivos de texto ni las referencias de programas que ya la usan. Una petición de edición basada en una revisión antigua se rechaza con conflicto. Solo el borrador más reciente puede publicarse. La publicación repetida no duplica auditoría; ambos administradores pueden publicar sin aprobación obligatoria de otro administrador. La publicación queda registrada con el actor autenticado y una validación administrativa.

Materiales soportados en esta entrega:

- **Documento de texto:** título, revisión exacta de tema, contenido de hasta 20.000 caracteres sujeto al límite JSON de 32 KB, vista previa de texto y descarga real como `.txt`.
- **PDF privado:** carga real, descarga del original y revisiones; no se ofrece visor integrado. Límites y compatibilidad se detallan abajo.
- **Imagen PNG privada:** carga real, vista previa y descarga del archivo normalizado, con revisiones y permisos independientes; límites y formato admitido se detallan abajo.
- **Enlace HTTPS público:** título y URL validados; vista previa muestra un enlace que el usuario debe abrir manualmente. El servidor no descarga contenido externo ni genera miniaturas. No se ofrece descarga de documentos para enlaces.

Las opciones allow_preview y allow_download se comprueban para cada revisión en cada petición, incluso para administradores. Un administrador puede obtener el contenido para preparar una nueva revisión mediante edit-data; eso no concede acceso de edición al resto de roles. Los datos de autor, estado y revisión se derivan del servidor, no de campos del navegador. Cambiar permisos en una revisión nueva no revoca el acceso a una revisión anterior: preserva su regla histórica.

`training_private.local_material_content` guarda documentos y manifiestos PNG privados en la base del sandbox (en memoria o persistente local), con RLS y sin acceso SQL directo de clientes. La ruta storage_path es una referencia interna del sandbox, no un bucket o enlace público. El workspace devuelve metadatos sin contenido ni URL externa; preview/download/edit-data verifican la sesión antes de recuperarlos. El texto se representa con textContent y se descarga como texto plano. La URL externa se devuelve solo para una vista previa autorizada, nunca se incrusta automáticamente.

| Ruta POST | Cuerpo | Permiso |
|---|---|---|
| /api/topics | title, description, category, estimated_minutes; source_id opcional | Administrador; crea borrador o siguiente revisión |
| /api/topics/publish | id | Administrador; publica la revisión |
| /api/materials | topic_id, title, kind, content o external_url, allow_preview, allow_download; source_id opcional | Administrador; crea material/revisión |
| /api/materials/publish | id | Administrador; exige que la revisión de tema esté publicada |
| /api/materials/edit-data | id | Administrador; carga contenido para nueva revisión |
| /api/materials/preview | id | Sesión activa, revisión visible y vista previa permitida |
| /api/materials/download | id | Sesión activa, documento visible y descarga permitida |

Pruebas adicionales: permisos por rol, ocultación de borradores, suplantación de autor/estado, publicación idempotente, revisión antigua rechazada, contenido previo preservado, límites de texto, enlace inseguro rechazado, revocación de sesión, bloqueo de datos privados y descarga exacta en navegador. El navegador ensaya creación/publicación, vista previa segura, nueva revisión, permisos y formulario de enlaces sin tráfico externo; el catálogo administrativo también se revisó en móvil.

## Imágenes privadas de la Biblioteca

Los administradores pueden elegir Imagen PNG privada, cargar el archivo, guardar su borrador y publicarlo después de publicar el tema exacto. Reclutador y readonly consultan imágenes publicadas o históricas, con allow_preview y allow_download verificados por el servidor para cada revisión. Una nueva revisión puede conservar la imagen actual o cargar otra, sin sobrescribir la anterior. Los programas fijan el ID exacto del material y comprueban sus bytes privados antes de publicar.

El servidor acepta únicamente PNG estático RGB/RGBA de 8 bits sin entrelazado, hasta **2 MiB**, **2048 píxeles por lado** y **4 millones de píxeles**. No recibe JPEG directamente, SVG, PNG indexado/grises, APNG ni transparencia tRNS. La interfaz admite JPEG mediante conversión previa descrita abajo. La validación usa la firma completa, estructura y orden de chunks, CRC, dimensiones, descompresión con límite, longitud exacta de filas y filtros válidos. Rechaza datos truncados, payload añadido al final, bloques críticos desconocidos y base64 no canónico; limita a 512 chunks. Reconstruye IHDR/IDAT/IEND y elimina metadatos, perfiles de color, texto y nombre original. Esa normalización puede cambiar la interpretación del color si el original dependía de un perfil. El archivo descargado es la copia PNG normalizada, con nombre generado por el servidor.

Los bytes se guardan como un manifiesto versionado con base64, tamaño, dimensiones y SHA-256 en training_private.local_material_content, tabla privada existente. No se modifican tablas, huella del esquema ni formato del respaldo, y no se ejecutan migraciones. El modo local incluye las imágenes en las instantáneas y respaldos existentes; los permisos privados del almacén continúan vigentes. Se probó igualdad exacta de descarga tras reiniciar. El contenido se vuelve a comprobar al publicar, consultar, descargar o usarlo al publicar un programa.

storage_path es una referencia lógica: no existe una URL pública ni se sirve un directorio de archivos. El workspace incluye solo metadatos. Vista previa/descarga/edit-data requieren identidad activa; el cliente recibe la imagen solo después de esa comprobación. La vista previa usa data:image/png dentro de la página local, sin peticiones externas ni almacenamiento en el navegador. Cerrar la vista elimina el src y salir limpia el contenido de la página. Una copia ya recibida o descargada no puede retirarse desde el servidor.

| Ruta POST | Cuerpo | Permiso |
|---|---|---|
| /api/materials/image | topic_id, title, image_base64, allow_preview, allow_download; source_id opcional | Administrador; crea borrador/revisión |
| /api/materials/preview | id | Sesión activa y revisión visible; permiso de vista previa |
| /api/materials/download | id | Sesión activa y revisión visible; permiso de descarga |
| /api/materials/edit-data | id | Administrador; incluye bytes para preparar otra revisión |

Las cargas PNG y PDF amplían el límite HTTP al base64 máximo y 8 KiB de metadatos. Las demás rutas mantienen 32 KiB. El lector acumula buffers dentro del límite y rechaza excesos sin cortar abruptamente la siguiente conexión; decodifica UTF-8 una sola vez. La auditoría conserva actor y revisión; al crear una imagen añade tamaño/dimensiones/checksum, sin bytes ni nombre original.

Se verificaron permisos, datos falsificados, CRC/estructura corruptos, animación/formato rechazados, descompresión excesiva, cargas reales mayores de 32 KiB, metadatos eliminados, acceso SQL denegado, publicación/revisiones y programas con contenido privado faltante/corrupto. En navegador se comprobó el color de píxeles decodificados, descarga exacta, retención de imagen al revisar, PNG falso rechazado y uso en móvil/solo lectura. [Captura móvil](preview/training-images-mobile.png), con una imagen sintética de QA.

Fuentes técnicas del validador: [especificación PNG W3C](https://www.w3.org/TR/png-3/) y [zlib de Node.js](https://nodejs.org/api/zlib.html). Este subconjunto no pretende aceptar todos los PNG ni sustituye validación, almacenamiento y pruebas de concurrencia de un backend alojado. PDF, otros formatos y adjuntos de evidencia siguen pendientes.

## Entrada JPEG y conversión local

La interfaz de Biblioteca acepta archivos PNG o JPEG. Los PNG mantienen su flujo de validación y tamaño. Al elegir un JPEG, el navegador inspecciona su cabecera y límites antes de decodificarlo: hasta 2 MiB, 2048 píxeles por lado y 4 millones de píxeles. Se admite JPEG de 8 bits secuencial/progresivo o en gris que el navegador pueda decodificar. Se rechazan encabezados inconsistentes, formatos no admitidos, dimensiones excesivas, demasiados segmentos y archivos sin marcador final o con datos añadidos.

El JPEG se convierte localmente en PNG, aplicando su orientación de imagen y conservando la proporción. Si supera 768 píxeles en algún lado, se reduce proporcionalmente hasta ese máximo; no se amplía una imagen pequeña ni se recorta. El formulario explica esa regla antes de cargar y la confirmación informa las dimensiones guardadas y si hubo reducción. La copia puede perder detalle por reducción y cambiar la representación del color al decodificar; el JPEG original no se conserva y la descarga es PNG. El resultado tiene también límite de 2 MiB.

Solo el PNG convertido se envía a /api/materials/image. El servidor vuelve a validar y normalizar sus bytes con las reglas existentes; no confía en la inspección del cliente ni acepta JPEG por una llamada directa. No se envían nombre original, EXIF ni bytes JPEG a la API. La preparación no usa recursos externos ni almacenamiento web; libera el bitmap y el canvas al terminar. Retener una imagen al preparar otra revisión conserva el PNG ya guardado, sin reconvertirlo.

No se añaden dependencias, tablas, migraciones ni cambios a la huella o al formato de persistencia. Se verificaron JPEG reales generados en navegador, píxeles/color, reducción proporcional, orientación EXIF de 90 grados, ausencia de metadatos originales, descarga PNG, rechazo previo a la API y uso en móvil. [Captura de conversión móvil](preview/training-jpeg-mobile.png), con fotografías sintéticas de QA. La revisión de navegador se ejecutó con Chromium; no se afirma haber probado todos los navegadores o variantes JPEG.

Referencias del comportamiento de conversión: [ImageBitmap en HTML Standard](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html) y [serialización de canvas](https://html.spec.whatwg.org/multipage/canvas.html). El visor PDF, videos y adjuntos de evidencia permanecen pendientes.

## PDF privados para descarga

La Biblioteca permite elegir Documento PDF privado, cargar un archivo de hasta **2 MiB** y **1 a 100 páginas**, guardar borrador y publicar después del tema exacto. Se admiten PDF estáticos compatibles, con estructura tradicional o con streams de objetos comprimidos. No hay visor PDF integrado: allow_preview queda false y se rechaza la vista previa incluso si alguien altera ese indicador fuera de la API. La descarga requiere sesión activa, revisión visible y allow_download; esos permisos también se aplican a administradores. El editor puede conservar el PDF al crear una revisión o reemplazarlo, sin sobrescribir el original ni cambiar programas ya publicados.

El PDF se guarda **sin modificar sus bytes**, con sus metadatos originales. La descarga usa un nombre generado por servidor; el nombre original del archivo no se almacena. El manifiesto training-private-pdf-v1 incluye base64, tamaño, páginas y SHA-256 y se guarda en la tabla privada local_material_content existente. storage_path termina en .pdf como referencia lógica reservada y kind continúa siendo document; no se cambian tablas, huella del esquema ni formato de respaldos. El workspace devuelve metadatos sin bytes, y no hay una URL pública del archivo.

El servidor comprueba base64 canónico, cabecera, cierre/offset xref y estructura con pdf-lib fijado a 1.17.1. Rechaza documentos declarados cifrados, formularios, anotaciones no vacías, acciones, JavaScript y archivos adjuntos; también revisa objetos que no están enlazados al catálogo. Los PDF con enlaces, marcadores que usan acciones u otras funciones interactivas pueden quedar fuera de este subconjunto. Las páginas deben tener dimensiones finitas positivas y no superar 14400 puntos por lado.

El análisis corre en un **worker de Node**, sin ejecutar contenido PDF, con plazo de 5 segundos, límite de heap de JavaScript de 128 MiB y límites de objetos/profundidad. Un adaptador interno, probado para pdf-lib 1.17.1, reemplaza la descompresión no acotada de streams estructurales: permite contenido sin filtro o Flate y limita la expansión a 8 MiB por stream y 16 MiB acumulados; filtros estructurales no compatibles se rechazan. También limita streams Flate simples conservados en el contexto. Estos límites no son un límite global de RAM ni un antivirus; no se afirma que un PDF aceptado sea seguro para cualquier lector externo. Antes de alojar el servicio hacen falta revisión de dependencias, análisis de archivos y límites de recursos propios de ese entorno.

La validación se repite al publicar material/programa, descargar o preparar una revisión, y comprueba checksum/tamaño/páginas del manifiesto. Cada carga/descarga registra al actor real y checksum sin bytes en auditoría. Se verificó igualdad exacta tras reinicio y en una copia restaurada. Los PDF amplían el límite HTTP solamente en su ruta de carga; las rutas ordinarias siguen con 32 KiB y las instantáneas locales mantienen su límite de 64 MiB.

| Ruta POST | Cuerpo | Permiso |
|---|---|---|
| /api/materials/pdf | topic_id, title, pdf_base64, allow_download; source_id opcional | Administrador; crea borrador/revisión, sin vista previa |
| /api/materials/download | id | Personal activo, revisión visible y descarga permitida |
| /api/materials/edit-data | id | Administrador; recupera PDF para otra revisión |

Las pruebas incluyen documentos de dos escritores independientes, estructuras tradicionales/comprimidas, contraseña declarada, JavaScript/formularios/acciones/adjuntos, exceso de páginas/descompresión, truncamiento/xref falso, permisos, revisiones y contenido privado corrupto. En navegador se probó carga/publicación, descarga exacta, retención del PDF al revisar, lectura histórica en móvil y cambio de tipo PDF a texto. Capturas: [biblioteca móvil](preview/training-pdf-mobile.png) y [primera página del documento sintético de QA](preview/training-pdf-document.png), renderizada externamente para verificar el archivo de prueba; esa captura no es un visor integrado.

Fuentes del analizador: [PDF-LIB LoadOptions](https://pdf-lib.js.org/docs/api/interfaces/loadoptions) y [workers de Node](https://nodejs.org/api/worker_threads.html). La dependencia y su lockfile pertenecen únicamente a training-isolation; la app activa no cambia. Videos, adjuntos de evidencia e identidad/integración alojadas siguen pendientes.

## Constructor de programas y agenda automática

Superadmin/subadmin crean programas, agregan prácticas por día, eligen revisiones exactas de temas/materiales publicados y registran un changelog. La duración inicial es 14 días de entrenamiento, editable de 1 a 90 en este sandbox. Se admiten hasta 180 prácticas y 20 materiales por práctica. Se permiten varios temas en un día, con orden editable dentro de ese día. La fecha de cada práctica se asigna posteriormente en la agenda; la duración no constituye un plazo de caducidad del entrenamiento.

Guardar crea una versión borrador, incluso al editar un programa existente. Las versiones publicadas nunca se sobrescriben y las inscripciones mantienen su program_version_id. Una edición desde una versión antigua se rechaza. Publicar exige que todas las revisiones referenciadas estén publicadas, que los materiales correspondan a la revisión exacta de tema y que los documentos de texto sigan disponibles. Evidencia práctica y evaluación son obligatorias para todos los items del constructor actual; no se pueden desactivar mediante campos del cliente. La publicación repetida no duplica su auditoría.

La agenda usa la zona IANA guardada en la inscripción. Se elige fecha inicial, hora local del emisor y días de semana habilitados (la UI ofrece lunes-viernes o todos los días; la API admite cualquier conjunto no vacío). Día 1 del programa es el primer día habilitado desde la fecha inicial; los días siguientes se asignan a los próximos días habilitados. Los días sin items conservan su espacio en esa secuencia. Si varias prácticas comparten un día, empiezan consecutivamente según posición y estimated_minutes de la revisión del tema.

Ver propuesta calcula sin guardar. Generar vuelve a validar dentro de una transacción e inserta solamente sesiones faltantes. Todas las sesiones existentes se conservan, sean automáticas, manuales, reprogramadas, completadas o no realizadas; no se duplican ni se regeneran. Las fechas se calculan como fechas locales de calendario y luego se convierten a UTC. Se rechazan horas locales inexistentes o repetidas por cambios de zona, jornadas que desbordan medianoche y solapamientos con sesiones del mismo emisor/inscripción. Un conflicto cancela la operación completa, sin generación parcial. No se implementa todavía detección de conflictos entre diferentes emisores ni planificación de sesiones grupales.

Reprogramar conserva session_id y todas sus referencias de evidencia/asistencia; requiere motivo y la fecha vigente esperada, registra fecha anterior/nueva y actor real, y marca edited_manually. Una sesión completada no se reprograma. La asistencia admite presente, ausente, tarde o justificada, con actor y fecha; corregir un registro exige su recorded_at vigente y deja los estados anterior/nuevo en auditoría. No aprueba evidencias ni completa el programa. Historial muestra asistencia y publicaciones; los administradores también pueden ver los cambios de horario registrados en events. Cada llamada vuelve a verificar rol y alcance.

| Ruta POST | Cuerpo | Permiso |
|---|---|---|
| /api/programs | title, duration_days, changelog, items; source_id opcional | Administrador; crea programa o versión |
| /api/programs/publish | id | Administrador; publica la versión validada |
| /api/agenda/preview | enrollment_id, start_date YYYY-MM-DD, local_time HH:mm, weekdays opcional | Administrador o reclutador asignado; sin escrituras |
| /api/agenda/generate | Mismos campos que preview | Administrador o reclutador asignado; generación atómica |
| /api/sessions/reschedule | session_id, local_date, local_time, expected_scheduled_at, reason | Administrador o reclutador asignado |
| /api/attendance | session_id, status, expected_recorded_at al corregir | Administrador o reclutador asignado |

Cada item de programa contiene day, topic_id, notes y material_ids; el servidor deriva la posición dentro de cada día y las obligaciones prácticas. Los materiales son opcionales, pero los seleccionados deben validarse antes de publicar. Las evaluaciones actuales son por tema y las evidencias por sesión, conservando los contratos de Etapa 1.

Pruebas: permisos, publicación, revisiones, rollback de borradores incompletos, materiales de otro tema rechazados, zona de Costa Rica, días sin fines de semana, prácticas consecutivas, cambios de horario de Nueva York, horas inexistentes/repetidas, generación idempotente, colisiones manuales, sesiones completadas/manualmente editadas conservadas, reprogramación con control de cambios, asistencia y auditoría. El navegador recorrió construcción/publicación, nueva versión, asignación, propuesta sin guardar, generación, reprogramación y asistencia; el constructor fue revisado en móvil.

Fuentes de fecha/hora consultadas: https://www.postgresql.org/docs/current/functions-datetime.html y https://www.postgresql.org/docs/current/datatype-datetime.html. La conversión se verificó también ejecutando PostgreSQL en el sandbox; no se llama a APIs externas de horarios.

## Actualizaciones opcionales y progreso conservado

Publicar una versión no modifica inscripciones. La pestaña Actualizaciones permite comparar una versión publicada posterior del mismo programa, conservar la versión actual o aceptar la propuesta. Superadmin/subadmin y el reclutador asignado pueden aceptar para inscripciones activas o en pausa; readonly consulta el historial sin acciones. No se permite cambiar de programa, volver a una versión menor, aceptar borradores ni modificar entrenamientos completados/cancelados.

Regla de equivalencia aplicada: misma revisión exacta de tema, mismas revisiones de materiales, mismas notas/instrucciones y mismas obligaciones de evidencia/evaluación. Para una práctica única esa equivalencia puede conservarse aunque cambie de día. Si se repiten prácticas idénticas, solo se emparejan por el mismo día y posición; se evitan correspondencias ambiguas. Cambiar la revisión del tema/material o las instrucciones genera una práctica nueva pendiente. Esta política es conservadora; no hay aprobación manual para declarar equivalentes contenidos distintos en esta entrega.

La comparación muestra validaciones equivalentes conservadas, prácticas con sesiones conservadas, requisitos nuevos/modificados, prácticas que permanecen solo en el historial, changelog y porcentajes antes/después. No escribe datos. Aceptar exige el ID de versión anterior y el hash de esa comparación; si cambian la versión, las validaciones o las sesiones, el servidor rechaza la comparación antigua y pide revisarla. La aceptación se realiza en una transacción y la petición repetida es idempotente.

Se conservan sin cambios todos los registros anteriores: sesiones/fechas, evidencias, asistencia, evaluaciones y validaciones. Para requisitos equivalentes se crean referencias de validación en la versión nueva copiando dentro de PostgreSQL el actor y la fecha originales. El snapshot de porcentaje anterior se conserva en update_history y la aceptación registra al actor real. Las referencias de programa de las sesiones históricas no se reescriben. Los emparejamientos provienen del servidor; no se aceptan mapas o puntuaciones enviados por el cliente.

El porcentaje actual se deriva del total de requisitos de la versión asignada. Ejemplo: conservar 1 práctica validada de una versión de 2 prácticas mantiene esa validación; si la versión nueva exige 3 prácticas, el historial anterior conserva 50% y la nueva versión muestra 33,33%. No se altera retroactivamente la versión anterior ni se simula que se cumplieron requisitos nuevos. Los contadores de la pantalla usan únicamente requisitos actuales para evitar contar dos veces las referencias equivalentes.

La agenda reconoce sesiones conservadas incluso tras varias actualizaciones. Generación y programación manual no duplican esas prácticas, y validar después una sesión conservada actualiza el requisito equivalente de la versión vigente. Las sesiones que ya no corresponden a un requisito actual se marcan como históricas y se pueden conservar/revisar sin conceder crédito para requisitos distintos. Sus citas siguen existiendo y pueden bloquear un solapamiento; no se cancelan ni reprograman automáticamente. La aceptación no genera nuevas sesiones: se usa después la agenda automática para crear las faltantes.

| Ruta POST | Cuerpo | Permiso |
|---|---|---|
| /api/program-updates/preview | enrollment_id, to_version_id | Administrador o reclutador asignado; comparación sin escrituras |
| /api/program-updates/accept | enrollment_id, to_version_id, expected_from_version_id, preview_hash | Mismo alcance; aceptación transaccional |

Las pruebas incluyen privacidad por rol, publicación sin actualización forzada, conservación exacta de sesiones/validadores/fechas, porcentaje previo, doble aceptación, mapa falso, vista previa obsoleta, cambios de instrucciones/materiales, prácticas repetidas ambiguas, actualizaciones sucesivas, validación posterior de una sesión conservada, agenda sin duplicados, inscripciones pausadas/completadas y rechazo de programas ajenos/borradores/versiones menores. El navegador ensaya revisar, descartar, aceptar, consultar historial y generar solo trabajo nuevo; readonly fue revisado en móvil.

`POST /api/login` recibe `{ "username": "demo-edit", "password": "contraseña-local-generada" }`. Devuelve un token opaco temporal; las demás llamadas usan `Authorization: Bearer <token>`. No se aceptan roles ni IDs de actor aportados por el cliente. No hay endpoint de registro ni de cambio de rol. Las contraseñas de fixture usan scrypt con sal aleatoria; los tokens se almacenan como SHA-256 y vencen en una hora. En cada operación se vuelven a consultar actividad y rol del puente privado. Logout revoca la sesión. Esta autenticación solo pertenece al sandbox: no reemplaza Supabase Auth ni el login existente.

| Ruta | Método / cuerpo | Alcance |
|---|---|---|
| /health | GET | Identifica entorno temporal; no devuelve datos |
| /api/me | GET | Identidad verificada y rol actual |
| /api/logout | POST / {} | Revoca la sesión actual |
| /api/enrollments | GET | Inscripciones visibles mediante RLS |
| /api/workspace | GET | Temas, programas, sesiones, evidencias, evaluaciones, aprobaciones y progreso autorizado |
| /api/enrollments | POST / host_id, program_version_id, timezone | Administrador o reclutador asignado; programa publicado; asignación derivada por servidor |
| /api/sessions | POST / enrollment_id, item_id, scheduled_at, duration_minutes | Actor autorizado; item de la versión fijada; UTC; inscripción activa |
| /api/evidence | POST / session_id, description | Crea evidencia pendiente y solicitud de aprobación; sin autoaprobación |
| /api/evidence/review | POST / evidence_id, decision, notes | Superadmin/subadmin; aprueba o rechaza una vez; conserva historial |
| /api/assessments | POST / session_id, score, passed, notes | Evaluación práctica administrativa; no es el quiz final |
| /api/items/complete | POST / session_id | Solo administrador; exige evidencia aprobada y evaluación satisfactoria cuando son obligatorias |

Las escrituras validan rol, asignación, campos y estado dentro de transacciones, y registran actor real en auditoría. Los clientes no pueden enviar recruiter_id, status, progress_percent, submitted_by o reviewed_by para sobrescribirlos. Validar dos veces una misma práctica no duplica la validación ni la auditoría. La inscripción sigue activa: no se concede finalización del programa sin quiz final.

El servidor rechaza orígenes externos y encabezados Host ajenos al loopback, limita intentos de login y tamaño del JSON, y no devuelve claves de exámenes publicados ni credenciales. La plantilla DEMO editable, incluidas sus claves, requiere una cuenta administrativa; no se sirve como recurso público. Para ensayar: iniciar sesión como demo-edit, inscribir el host/program impresos con zona America/Costa_Rica, crear una sesión con uno de los item_ids y fecha UTC, enviar descripción de práctica; después iniciar sesión como administrador, revisar evidencia, registrar evaluación y validar el item. Todas las respuestas guardadas duran solo mientras vive el proceso.

## Quiz final de 50 preguntas

Superadmin/subadmin pueden cargar una plantilla DEMO editable o editar las 50 preguntas en formularios individuales, indicando opciones y respuesta correcta. La plantilla ilustra preparación de lives, networking respetuoso, coordinación de PK, seguridad y seguimiento del entrenamiento; debe revisarse y adaptarse antes de usarla como contenido real. No se atribuyen políticas oficiales ni una certificación a MICO. El administrador debe indicar un umbral explícito mayor que 0 y hasta 100, con máximo dos decimales. No se inventó un porcentaje de aprobación por defecto.

La publicación valida 50 preguntas distintas, 2–6 opciones distintas por pregunta e índices correctos, todo en una transacción. Cada publicación es inmutable y las nuevas versiones requieren el ID de la última versión para rechazar ediciones antiguas. Las claves quedan en training_private.training_exam_keys y no se devuelven en workspace, quiz ni resultados. Solo el administrador puede recibir las claves de la plantilla DEMO para editarla, mediante una petición autenticada.

El reclutador asignado o un administrador emite una invitación ligada a la inscripción y al Host.id derivado del servidor. Debe indicar entre 1 y 10 intentos y un vencimiento futuro de hasta 30 días (límites técnicos de este sandbox, no una política definitiva). Se bloquea emitir otra invitación mientras haya una vigente y abierta para la inscripción. El enlace se muestra una vez y permanece en memoria hasta cerrar sesión; no se envía por correo/WhatsApp. La base solo guarda su hash. El token va en el fragmento de /quiz y se retira inmediatamente de la barra de dirección; las peticiones usan Authorization y no guardan tokens o respuestas en localStorage/sessionStorage. Para reabrir el quiz se necesita el enlace original. El servidor usa no-store, no-referrer y CSP del mismo origen.

El visitante no necesita una cuenta del personal. El enlace es una credencial de acceso, **no verifica su identidad**: quien lo posee puede responder. Por eso la auditoría de start/submit registra actor null, asignación e identidad «invitation bearer», sin adjudicar la acción al administrador. No se habilitó login del emisor, OTP ni prueba de identidad. El resultado queda vinculado al emisor de la asignación y visible al personal según su alcance/RLS.

Start retoma el intento abierto sin duplicarlo; al enviar deben venir exactamente 50 IDs de preguntas únicos de esa versión con índices válidos. Se rechazan score, passed, host_id y campos ajenos. El servidor corrige con claves privadas; cada acierto vale 2 puntos. Un envío repetido con las mismas respuestas devuelve el resultado original sin duplicar respuestas/auditoría; cambiarlas después se rechaza. Aprobar o agotar los intentos finaliza esa invitación. Una nueva invitación posterior requiere una acción explícita del personal y conserva todo el historial anterior. No se muestran claves ni aciertos por pregunta al visitante.

Revocar o vencer el enlace bloquea status/start/submit incluso con un intento abierto. Pausar/cancelar/completar la inscripción bloquea el acceso público; los resultados históricos siguen visibles al personal. Revocar no borra preguntas, intentos o resultados. Aprobar el quiz no cambia automáticamente la inscripción a completada ni sustituye las prácticas. La finalización ahora requiere confirmación administrativa mediante la vista Cierre; las constancias formales siguen pendientes.

| Ruta POST | Campos | Autorización |
|---|---|---|
| /api/exams/template | {} | Administrador; ejemplo editable |
| /api/exams/publish | exam_key, pass_percent, questions, source_id opcional | Administrador; nueva versión inmutable |
| /api/exams/issue | enrollment_id, exam_version_id, max_attempts, expires_at | Administrador o reclutador asignado |
| /api/exams/revoke | assignment_id | Mismo alcance; conserva resultados |
| /api/quiz/status | {} | Invitación vigente; sin claves |
| /api/quiz/start | {} | Invitación vigente; intento limitado/idempotente |
| /api/quiz/submit | attempt_id, answers [{question_id,selected_option}] | Misma invitación; corrección privada |

Las peticiones ordinarias de la API mantienen el límite de 32 KB; la plantilla DEMO cabe en él. Solo las rutas de carga PNG y PDF admiten el base64 de un archivo de hasta 2 MiB más 8 KiB de metadatos JSON. Los tests cubren aislamiento de actores, versiones, límites, datos falsificados, vencimiento, revocación, envío concurrente/idempotente, puntuaciones en el umbral, móvil y lectura de resultados. La serialización de PGlite no sustituye pruebas de concurrencia distribuida. La identidad y el almacenamiento alojados siguen pendientes; el modo local de abajo no integra un servicio cloud.

## Cierre administrativo del entrenamiento

La vista Cierre permite revisar requisitos sin modificar datos. Superadmin/subadmin pueden confirmar el cierre únicamente cuando la inscripción está activa, el programa publicado contiene prácticas y todos los requisitos vigentes están cumplidos. El reclutador asignado y readonly pueden revisar y consultar el registro dentro de su alcance actual; no pueden confirmar. El servidor revalida identidad, rol y asignación en cada llamada.

Cada práctica exige su validación, una sesión completada del requisito vigente o su equivalente conservado, evidencia aprobada cuando es obligatoria y la última evaluación aprobada del tema cuando corresponde. Un porcentaje de 100% por sí solo no autoriza el cierre. El quiz seleccionado debe pertenecer al mismo emisor e inscripción y haber sido emitido para la versión actual del programa. El servidor vuelve a comprobar las 50 respuestas y claves privadas, recalcula la puntuación y verifica el umbral; no devuelve respuestas ni claves al navegador.

La emisión del quiz registra ahora program_version_id en su auditoría. Los quizzes anteriores sin ese vínculo, o emitidos antes de aceptar otra versión, conservan sus resultados históricos pero requieren una nueva invitación de la versión vigente para cerrar. No se deduce una versión ni se migra el esquema. Vencer o revocar una invitación bloquea su acceso público; no invalida un resultado ya corregido y aprobado. El enlace sigue siendo una credencial de portador, sin verificación de quién respondió.

Confirmar exige conclusión/plan de mejora, versión esperada y hash de la revisión. El servidor vuelve a revisar todo bajo bloqueo de la inscripción y rechaza cambios posteriores a la propuesta. La confirmación es transaccional y el reenvío idéntico es idempotente. Otro texto o selección después del cierre se rechaza. Se conserva un registro en training_events con actor, fecha, conclusión, versión, requisitos y referencias verificadas, puntuación y umbral. El workspace expone exclusivamente los registros de cierre autorizados en closing_records; las políticas generales de events permanecen administrativas.

El registro no puede editarse mediante la API. Completar bloquea nuevas mutaciones, actualizaciones de programa y acceso público al quiz de esa inscripción. Publicar versiones futuras o crear otra inscripción no altera el cierre anterior. Se probó conservar el registro exacto tras cerrar/reabrir el almacén local. Es un registro administrativo del sandbox; no genera certificado, PDF ni acreditación oficial.

| Ruta POST | Cuerpo | Permiso |
|---|---|---|
| /api/training/closing-preview | enrollment_id; attempt_id opcional | Personal autenticado dentro de su alcance; sin escrituras |
| /api/training/complete | enrollment_id, attempt_id, expected_program_version_id, preview_hash, notes | Administrador; confirmación explícita |

Las pruebas cubren prácticas incompletas, evaluación posterior reprobada, puntuación falsificada, respuestas privadas faltantes, quiz de otra inscripción/versión, propuesta obsoleta, pausa, concurrencia e idempotencia, alcance tras reasignación, conservación histórica, reinicio local y revisión en escritorio/móvil. PGlite serializa las operaciones; estas pruebas no demuestran concurrencia distribuida con múltiples conexiones.

## Exportación del cierre

Cada registro de cierre ofrece **Descargar informe** (HTML independiente e imprimible) y **Descargar registro JSON**. El informe puede guardarse como PDF mediante la impresión del navegador; el servidor no genera un PDF. La descarga exige una sesión activa y vuelve a comprobar la asignación actual del emisor. Superadmin/subadmin y el personal asignado, incluido readonly, pueden descargar; reasignar el emisor, desactivar la cuenta o revocar la sesión bloquea solicitudes posteriores.

Los datos provienen exclusivamente del snapshot conservado al cerrar: ID de emisor/inscripción, versión y título del programa, actor/fecha de cierre, validaciones y referencias de prácticas, resultado/umbral del quiz y conclusión. Las prácticas se identifican por día y IDs históricos; el cierre previo no guardaba los nombres de temas o del emisor, así que no se inventan ni se incorporan perfiles actuales. Publicar nuevas revisiones no cambia el informe. Se verificó que ambos formatos conservan exactamente el mismo contenido y checksum tras reiniciar el almacén local.

No se exportan respuestas/claves privadas, invitaciones, sesiones del personal, request_hash ni preview_hash. El HTML escapa los textos, tiene estilos locales y política CSP restrictiva, sin scripts, imágenes, enlaces ni peticiones externas. Admite móvil e impresión; textos largos se ajustan sin desbordar. El JSON usa una proyección de campos explícita, versionada como host-training-closing-report v1, sin metadatos arbitrarios de eventos.

Cada solicitud exitosa añade training_closing_exported con el actor solicitante real, registro de cierre, formato y SHA-256 de los bytes UTF-8 generados. No modifica el cierre, no lo duplica y no cambia su fecha. El checksum permite comparar copias con el resultado original de la API; no constituye una firma digital. Los archivos descargados son copias editables del informe administrativo DEMO, sin acreditación oficial ni verificación pública. La app no puede retirar una copia ya descargada después de revocar el acceso.

| Ruta POST | Cuerpo | Permiso |
|---|---|---|
| /api/training/closing-export | record_id, format: html o json | Personal autenticado con alcance actual del emisor |

Pruebas: aislamiento, campos/formatos falsos, eventos ajenos rechazados, revocación inmediata, ausencia de secretos, escape de contenido activo, auditoría del solicitante, bytes históricos estables, persistencia y descarga real en navegador. La [captura del informe imprimible](preview/training-closing-report.png) incluye texto adversarial de QA para comprobar que se muestra como texto y se ajusta al ancho; todos los datos son sintéticos.

## Persistencia local independiente (opcional)

El modo predeterminado sigue en memoria. `start:persistent` conserva datos de prueba en `training-isolation/_local-data/<nombre>/database.json` usando instantáneas de PGlite y un disco local. PGlite se ejecuta en memoria y este módulo guarda una instantánea completa tras cada transacción y escritura SQL, antes de confirmar su resultado. El archivo nuevo se sincroniza y reemplaza atómicamente; si falla el guardado, el proceso bloquea operaciones siguientes y conserva la última instantánea válida. Reabrir recupera esa última instantánea. Es un mecanismo de prueba, con coste de copia completa por operación; no está optimizado para gran volumen. Cada instantánea JSON tiene un límite de 64 MB; se rechaza un guardado que exceda lo que el lector puede reabrir. No se conecta a DatabasePad, Supabase, la app ni otro proyecto. Los datos siguen siendo sintéticos. No se creó un servicio remoto, no se modificó main y no se ejecutó una migración alojada.

Primera ejecución, desde una terminal Bash en la raíz del repositorio:

```sh
read -r -s -p "Contraseña para las cuentas DEMO: " TRAINING_DEMO_PASSWORD
export TRAINING_DEMO_PASSWORD
npm run start:persistent --prefix training-isolation -- demo
unset TRAINING_DEMO_PASSWORD
```

Se necesitan de 12 a 200 caracteres. Las cuatro cuentas son demo-superadmin, demo-subadmin, demo-edit y demo-readonly; comparten esa contraseña solo para este ensayo DEMO. Se guarda su derivación scrypt con sal, nunca la contraseña en texto. La consola no imprime la contraseña. Guarda la que elegiste; no se añadió recuperación/cambio de contraseña ni identidad real. El programa, emisor y cuentas se crean una sola vez en una transacción. Si falla el aprovisionamiento, no deja usuarios parciales. Un valor distinto de la variable en otro arranque no cambia cuentas ni contraseñas ya creadas.

Después, para reabrir el mismo almacén sin volver a configurar la contraseña:

```sh
npm run start:persistent --prefix training-isolation -- demo
```

El servidor escucha solo en 127.0.0.1:4317. Reiniciar conserva catálogo/textos, versiones de programas, inscripciones, sesiones, evidencias, evaluaciones, validaciones, actualizaciones aceptadas, auditoría, preguntas/claves del quiz e intentos/resultados. Las cuentas y IDs no se regeneran. Se conservan los hashes de sesiones/enlaces y sus revocaciones y vencimientos; persistir no extiende la vigencia. Los tokens del navegador siguen solo en memoria. `/health`, login, mensajes de guardado y pie de página indican el modo correcto, sin exponer rutas locales o credenciales.

Solo se aceptan nombres sencillos de almacén: letras minúsculas, números y guiones, empezando por una letra. No se aceptan rutas, URLs, DSN ni nombres de bases remotas. Una marca de aplicación/formato, checksum de la instantánea, huella del esquema e identidad interna de la base deben coincidir. Una carpeta ajena, enlace simbólico, base incompatible o inicialización incompleta se rechaza **sin reinicializar, borrar datos ni ejecutar una actualización automática**. Hay un directorio de propietario exclusivo, separado de los datos de PostgreSQL, que impide abrir el mismo almacén en dos procesos y realizar un respaldo mientras el servidor lo usa. Cerrar normalmente libera ese bloqueo. Si reaparece una marca que este mismo proceso registró como cerrada, solo puede recuperar esa marca propia bajo otro bloqueo exclusivo. Nunca recupera una marca activa/desconocida ni supone que un PID reutilizado le pertenece.

Si se interrumpe abruptamente el proceso, el bloqueo puede quedar pendiente: inspecciona el PID de `_local-data/_locks/<nombre>/owner.json`, confirma que ese propietario ya no existe y retira únicamente el directorio _locks/<nombre> de ese almacén antes de reabrir. No hay desbloqueo ni borrado automáticos. Se probaron cierre/reapertura normales y restauración; no se afirma tolerancia a pérdida de energía, corrupción del disco o concurrencia distribuida.

### Respaldo y restauración local

Detén primero el servidor de ese almacén. Crear un respaldo:

```sh
npm run backup:local --prefix training-isolation -- demo
```

El comando devuelve un backup_id. El respaldo usa dumpDataDir de PGlite fijado a 0.5.9, incluye huella del esquema y checksum SHA-256, y se guarda exclusivamente en `_local-data/backups` con permisos de archivo 0600 dentro de carpetas 0700. Contiene contenido, claves del quiz, respuestas y hashes de credenciales; protégelo como datos privados de la prueba. Tanto los datos como los respaldos están excluidos de Git; no se sirven por HTTP ni se suben al repositorio.

Para restaurarlo en una copia con **otro nombre nuevo**:

```sh
npm run restore:local --prefix training-isolation -- backup-ID-DEVUELTO demo-recuperado
npm run start:persistent --prefix training-isolation -- demo-recuperado
```

Sustituye backup-ID-DEVUELTO por el ID real. El comando solo lee respaldos de ese directorio privado, verifica formato, huella y checksum y nunca sobrescribe un almacén existente. La copia conserva los resultados y revisiones del momento del respaldo, con identidad propia; el original permanece intacto. Se revocan todas las sesiones y enlaces del quiz en la copia para que una restauración no reactive accesos antiguos. Las cuentas mantienen su contraseña original; inicia sesión otra vez y emite enlaces nuevos cuando corresponda.

El almacenamiento local depende del disco y de ese entorno: no es persistencia cloud, una URL pública ni disponibilidad garantizada. Debe ejecutarse en un disco duradero para conservar trabajo real de pruebas; esta sesión verificó con almacenes sintéticos temporales que se retiraron al terminar. Una futura versión con esquema diferente se detiene por incompatibilidad y requiere un procedimiento explícito de actualización; no hace migraciones silenciosas.

## Límites y siguiente trabajo

`bootstrap.sql` representa únicamente las claves UUID necesarias para el ensayo, no el esquema real de DatabasePad. `auth.uid()` se simula con un claim de sesión para probar RLS; no verifica tokens ni prueba el login. La ejecución en memoria no demuestra compatibilidad completa con Supabase/DatabasePad, Auth, Storage o PostgREST.

La API ya implementa validación de prácticas, catálogo de texto/enlaces/imágenes PNG, constructor/publicación de programas, generación de agenda, reprogramación, asistencia, aceptación opcional de versiones, porcentaje derivado, quiz final con corrección privada y cierre administrativo. Aún no implementa otros formatos de imagen, videos o diapositivas, archivos de evidencia ni emisión de constancias formales o PDF. Los formatos pendientes requieren ampliar el almacenamiento y la validación; no se simulan subidas o conversiones. En este sandbox las evidencias son descripciones de prácticas. Hay un programa DEMO inicial y programas creados manualmente; el comando predeterminado es temporal y el modo opcional conserva datos locales. Los controles de asistencia/reprogramación usan fechas devueltas por API y los de actualización usan una comparación verificada mediante hash; PGlite serializa operaciones en una conexión. Deben probarse la concurrencia real, almacenamiento alojado e identidad real antes de integración con la plataforma.

El primer fixture de RLS contiene una pregunta ficticia y prueba solo autorización. Los nuevos tests de publicación/corrección sí usan 50 preguntas reales del ejemplo DEMO y rechazan 49/51, claves inválidas y contenido duplicado. Los completions del primer test de RLS son fixtures de autorización; los tests HTTP, separados, sí exigen revisión y evaluación antes de completar una práctica. Faltan integración con identidad real de Supabase/DatabasePad, configuración del servicio alojado y pruebas de concurrencia en un entorno con múltiples conexiones. PGlite serializa las operaciones en una sola conexión; no se ha demostrado comportamiento distribuido.

Antes de conectar la interfaz, preparar un proveedor de identidad/API alojado independiente, confirmar el esquema real mediante lectura y probar las operaciones pendientes. No activar un backend alojado ni cambiar el login de la app compartida con este paquete. La rama actual de la app sigue apuntando al backend existente si se abre normalmente: este sandbox solo se ejecuta mediante los comandos anteriores y no debe confundirse con una copia aislada de toda la app. No se ejecutó build/TypeScript de la app porque sus fuentes y dependencias no cambiaron; los módulos Node se cargaron y ejecutaron en las pruebas. Los tests SQL/API se ejecutan en serie; la suite persistente tiene su propia invocación y sus archivos también se ejecutan en serie para aislar el ciclo de vida del almacén y evitar competir por memoria WASM. Exponen GC solamente en el proceso de pruebas para liberar instancias WASM cerradas entre los ensayos de reapertura; el servidor no necesita ese flag.

No se modifica `main`, no se despliega y no se aplica SQL a bases alojadas. No hace falta revertir datos reales: nunca se escribieron. Para retirar los ensayos de código se pueden revertir sus commits en esta rama; la app no depende del paquete. Revertir código no elimina los datos locales ni restaura automáticamente una versión anterior de su esquema. Antes de cambiar la versión del sandbox, conservar un respaldo y comprobar la compatibilidad del esquema.
