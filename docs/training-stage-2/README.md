# Host Training & Development — Etapa 2

Estado: diseño para revisión, NO aplicado. Repositorio `davex242/mi-app-famous`, rama exclusiva `base44/setup-b8f0f68b`. Base revisada: `047b8e4bedb7452741a0f191a9de7b129c453e99`.

## Alcance y hallazgos verificados

Se revisaron AppLayout, Sidebar, AuthContext, RecruiterPortal, types/index y types/training. El módulo de Etapa 1 está integrado; superadmin/subadmin ven administración, edit ve su espacio de reclutador y readonly tiene el mismo espacio de solo lectura. No se verificaron sesiones reales de esos roles.

AuthContext consulta `app_users` comparando el valor recibido con `password_hash` y conserva el objeto en localStorage. No llama a Supabase Auth. No podemos afirmar cómo está almacenado realmente el campo de contraseña, pero este flujo no constituye una identidad verificable para RLS. Nunca usar el usuario, rol ni ID enviado por el navegador como autorización. No se cambió ese código.

RecruiterPortal relaciona emisores por `hosts.reclutador` y nombre del usuario. Eso sirve para la vista existente, pero no debe autorizar entrenamiento: se propone una asignación administrativa explícita Host.id → AppUser.id. `hosts.host_id` es el identificador externo del emisor; `hosts.id` es la ficha interna que debe recibir el resultado.

No hay archivos SQL del esquema en el árbol revisado. Los tipos físicos, claves y políticas actuales de `hosts` y `app_users` siguen sin verificar. El SQL no crea enlaces a un proyecto Supabase ni requiere leer credenciales.

## Archivos

- `schema-and-rls.draft.sql`: propuesta de tablas, relaciones, índices y políticas de lectura. Tiene un bloqueo deliberado al inicio y termina en ROLLBACK. No es una migración instalable.
- Este documento: permisos, operaciones de servidor, correspondencia con los contratos de Etapa 1 y validación pendiente.

## Modelo y reglas

| Área | Tablas propuestas | Regla |
|---|---|---|
| Identidad y alcance | training_private.training_principals, training_private.training_host_assignments | Vínculo de identidad verificada y asignación por ID; gestión exclusivamente de servidor |
| Temas y materiales | training_topics, training_materials | Cada fila representa una revisión; content_key mantiene identidad lógica; revisiones publicadas son inmutables |
| Programa | training_program_versions, training_program_items | Versión numerada, días flexibles; duración inicial 14; práctica obligatoria por elemento |
| Inscripciones | training_enrollments, training_update_history | Versión fijada; actualizaciones opcionales, atómicas y auditadas |
| Agenda | training_sessions, training_attendance | Horas UTC + zona IANA; historial de cambios; asistencia no equivale a aprobación |
| Prácticas | training_evidence, training_assessments, training_approvals | Evidencias obligatorias y revisión administrativa; historial de rechazos y reenvíos |
| Progreso | training_completions | Solo servidor después de validación; no editable desde el cliente |
| Examen | training_exam_versions, training_exam_questions, training_exam_assignments, training_exam_attempts | 50 preguntas por versión emitida; resultado unido a Host.id |
| Datos privados del examen | training_private.training_exam_keys, training_private.training_exam_tokens, training_private.training_exam_answers | Claves, tokens y respuestas sin acceso directo desde el navegador |
| Auditoría | training_events | Actor real, acción y objeto; append-only para el servidor |

### Permisos previstos

| Acción | superadmin / subadmin | edit | readonly | Visitante del quiz |
|---|---|---|---|---|
| Catálogo | Leer todo, crear revisiones y publicar | Leer publicado | Leer publicado | Solo preguntas de su intento mediante servidor |
| Programas | Crear, versionar y publicar | Asignar versión publicada a sus emisores | Leer sus inscripciones | Ninguno |
| Agenda, asistencia, evidencias | Gestionar y validar | Gestionar solo emisores asignados; enviar evidencias | Leer solo emisores asignados | Ninguno |
| Aprobaciones y evaluaciones | Aprobar/rechazar y evaluar | Consultar sus resultados; no autoaprobar | Consultar sus resultados | Resultado limitado de su intento |
| Transferir emisor/reclutador | Autorizar y auditar | No | No | No |
| Actualizar programa en curso | Ofrecer/autorizar actualización | Aceptar para sus inscripciones, según regla administrativa | No | No |
| Banco de respuestas y secretos | Sin SELECT directo; edición por endpoint administrativo | No | No | No |

La lectura se protege mediante RLS. El catálogo archivado conserva lectura para usuarios autorizados por razones de historial; se oculta de las opciones de nuevas asignaciones en el servidor. TODAS las escrituras se proponen mediante operaciones de servidor con validación de rol, alcance, campos y estado. No se conceden INSERT/UPDATE/DELETE a `authenticated`; esto evita que un reclutador modifique su recruiter_id, score, aprobación o estado desde una llamada directa. RLS no sustituye las validaciones de negocio. `service_role` queda solo en servidor y omite RLS: cada operación debe revalidar permisos, nunca confiar en un ID aportado por el cliente.

La identidad propuesta es un puente privado a Supabase Auth, provisionado después de verificar la identidad por servidor. No se migra el login aquí. El rol del puente es autoritativo para el módulo, no se copia automáticamente de un objeto del navegador ni de una tabla legacy potencialmente editable. Activaciones, desactivaciones y cambios de rol deben sincronizarse por una operación segura; antes de habilitar el módulo debe resolverse quién puede escribir `app_users`. No convertir un token local en sesión de Supabase ni copiar contraseñas existentes.

Readonly solo accede al alcance explícitamente asignado, nunca a todos los emisores. Ambos administradores pueden publicar contenido, pero la gestión de roles permanece fuera del módulo.

### Versiones y progreso

Publicar valida materiales disponibles, días dentro de duration_days, items válidos y changelog. Una revisión publicada y sus referencias no se sobrescriben; se crea otra. Un enrollment apunta a una versión concreta. Para entrenamiento libre se usa una versión publicada independiente y `is_free_training=true`, conservando las mismas reglas de evidencias e historial.

Una actualización no se impone: registrar versión anterior/nueva, aceptación y actor. Bloquear la inscripción durante la transacción. Conservar completions, sesiones y evidencias antiguas. Reutilizar crédito solo para revisiones equivalentes verificadas por administrador; cambios sustanciales generan tareas pendientes. No rebajar ni recalcular retroactivamente la constancia ya emitida: guardar el porcentaje previo en update_history y calcular por separado el porcentaje sobre los requisitos nuevos. La regla exacta de equivalencia y el umbral de aprobación del quiz quedan por definir; no se inventa un porcentaje de aprobación.

La agenda genera una sesión por item, con idempotencia; la zona IANA de la inscripción convierte fecha local a UTC. No sobrescribir sesiones completadas ni ajustes manuales al regenerar. Guardar cada cambio en training_events.

Completar exige todas las prácticas obligatorias aprobadas, evaluaciones requeridas y quiz final aprobado cuando corresponda. Un reclutador puede enviar evidencia, pero no adjudicarse la aprobación. Una evidencia rechazada conserva el historial y un nuevo envío crea otra fila.

### Quiz público futuro

Público significa acceso mediante enlace de invitación, NO tablas públicas. El servidor crea un token aleatorio de alta entropía; almacena únicamente su hash en tabla privada; controla caducidad, revocación, límites de intentos y concurrencia. El token es una credencial: no registrarlo en auditoría, URL de analítica ni respuestas de error. Quien posee el enlace puede usarlo; sin verificación adicional no prueba quién respondió. Esa verificación y la política de reintentos deben decidirse antes de publicar.

El servidor fija exactamente 50 preguntas de una versión inmutable al emitir; start/submit validan el token y estado bajo bloqueo. Devuelve únicamente preguntas/opciones, recibe respuestas y corrige usando claves privadas. No acepta score/passed/host_id del cliente. Finaliza el intento de forma idempotente y calcula el resultado; no devuelve claves correctas. La ficha proviene de la asignación, nunca de un parámetro público libre. No se crean endpoints ni enlaces activos en esta etapa.

### Materiales y evidencias

Se reservan rutas, sin crear buckets. Futuro almacenamiento privado con URL firmada breve autorizada por servidor y registro de descargas; evidencias ligadas al alcance de la inscripción. Nunca permitir una ruta de otro emisor. `allow_download=false` elimina descarga ofrecida, pero una vista previa no impide capturas o copia. Materiales publicados deben permanecer disponibles para versiones históricas. Validar tipo, tamaño y contenido de los archivos antes de habilitar subidas.

## Contratos de Etapa 1

Los DTO actuales no cambian. ProgramDay.days se construye agrupando program_items; topic_ids representan las revisiones fijadas. progress_percent se deriva de completions, no es un valor confiable recibido del cliente. TrainingApproval.subject_type/subject_id se adapta desde las cinco FK exclusivas del SQL, evitando referencias polimórficas sin integridad. ExamQuestion nunca recibe correct_option. public_token_hash del DTO no se devuelve: en la UI permanece null; el hash vive en tabla privada. A futuro se añaden DTO específicos de versión y actualización sin alterar Host/AppUser.

## Bloqueos antes de Etapa 3

1. Confirmar el proyecto y obtener su esquema en modo lectura: tipos y PK de hosts.id/app_users.id, RLS/grants existentes y estado de autenticación. El SQL asume UUID y se detiene si no corresponde. No tocar tablas legacy en este diseño.
2. Implementar y probar identidad real; sanear permisos legacy; provisionar el puente y las asignaciones por ID con revisión administrativa. Desambiguar nombres repetidos, sin asignación automática silenciosa.
3. Definir umbral/reintentos/verificación del examen y equivalencia de actualizaciones. Mantener los 14 días iniciales como duración flexible, no como fecha límite obligatoria.
4. Implementar operaciones de servidor para publicar, inscribir, transferir, reprogramar, registrar asistencia, enviar/revisar evidencia, evaluar, actualizar versión y emitir/corregir quiz. Todos deben validar actor/rol/alcance; bloquear publicación y completions para edit/readonly.
5. Invariantes transaccionales: publicación inmutable, exactamente 50 preguntas y claves válidas, item/session/evidence de la misma inscripción, porcentaje derivado, terminalidad de intentos, expiración, idempotencia y auditoría real. El borrador no implementa esos endpoints.

## Validación de la entrega inicial de Etapa 2

Etapa 2 solo modifica documentación y SQL de diseño; no cambia React, dependencias, login ni configuración. No se ejecuta TypeScript/build para estos cambios documentales, ni se afirma que pasaron. Sin base local ni esquema confirmado, no se ha ejecutado este SQL ni se han probado políticas reales. La comprobación estática pasó: 18 tablas públicas con políticas SELECT, 5 tablas privadas sin acceso de cliente, ninguna concesión de escritura a authenticated, bloqueo de ejecución y rollback, sin claves correctas en la tabla pública de preguntas y sin DDL para hosts/app_users. No equivale a validación sintáctica/semántica ni a una prueba PostgreSQL.

Antes de aplicar en un entorno aislado, añadir y ejecutar pruebas SQL de permitir/denegar: identidad ausente/inactiva; cada rol; emisor propio/ajeno; editar actor/reclutador/score/aprobación; desactivación/transferencia inmediata; borradores ocultos; publicación y versiones históricas; update preservando progreso; intento de leer claves/tokens; examen de 49/51 preguntas; token inválido/caducado/revocado; doble submit y concurrencia; completions sin evidencia; readonly sin escritura. Revisar también planes de consulta e índices del alcance. Solo después generar una migración y solicitar la autorización de aplicación que corresponda al siguiente alcance.

Fuentes oficiales consultadas: https://supabase.com/docs/guides/database/postgres/row-level-security y https://supabase.com/docs/guides/database/postgres/column-level-security. El índice changelog.md no se pudo recuperar por el lector web (tipo text/markdown); no se implementan cambios de producto en esta etapa.

## Avance posterior: pruebas aisladas autorizadas

Se añadió `training-isolation/`, un paquete independiente con PostgreSQL en memoria y datos sintéticos. El SQL se ejecutó únicamente dentro de ese proceso temporal: el archivo de diseño mantiene intactos su bloqueo y ROLLBACK. Pasaron 163 pruebas de ejecución, RLS, grants, separación por ID, secretos, revocación e integridad. Ver `training-isolation/README.md` para reproducir y para los límites del ensayo. No se modificaron código/dependencias de la app, login, `main` ni bases alojadas. Esto reemplaza la limitación de no haber ejecutado SQL de la entrega inicial solamente para el entorno sintético; no confirma el esquema real ni la integración de autenticación o API.

Avance siguiente: el mismo paquete ahora incluye API HTTP local, sesiones opacas con contraseñas sintéticas, inscripciones, sesiones manuales, envío/revisión de evidencias, evaluaciones prácticas y validación administrativa de items. Total actualizado: 189 pruebas pasaron y el arranque local respondió correctamente. Esto prueba autenticación y autorización del sandbox, no el login de la app ni Supabase Auth. No se añadieron dependencias a la app ni se conectó su interfaz; continúan pendientes contenidos/publicación, almacenamiento, agenda automática, actualizaciones de programa y quiz final. Todo el estado de la API es temporal, en memoria.

Avance visual posterior: `training-isolation/web/` incorpora una interfaz independiente, servida por el mismo servidor local y conectada solo a su API. Se verificó en escritorio y móvil el flujo desde inscripción hasta validación, con permisos por rol. Resultado actual: 190 pruebas SQL/API y 9 pruebas de navegador pasaron. Las capturas y pasos para abrirla están en `training-isolation/README.md`. No se integró al AppLayout de la plataforma ni se desplegó: `main`, fuentes/dependencias de la app y base activa siguen sin cambios.

Avance del catálogo: la biblioteca permite crear borradores de temas/materiales, nuevas revisiones y publicación por ambos administradores. Hay vista previa y descarga de documentos de texto, y acceso manual a enlaces HTTPS. Las revisiones anteriores se conservan y el servidor rechaza modificaciones basadas en una revisión antigua. Resultado más reciente: 210 pruebas SQL/API y 15 pruebas de navegador pasaron. El contenido permanece en memoria; PDF/imágenes/videos y archivos de evidencia requieren almacenamiento privado futuro. Programas/agenda automática, actualizaciones y quiz siguen pendientes. No se aplica ninguna migración alojada ni se modifica la app activa.

Avance de programas/agenda: el sandbox añade constructor versionado, publicación con validación de referencias, agenda automática por zona horaria/días habilitados, propuesta previa sin guardar, reprogramación y asistencia auditada. La generación conserva sesiones previas y rechaza conflictos, horarios inexistentes/repetidos y operaciones fuera del alcance del actor. Las inscripciones no cambian de versión automáticamente. Resultado actual: 229 pruebas SQL/API y 20 de navegador pasaron. Las nuevas funciones se ejecutan exclusivamente en memoria; la aceptación opcional de actualizaciones, cálculo de porcentaje, almacenamiento de archivos y quiz continúan pendientes. Los pasos y límites están en `training-isolation/README.md`; main y la app activa permanecen fuera de estas modificaciones.

Avance de actualizaciones: se añade comparación/aceptación opcional de versiones del mismo programa, equivalencia exacta de requisitos, copia del crédito original sin modificar historial, porcentaje derivado de requisitos actuales y reconocimiento de sesiones conservadas tras varias actualizaciones. El porcentaje previo queda en update_history y los registros originales permanecen intactos. Resultado más reciente: 245 pruebas SQL/API y 24 de navegador pasaron. La regla y sus límites están documentados en `training-isolation/README.md`; el quiz final, los archivos y la persistencia/identidad alojadas siguen pendientes. Todo continúa en memoria, sin migraciones alojadas ni cambios a main.

Avance del quiz final: el sandbox publica versiones inmutables de 50 preguntas, requiere umbral explícito del administrador, emite invitaciones por emisor con intentos/vencimiento configurados y permite revocarlas. El visitante responde sin login del personal y el servidor corrige sin exponer las claves. El enlace autoriza una asignación; no verifica identidad, y la auditoría pública lo distingue del actor administrativo. Los resultados son visibles por alcance/RLS, preservan versiones e intentos, y no completan automáticamente todo el programa. Resultado actualizado: 266 pruebas SQL/API y 34 de navegador. Todo permanece temporal en memoria; no se ejecutó SQL alojado ni se modificó main. Persistencia, verificación de identidad, archivos y finalización integral/constancias siguen pendientes.

Avance de persistencia de prueba: se añade un modo local opcional de PGlite independiente, conservando el arranque predeterminado en memoria. La apertura valida una marca e identidad del sandbox y huella del esquema; no admite URLs ni rutas arbitrarias, carpetas ajenas, enlaces simbólicos, doble propietario o migraciones automáticas. El aprovisionamiento DEMO es transaccional y ocurre una sola vez; la contraseña elegida se deriva con scrypt y no se imprime. Los tests verifican cierre/reapertura con validaciones, actualizaciones opcionales, textos, auditoría y resultados del quiz; respaldo offline y restauración a una copia nueva sin tocar el original. La copia revoca sesiones y enlaces anteriores. Resultado actualizado: 280 pruebas SQL/API y 38 de navegador. La guía está en training-isolation/README.md. No se configuró un servicio cloud ni se modificó main, login, DatabasePad u otro proyecto; no se ejecutó SQL alojado. Persistencia/identidad alojadas, archivos y cierre integral continúan pendientes.

Avance de cierre administrativo: el sandbox permite revisar requisitos y confirmar por superadmin/subadmin con conclusión obligatoria. Exige prácticas vigentes validadas, sesiones completadas, evidencias aprobadas, últimas evaluaciones aprobadas y quiz aprobado ligado explícitamente a la versión actual del programa; vuelve a verificar las 50 respuestas privadas. La propuesta incluye hash y se rechaza si cambian los requisitos. El cierre es transaccional/idempotente y conserva actor, fecha, conclusión y snapshot en training_events; reclutador/readonly consultan únicamente el alcance actual. Inscripciones completadas bloquean escrituras/actualizaciones y el quiz público, sin alterar registros previos al publicar versiones futuras. Se comprobó conservación exacta tras reinicio local. Resultado actualizado: 303 pruebas SQL/API y 44 de navegador, 0 fallos. No se cambió el SQL de diseño, su huella ni se generó migración; main, login, fuentes/dependencias de la app y bases alojadas permanecen intactos. Identidad/servicio alojados, archivos privados, concurrencia distribuida y constancias formales siguen pendientes. Ver training-isolation/README.md para las reglas y límites.

Avance de exportación del cierre: se añade informe HTML independiente/imprimible y JSON versionado mediante endpoint autenticado con alcance actual del emisor. Exporta exclusivamente datos históricos del cierre, sin secretos del quiz, tokens ni hashes internos de petición. Los nombres no conservados no se deducen de perfiles actuales. Cada solicitud exitosa registra solicitante, formato y checksum SHA-256 sin alterar el cierre. El HTML escapa contenido activo y no usa scripts o recursos externos; permite imprimir/guardar PDF desde el navegador, sin generación PDF del servidor, firma digital o acreditación oficial. Se verificaron descargas reales en escritorio/móvil, revocación por reasignación y estabilidad exacta tras reinicio. Resultado actualizado: 312 pruebas SQL/API y 46 de navegador, 0 fallos. No se modificaron esquema/huella, main, app activa ni servicios alojados. Continúan pendientes identidad/integración alojadas, archivos privados, concurrencia distribuida y constancias oficiales.
