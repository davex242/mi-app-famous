# Corrección de errores de lint y nueva revisión de runtime

Rama exclusiva: `base44/setup-b8f0f68b`. Solo Preview. No se modificó el padrón oficial, `main` ni producción.

## Correcciones realizadas

Se resolvieron los 59 errores de ESLint sin cambiar ni desactivar reglas:

- Tipos concretos para filas de verificación, actualizaciones de usuarios y configuración de comisiones.
- `unknown` para valores de auditoría y errores externos, con comprobaciones antes de leer sus campos.
- Extracción compartida de mensaje/código de error para objetos del proveedor y valores desconocidos. También se corrigió la precedencia de los mensajes de respaldo en formularios y operaciones masivas.
- Parámetros y resultados del adaptador SQL derivados de las declaraciones reales de `postgres@3.4.3`.
- Eliminación de conversiones `any` innecesarias en filtros, roles y despacho de operaciones.
- Variables constantes y escapes de expresión regular corregidos conservando la política de contraseñas.

## Validación

| Verificación | Resultado |
|---|---|
| `npm run lint` | Aprobada: **0 errores, 27 advertencias** |
| TypeScript de la aplicación | Aprobado |
| TypeScript del entrypoint alojado | Aprobado con tipos reales de postgres 3.4.3 y declaraciones de la interfaz Deno |
| Compilación Vite | Aprobada; persiste advertencia de tamaño del bundle |
| Archivos de pruebas `training-hosted/*.test.mjs` | **14 aprobados, 0 fallidos** |
| Nueva regresión de mensajes y contraseñas | Aprobada: objetos de error, valores desconocidos y conjunto de caracteres especiales ASCII |
| Edge Function `training-preview` v19 | ACTIVE; salud, normalización de imágenes, login real de cuenta ficticia, actor actual, alcance de workspace y logout aprobados |

La comprobación TypeScript del entrypoint usa los tipos reales de la dependencia y la interfaz del host; no sustituye una ejecución de `deno check` con el runtime Deno completo. La función se verificó además desplegada en Supabase.

Las 27 advertencias restantes corresponden a dependencias de hooks y organización para Fast Refresh. No impiden que el comando lint termine correctamente; no se ocultaron ni se convirtieron en errores omitidos.

## Registros runtime

La API de registros Supabase volvió a entregar resultados, incluida la consulta agregada de la última hora. Se revisaron una muestra de 100 entradas, los totales por origen/severidad y los eventos ERROR.

Se encontró un único ERROR de PostgreSQL: `permission denied for table training_exam_questions`, SQLSTATE `42501`. Corresponde a la comprobación de seguridad de lectura directa de preguntas. Las fuentes de Edge Function no mostraron eventos con severidad ERROR en esa consulta. Es evidencia de esa ventana, no una garantía sobre todos los periodos históricos.

La revisión anterior que informaba un error del proveedor se conserva como antecedente; la disponibilidad del endpoint se verificó nuevamente, sin asumir que el fallo anterior persistiera.

## Pendientes externos

El recorrido de navegador del Preview protegido sigue sin ejecutarse desde este entorno: la conexión al dominio de la rama continúa bloqueada por la política de red activa. Los dominios necesarios están guardados en el borrador. Hay que revisar/publicar ese entorno de Codex y usar una sesión autorizada de Vercel. No se creó una excepción ni se desactivó la protección del Preview.

La protección de contraseñas filtradas sigue requiriendo Supabase Pro; no se cambió la suscripción. Tampoco se aprobó una publicación en producción.
