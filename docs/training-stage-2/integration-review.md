# Revisión continua y preparación de integración

Fecha: 13 de octubre de 2026. Proyecto: `davex242/mi-app-famous`. Rama: `base44/setup-b8f0f68b`. Código base revisado: `87c112b66c48794ee3513269138939263cafd371`.

## Resultado y alcance

Resultado local: el recorrido continuo pasó sus 7 comprobaciones; el inventario de metadatos pasó 3 comprobaciones sintéticas. La suite previa cuenta con 394 pruebas SQL/API/persistencia y 97 de navegador. La regresión de las 97 comprobaciones de navegador se repitió por el cambio de interacción durante el guardado y pasó sin fallos. No equivale a una prueba de integración alojada.

El módulo funcional sigue separado de la app React. Esta revisión añade una prueba continua de navegador en almacenamiento local persistente, sin cambiar `src`, el login, dependencias de la app, main ni bases alojadas. La preparación inicial publica un catálogo/programa de tres prácticas y un quiz mediante la API administrativa real del sandbox; no precarga inscripciones, agenda, evidencias, evaluaciones, validaciones, intentos ni cierres. Es un programa sintético reducido para cubrir cada formato; no reemplaza los 14 días iniciales ni pretende evaluar la calidad pedagógica.

Se corrigió en la interfaz aislada la interacción rápida durante guardados: se oculta el éxito anterior, se deshabilitan campos/botones y se marca el contenido como ocupado hasta terminar. Así no se editan selecciones que la recarga posterior descartaría ni se confunde la confirmación anterior con el guardado actual. El recorrido comprueba que las tres asistencias y validaciones pertenecen a sus sesiones exactas.

La prueba ejecuta desde la interfaz: inscripción; propuesta de agenda sin escrituras y generación en zona Costa Rica; asistencia; envío de PNG/PDF/MP4 con consentimiento; consulta/descarga administrativa; revisión, evaluación y validación de cada práctica; comprobación de que 100% práctico no permite cerrar sin quiz; invitación; 50 respuestas desde navegador móvil; corrección privada; revisión y cierre administrativo; exportación JSON. Reinicia el servidor y verifica IDs, estado completado, bytes del informe y archivos. También verifica rechazo de nuevos envíos tras cierre, bloqueo del enlace del quiz y ausencia de solicitudes externas/errores JavaScript/credenciales en almacenamiento del navegador.

Ejecutar por separado de las suites de persistencia para evitar competir por memoria WASM:

```sh
BROWSER_EXECUTABLE_PATH=/ruta/al/chromium npm run test:journey --prefix training-isolation
```

El binario puede omitirse si Playwright tiene un Chromium compatible instalado. El ensayo crea y retira exclusivamente su almacén `qa-journey-<UUID>`; no usa ni restaura almacenes de usuario. No demuestra concurrencia distribuida, disponibilidad cloud, identidad del respondiente ni recuperación ante pérdida eléctrica. Las suites SQL/API/persistencia y navegador existentes completan las comprobaciones negativas y de aislamiento entre emisores; este recorrido no las sustituye.

## Hallazgos del código actual

Las siguientes observaciones provienen de archivos del commit base, sin consultar datos alojados. Los nombres de columnas son contratos del código, no prueba de su tipo SQL ni de los permisos efectivos.

| Área | Evidencia de código | Implicación para integración |
|---|---|---|
| Identidad | `src/context/AuthContext.tsx` consulta `app_users` por email, compara la entrada de contraseña directamente con `password_hash`, selecciona todas las columnas y restaura un objeto de `hostmanager_user` en localStorage | No hay sesión Supabase Auth verificada en ese flujo. No confiar en ese objeto/rol para autorizar entrenamiento. No se inspeccionó cómo están almacenadas realmente las contraseñas |
| Autorización | El mismo contexto calcula permisos a partir del rol del objeto del navegador | La API alojada debe verificar identidad y obtener rol, actividad y alcance actuales del servidor en cada operación |
| Backend | `src/lib/supabase.ts` crea un cliente SDK con URL de `databasepad.com` y clave embebida cuyo claim dice `anon` | El SDK y el nombre del cliente no prueban que Supabase Auth esté habilitado. Decodificar ese claim no verifica la firma ni los permisos de la clave. No se copiaron credenciales a este informe |
| Asignación de emisores | `src/components/RecruiterPortal.tsx` filtra `hosts.reclutador` por `user.name`; también solicita un listado general para leaderboard | No derivar permisos del entrenamiento por nombres. Revisar qué puede leer realmente cada rol antes de copiar ese patrón |
| IDs | `src/types/index.ts` usa strings para `Host.id` y `AppUser.id`, y contiene `reclutador`/`rec_id` | String en TypeScript no demuestra UUID ni una FK. El SQL de diseño asume UUID y debe seguir bloqueado hasta confirmar PK/FK reales |
| Interfaz principal | `HostTrainingDevelopment.tsx` monta componentes de Etapa 1 por rol; `src/types/training.ts` conserva DTO preparatorios | No está conectado a la API funcional del sandbox. Requiere un adaptador explícito, sin importar PGlite o credenciales DEMO al bundle de la app |
| Persistencia | PGlite conserva una instantánea privada local; no hay servicio alojado configurado para este módulo | No presentar el modo local como copia independiente alojada de toda la plataforma |

No se modificó el login ni se intentó iniciar sesión en DatabasePad. No se consultaron usuarios, emisores, contraseñas, grants o RLS reales. El script de metadatos se compila y ejecuta únicamente contra una base sintética de QA, con valores canario para comprobar que no devuelve contenidos de filas; también se verifica que READ ONLY impide escrituras. No se puede afirmar que el backend sea vulnerable o esté protegido únicamente a partir de ese código: los permisos efectivos siguen pendientes de lectura en el servicio correcto.

## Próximo trabajo concreto

1. Verificar el backend propietario de la URL actual y obtener una conexión de lectura **para ese proyecto exacto**. No sustituirlo por un proyecto Supabase de otra app. Recoger metadatos con [legacy-inspection.readonly.sql](legacy-inspection.readonly.sql), sin ejecutar el borrador de esquema.
2. Confirmar PK/tipos/FK y permisos/RLS de `hosts`/`app_users`, disponibilidad de `auth.users` y mecanismo de sesión realmente ofrecido. La existencia de tablas auth no demuestra por sí sola que su servicio esté habilitado o que las cuentas legacy estén vinculadas.
3. Preparar un backend de pruebas separado, identificado de forma inequívoca, con usuarios y emisores sintéticos. Mantener configuraciones/archivos/buckets de entrenamiento independientes y habilitación desactivada en producción. Todavía no se creó ese backend, feature flag ni despliegue.
4. Definir el proveedor de identidad de entrenamiento y su validación de servidor. Crear el puente de identidad verificada a `AppUser.id`, con unicidad y activación/revocación controladas. Mantener el login actual mientras se valida el flujo paralelo; no reutilizar sus datos de localStorage como prueba de identidad ni copiar contraseñas a otro proveedor.
5. Preparar una asignación revisable `Host.id -> AppUser.id` de reclutador. Las coincidencias por nombre/email/rec_id pueden generar candidatos, nunca asignaciones automáticas. Rechazar duplicados, cuentas inactivas y referencias huérfanas.
6. Adaptar los DTO/UI de la app al API alojado: actor solo del servidor, programa/revisión fijados, porcentaje derivado, IDs de sesión/item, evidencia privada y contratos de cierre/quiz. Mantener claves de corrección, tokens hash y claves privilegiadas fuera del cliente.
7. Repetir este recorrido contra staging real con roles separados, transferencias/revocaciones, dos conexiones concurrentes, expiración, fallos de red y respaldo/restauración. PGlite con una conexión no demuestra esos comportamientos.

## Criterios para aprobar una integración futura

| Criterio | Evidencia requerida | Estado de esta revisión |
|---|---|---|
| Recorrido funcional local | Navegador persistente, tres formatos, quiz y cierre tras reinicio | 7 comprobaciones del recorrido, todas pasaron |
| Identidad de servidor | Sesión firmada/verificada por el proveedor y puente de IDs comprobado | Pendiente |
| Alcance real por emisor | Asignaciones por ID, prueba de acceso ajeno denegado y cambios inmediatos | Local probado; alojado pendiente |
| Esquema legacy | Metadatos del proyecto correcto, UUID/FK confirmadas o diseño adaptado | Pendiente; script de lectura preparado |
| Almacenamiento alojado | Buckets privados, autorización, integridad y revocaciones/URLs verificadas | Pendiente |
| Concurrencia y resiliencia | Ensayos con más de una conexión y fallos controlados | Pendiente |
| Continuidad y reversión | Ensayo de desactivar módulo, conservar historial y restaurar copia | Local probado; despliegue pendiente |

## Respaldo y reversión

La rama es independiente de main y las nuevas escrituras de esta revisión son únicamente fixtures de QA. Para revertir **este** paso se revierte su commit en esta rama; no hay cambios de esquema, login o datos de usuario que revertir. El esquema local permanece compatible con la preparación de archivos del commit `734d2503fe0e5306de7e92075904ee1d7d32fad6`.

En una integración alojada futura, antes de habilitar: conservar artefacto de app anterior, respaldo consistente de datos y objetos, versión de esquema y configuraciones; ensayar restauración en una copia; fijar responsable y puntos de control. Preferir cambios aditivos y habilitación gradual. Ante un fallo, detener escrituras del nuevo módulo y desactivar su ruta, recuperar el artefacto anterior sin eliminar tablas/archivos históricos, y reconciliar las escrituras nuevas antes de restaurar datos. Revertir código no equivale a revertir datos; restaurar a un punto anterior puede perder escrituras posteriores y no debe hacerse automáticamente. No se afirma disponibilidad ininterrumpida. La continuidad operativa debe demostrarse en ese entorno; no puede garantizarse con pruebas locales.

## Referencias de implementación para la siguiente fase

Consultadas el 13 de octubre de 2026, para orientar el diseño; no prueban compatibilidad de DatabasePad ni justifican aplicar SQL allí:

- [Supabase: validación de usuario y clientes de servidor](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
- [Supabase: RLS y autorización por fila](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Changelog Supabase](https://supabase.com/changelog). La lectura de `changelog.md` falló por el tipo de contenido del recuperador; se consultó la versión HTML. No se instaló ni actualizó SDK/CLI ni se eligió un framework de servidor en esta revisión.
