# Entrenamiento: entorno de pruebas aislado

Primera preparación de Etapa 3, exclusivamente en `base44/setup-b8f0f68b`.

Este paquete crea PostgreSQL en memoria con PGlite. No recibe URL de conexión, no utiliza el cliente de la app, no lee credenciales ni importa usuarios o emisores reales. La base temporal se cierra al terminar. La instalación inicial descarga una dependencia; la ejecución de las pruebas no necesita acceder a servicios alojados.

## Ejecutar

Desde la raíz del repositorio, con Node 20 o superior:

```sh
npm ci --prefix training-isolation --ignore-scripts
npm test --prefix training-isolation
```

Las dependencias están fijadas a `@electric-sql/pglite@0.5.9` y `playwright@1.58.2`, con lockfile propio. Playwright se usa exclusivamente para verificar la nueva interfaz en navegador. No se cambian package.json ni package-lock.json de la app, ni se incluyen estas herramientas en su bundle. Se eligió PostgreSQL en memoria porque en esta sesión no hay Docker/PostgreSQL nativo y el backend activo es DatabasePad, no un proyecto Supabase identificado entre los conectados. No se creó un proyecto cloud ni se modificó Mi Taller de Costura.

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

Resultado inicial: 163 pruebas de SQL/RLS pasaron. Después de añadir catálogo versionado: **210 pruebas de SQL/API y 15 pruebas de navegador pasaron, 0 fallaron**, contando los tests principales y sus subpruebas. También se verificó el arranque de `server.mjs`: `/health` respondió 200 con `sandbox=true` y `storage=memory`.

## API y autenticación local añadidas

```sh
npm start --prefix training-isolation
```

Solo escucha en `http://127.0.0.1:4317`. Al arrancar imprime cuatro cuentas DEMO y contraseñas aleatorias que se regeneran cada vez, además de IDs de un emisor sintético asignado a demo-edit y un programa DEMO de 14 días. Abre esa dirección en el navegador para usar la nueva interfaz. No hay conexiones a la app activa. Terminar el proceso elimina usuarios, sesiones y todos los datos.

## Vista de prueba

La interfaz en `web/` usa HTML, CSS y JavaScript sin dependencias de frontend, fuentes remotas ni CDN. Todas las peticiones van a rutas relativas de esta misma API local. El servidor entrega únicamente tres archivos de la interfaz mediante una lista cerrada de rutas; no permite descargar el código de servidor, las credenciales ni archivos arbitrarios. CSP limita recursos y conexiones al mismo origen. El token vive solo en memoria: recargar la página exige iniciar sesión otra vez.

Vistas: Resumen, Agenda, Evidencias, Biblioteca e Historial. Los administradores tienen formularios de revisión, evaluación, validación y gestión/publicación del catálogo; el reclutador trabaja con sus emisores y contenido publicado; readonly consulta su alcance sin formularios de escritura. La autorización final permanece en el servidor. El programa inicial es DEMO; el catálogo admite contenido manual en este entorno temporal. No hay acciones de publicación o descarga ficticias. Los próximos módulos están indicados como futuros. Los mensajes confirman exclusivamente guardado temporal real.

Para ensayar visualmente: entra como Reclutador con la contraseña de demo-edit, inscribe el emisor y agrega una sesión en Agenda; después envía su práctica desde Evidencias. Cierra sesión y entra como Superadmin o Subadmin para revisar la práctica, guardar una evaluación y validarla. Historial conserva revisiones y notas durante la ejecución del servidor. Solo lectura no tiene emisor asignado al arrancar; el test de navegador asigna un emisor ficticio para verificar esa vista.

Capturas de la ejecución automatizada (datos ficticios): [escritorio](preview/training-desktop.png), [móvil](preview/training-mobile.png) y [catálogo de materiales](preview/training-library.png). No son una URL pública del sitio.

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
- **Enlace HTTPS público:** título y URL validados; vista previa muestra un enlace que el usuario debe abrir manualmente. El servidor no descarga contenido externo ni genera miniaturas. No se ofrece descarga de documentos para enlaces.

Las opciones allow_preview y allow_download se comprueban para cada revisión en cada petición, incluso para administradores. Un administrador puede obtener el contenido para preparar una nueva revisión mediante edit-data; eso no concede acceso de edición al resto de roles. Los datos de autor, estado y revisión se derivan del servidor, no de campos del navegador. Cambiar permisos en una revisión nueva no revoca el acceso a una revisión anterior: preserva su regla histórica.

`training_private.local_material_content` guarda documentos únicamente en la base en memoria, con RLS y sin acceso SQL directo de clientes. La ruta storage_path es una referencia interna del sandbox, no un bucket o enlace público. El workspace devuelve metadatos sin contenido ni URL externa; preview/download/edit-data verifican la sesión antes de recuperarlos. El texto se representa con textContent y se descarga como texto plano. La URL externa se devuelve solo para una vista previa autorizada, nunca se incrusta automáticamente.

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

El servidor rechaza orígenes externos y encabezados Host ajenos al loopback, limita intentos de login y tamaño del JSON, y nunca devuelve claves del examen ni credenciales. Para ensayar: iniciar sesión como demo-edit, inscribir el host/program impresos con zona America/Costa_Rica, crear una sesión con uno de los item_ids y fecha UTC, enviar descripción de práctica; después iniciar sesión como administrador, revisar evidencia, registrar evaluación y validar el item. Todas las respuestas guardadas duran solo mientras vive el proceso.

## Límites y siguiente trabajo

`bootstrap.sql` representa únicamente las claves UUID necesarias para el ensayo, no el esquema real de DatabasePad. `auth.uid()` se simula con un claim de sesión para probar RLS; no verifica tokens ni prueba el login. La ejecución en memoria no demuestra compatibilidad completa con Supabase/DatabasePad, Auth, Storage o PostgREST.

La API ya implementa validación de prácticas y gestión/publicación de temas y materiales de texto/enlace. Aún no implementa publicación/edición del programa, carga de PDF, imágenes, videos o diapositivas, archivos de evidencia, corrección del examen, actualización opcional del programa ni cálculo de porcentaje. Estos archivos requieren el futuro almacenamiento privado aislado; no se simulan subidas o conversiones. En este sandbox las evidencias son descripciones de prácticas. Los programas publicados son fixtures DEMO, no contenido real. La agenda se crea manualmente: falta generación automática, reprogramación y asistencia.

El fixture del banco contiene una pregunta ficticia: probar que question_count=50 no demuestra que un examen publicado tenga 50 preguntas. Esa comprobación de cantidad real corresponde a la futura operación transaccional de publicación. Los completions del primer test de RLS son fixtures de autorización; los tests HTTP, separados, sí exigen revisión y evaluación antes de completar una práctica. Faltan integración con identidad real de Supabase/DatabasePad, configuración del servicio alojado y pruebas de concurrencia en un entorno con múltiples conexiones. PGlite serializa las operaciones en una sola conexión; no se ha demostrado comportamiento distribuido.

Antes de conectar la interfaz, preparar un proveedor de identidad/API alojado independiente, confirmar el esquema real mediante lectura y probar las operaciones pendientes. No activar backend persistente ni cambiar login de la app compartida con este paquete. La rama actual de la app sigue apuntando al backend existente si se abre normalmente: este sandbox solo se ejecuta mediante los comandos anteriores y no debe confundirse con una copia aislada de toda la app. No se ejecutó build/TypeScript de la app porque sus fuentes y dependencias no cambiaron; los módulos Node se cargaron y ejecutaron en las pruebas.

No se modifica `main`, no se despliega y no se aplica SQL a bases alojadas. No hace falta revertir datos reales: nunca se escribieron. Para retirar estos ensayos basta revertir el commit que añade el paquete; la app no depende de él.
