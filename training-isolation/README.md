# Entrenamiento: entorno de pruebas aislado

Primera preparación de Etapa 3, exclusivamente en `base44/setup-b8f0f68b`.

Este paquete crea PostgreSQL en memoria con PGlite. No recibe URL de conexión, no utiliza el cliente de la app, no lee credenciales ni importa usuarios o emisores reales. La base temporal se cierra al terminar. La instalación inicial descarga una dependencia; la ejecución de las pruebas no necesita acceder a servicios alojados.

## Ejecutar

Desde la raíz del repositorio, con Node 20 o superior:

```sh
npm ci --prefix training-isolation --ignore-scripts
npm test --prefix training-isolation
```

La dependencia está fijada a `@electric-sql/pglite@0.5.9` y tiene su propio lockfile. No se cambian package.json ni package-lock.json de la app, ni se incluye PGlite en su bundle. Se eligió PostgreSQL en memoria porque en esta sesión no hay Docker/PostgreSQL nativo y el backend activo es DatabasePad, no un proyecto Supabase identificado entre los conectados. No se creó un proyecto cloud ni se modificó Mi Taller de Costura.

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

Resultado inicial: 163 pruebas de SQL/RLS pasaron. Con la API local añadida: **189 pruebas pasaron, 0 fallaron**, contando los tests principales y sus subpruebas. También se verificó el arranque de `server.mjs`: `/health` respondió 200 con `sandbox=true` y `storage=memory`.

## API y autenticación local añadidas

```sh
npm start --prefix training-isolation
```

Solo escucha en `http://127.0.0.1:4317`. Al arrancar imprime cuatro cuentas DEMO y contraseñas aleatorias que se regeneran cada vez, además de IDs de un emisor sintético asignado a demo-edit y un programa DEMO de 14 días. No hay interfaz gráfica ni conexiones a la app activa. Terminar el proceso elimina usuarios, sesiones y todos los datos.

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

La API ya implementa la validación de prácticas descrita arriba y prueba contraseñas/sesiones locales, permisos, suplantación de campos, revocación, rechazo/reenvío, auditoría e idempotencia. Aún no implementa publicación de contenidos, archivos de evidencia, corrección del examen, actualización opcional del programa ni cálculo de porcentaje. En este sandbox las evidencias son descripciones de prácticas; subir archivos se añadirá con almacenamiento privado separado. Los programas publicados son fixtures DEMO, no contenido real. La agenda se crea manualmente: falta generación automática, reprogramación y asistencia.

El fixture del banco contiene una pregunta ficticia: probar que question_count=50 no demuestra que un examen publicado tenga 50 preguntas. Esa comprobación de cantidad real corresponde a la futura operación transaccional de publicación. Los completions del primer test de RLS son fixtures de autorización; los tests HTTP, separados, sí exigen revisión y evaluación antes de completar una práctica. Faltan integración con identidad real de Supabase/DatabasePad, configuración del servicio alojado y pruebas de concurrencia en un entorno con múltiples conexiones. PGlite serializa las operaciones en una sola conexión; no se ha demostrado comportamiento distribuido.

Antes de conectar la interfaz, preparar un proveedor de identidad/API alojado independiente, confirmar el esquema real mediante lectura y probar las operaciones pendientes. No activar backend persistente ni cambiar login de la app compartida con este paquete. La rama actual de la app sigue apuntando al backend existente si se abre normalmente: este sandbox solo se ejecuta mediante los comandos anteriores y no debe confundirse con una copia aislada de toda la app. No se ejecutó build/TypeScript de la app porque sus fuentes y dependencias no cambiaron; los módulos Node se cargaron y ejecutaron en las pruebas.

No se modifica `main`, no se despliega y no se aplica SQL a bases alojadas. No hace falta revertir datos reales: nunca se escribieron. Para retirar estos ensayos basta revertir el commit que añade el paquete; la app no depende de él.
