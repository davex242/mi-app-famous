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

Resultado de esta entrega: **163 pruebas pasaron, 0 fallaron**, contando el test principal y sus subpruebas.

## Límites y siguiente trabajo

`bootstrap.sql` representa únicamente las claves UUID necesarias para el ensayo, no el esquema real de DatabasePad. `auth.uid()` se simula con un claim de sesión para probar RLS; no verifica tokens ni prueba el login. La ejecución en memoria no demuestra compatibilidad completa con Supabase/DatabasePad, Auth, Storage o PostgREST.

Las pruebas no implementan publicación, corrección del examen, conservación de progreso ni validación de prácticas. El fixture del banco contiene una pregunta ficticia: probar que question_count=50 no demuestra que un examen publicado tenga 50 preguntas. Esa comprobación de cantidad real corresponde a la futura operación transaccional de publicación. Los datos de completions también son fixtures de autorización, no evidencia de que pueda completarse el programa sin revisión. Faltan las pruebas de API, reglas de negocio, identidad y concurrencia en un entorno con múltiples conexiones.

Antes de conectar la interfaz, crear un entorno de autenticación/API independiente, confirmar el esquema real mediante lectura y probar todas las operaciones de servidor. No activar backend persistente ni cambiar login de la app compartida con este paquete. La rama actual de la app sigue apuntando al backend existente si se abre normalmente: este sandbox solo se ejecuta mediante los comandos anteriores y no debe confundirse con una copia aislada de toda la app.

No se modifica `main`, no se despliega y no se aplica SQL a bases alojadas. No hace falta revertir datos reales: nunca se escribieron. Para retirar estos ensayos basta revertir el commit que añade el paquete; la app no depende de él.
