# Auditoría integral de capacitación — Preview

Fecha de trabajo: 14 de octubre de 2026 (Costa Rica). Los identificadores de ejecución de los fixtures usan UTC.

**Producción: NO APROBADA.** Seguimiento posterior: [59 errores de lint corregidos y registros revisados](lint-follow-up.md). Este informe distingue resultados locales, HTTP alojado y el recorrido de navegador protegido por Vercel. No se modifica `main`, producción ni el padrón oficial de DatabasePad.

## Destinos y cambios

- Rama exclusiva: `base44/setup-b8f0f68b`.
- Supabase separado: `jpnsxrzlthkvyphepbao`; se inspeccionó la función real v16 antes de cambiarla.
- La política de inscripción ya estaba corregida, pero el servicio y la política de invitaciones seguían dependiendo de la asignación global. Workspace, presupuestos, invitaciones, revocaciones, etiquetas y cierres ahora siguen `training_enrollments.recruiter_id`.
- La transferencia conserva emisor, inscripción, historial y reclutador original. La asignación original únicamente autoriza crear nuevas inscripciones; no permite consultar las capacitaciones transferidas.
- El índice permite cursos distintos simultáneos y evita repetir una versión activa, pausada o completada para reiniciar el avance.
- Bancos de 10/25/50 conservan su tamaño real. Calificación: `aciertos * 100 / preguntas`. Cada quiz de sesión tiene presupuesto separado del examen final y exige una sesión completada de la misma inscripción.
- El cierre verifica las respuestas privadas y el porcentaje real; un quiz de sesión no sustituye el examen final.
- Los reportes distinguen quiz y examen final, muestran `score_percent`, filtran y exportan CSV con protección ante fórmulas, incluso con espacios iniciales.
- Las instrucciones, contador y botón del quiz público usan el número real de preguntas.
- Se corrigieron errores TypeScript, argumentos de auditoría y una carrera que restauraba credenciales si la renovación terminaba después del logout; la limpieza de sesión y las expectativas antiguas de las pruebas se verificaron sin desactivar reglas ni autenticación.

### Defecto encontrado exclusivamente en HTTP alojado

`postgres.js` serializaba nuevamente las cadenas JSON que PGlite aceptaba directamente. Las opciones se guardaban como un escalar JSON y violaban la restricción de arreglo; los eventos quedaban como cadenas JSON. Se añadieron conversiones explícitas `::text::jsonb` en preguntas y auditoría. La v18 incluye esta corrección.

`event-json-repair.sql` recuperó 154 eventos codificados como cadenas, conservando exactamente sus valores lógicos. Se guardó una copia privada de la representación anterior fuera del repositorio. Las cadenas malformadas o que no representan objetos se conservan para revisión. Después de la reparación se verificaron 217 eventos de tipo objeto. No se alteraron usuarios ni emisores oficiales.

## Evidencia automatizada local

| Comando/grupo | Resultado final |
|---|---|
| `npm test --prefix training-isolation` | 395 pruebas de lógica/SQL/API + 26 de persistencia/recuperación: aprobadas |
| `npm run test:ui --prefix training-isolation` | 97 pruebas: aprobadas; escritorio, móvil, evidencias y quiz |
| `node --test training-isolation/enrollment-transfer.test.mjs` | 7 pruebas: aprobadas; 50 emisores, cinco entrenadores, tres programas y lote 28/30 |
| `node --test --test-concurrency=1 training-hosted/*.test.mjs` | 13 archivos de pruebas: aprobados; identidad, transporte, proxy, esquema, imágenes y reportes |
| Reprueba posterior a conversión JSON | 48 pruebas de API/importación/quiz móvil: aprobadas |
| Reprueba de inscripción completada y transferencia | 26 pruebas: aprobadas |
| `npx --no-install tsc -p tsconfig.app.json --noEmit` | Aprobado |
| `npm run build` | Aprobado; advertencia de tamaño del bundle y Browserslist antiguo |
| `npm run lint` | Seguimiento: aprobado, 0 errores y 27 advertencias; ver detalle del seguimiento |

Los grupos se solapan: las repruebas no deben sumarse como casos nuevos. Los archivos de pruebas alojadas contienen además aserciones internas que no se presentan como casos del runner Node.

## Fixtures alojados

El manifiesto `hosted-fixture.json` vive fuera del repositorio, en el directorio de resultados. Contiene únicamente identificadores de prueba, nunca contraseñas, tokens ni claves. Se conservan 50 emisores con prefijo `FICTITIOUS-QA-`, cinco entrenadores ficticios y tres programas de 14 días. Hay una cuenta administrativa sintética adicional para revisar evidencias y permisos; no representa una persona real. Los IDs MICO y vínculos con el padrón oficial quedan vacíos.

Las cuentas de prueba se aprovisionan mediante la API administrativa de Auth y la identidad interna de capacitación. Las pruebas se autentican después mediante contraseña real y tokens firmados del proveedor; no fabrican JWT, no desactivan RLS y no reutilizan cuentas oficiales. Las contraseñas aleatorias permanecen en memoria. La restauración de pruebas resetea únicamente las contraseñas de cuentas cuyo `qa_run` coincide con el manifiesto.

## Reproducción

Requiere los secretos seguros `SUPABASE_ACCESS_TOKEN` y `VERCEL_TOKEN` con los destinos declarados en el entorno. No se imprimen sus valores. Los siguientes comandos escriben únicamente en el proyecto de capacitación fijado en el código y requieren autorización explícita de ejecución:

```sh
python3 training-hosted/preview-acceptance.py --run-preview
node training-hosted/prepare-preview-evidence.mjs
PYTHONDONTWRITEBYTECODE=1 python3 training-hosted/preview-journey.py --run-preview
```

`TRAINING_QA_OUTPUT` permite elegir el directorio de resultados; el predeterminado es `/workspace/training-qa`. Cada ejecución de preparación crea un lote nuevo claramente identificado. No ejecutar repetidamente una preparación fallida sin inspeccionar los registros y el manifiesto: reutilizar el lote ya creado evita duplicar fixtures. Los datos aprobados son exclusivamente contenidos ficticios de Preview.

JPEG y WebP pasan por el preparador real del navegador antes de subir como PNG. Se compara el checksum descargado y los píxeles decodificados; la normalización puede cambiar los bytes comprimidos sin cambiar la imagen. PDF y MP4 deben conservar exactamente sus bytes.

## Límites de liberación y operación

- Las políticas privadas sin SELECT son intencionalmente de denegación total. El asesor de seguridad solo añadió una advertencia de protección de contraseñas filtradas desactivada. Intentar activarla devolvió HTTP 402: requiere plan Pro; no se cambió la suscripción.
- La API de registros Supabase devuelve `Backend error! Retry your query` aun con HTTP 200. No se considera una revisión de registros completada. La ruta consultada de runtime de Vercel devolvió 404; sí se recuperaron eventos de compilación.
- La integración completa del login existente y el navegador en el Preview protegido requiere una sesión de Vercel y acceso de red al dominio Preview. No se desactiva la protección ni se crea una excepción de autenticación.
- Un despliegue `READY` prueba compilación y publicación de Preview, no el flujo de usuario.
- No se ejecutó una prueba sobre el padrón oficial ni una promoción a producción. La coincidencia con datos oficiales y el acceso de usuarios reales quedan fuera de los fixtures.
- Los cambios de esquema son independientes del despliegue. Para rollback conservar los datos, detener el acceso al módulo Preview y recuperar una versión revisada del servicio; no reintroducir las políticas globales defectuosas ni borrar inscripciones.
- Se guardaron `install_script`, `start_skill` y destinos de red en el borrador del entorno. Requieren revisión/publicación del entorno; guardar el borrador no publica la aplicación.

## Resultados HTTP y estado por fase

Se aprobaron **80 comprobaciones HTTP alojadas** y cinco comprobaciones SQL de RLS/permisos. El recorrido ampliado contiene 59 comprobaciones HTTP, incluyendo 14 prácticas, 14 quizzes individuales de diez preguntas, final de 25 preguntas con 19 aciertos (76%), autorización de extras, cierre y exportación. Es una simulación del recorrido de 14 días, no una afirmación de que hayan transcurrido 14 días naturales. El detalle sanitizado está en [results.json](results.json).

| Fase | Resultado y límite |
|---|---|
| 1. Identidades y base | Cuentas sintéticas con Auth real y permisos actuales: aprobado. Conciliación sobre padrón oficial: no ejecutada |
| 2. Inscripciones y entrenadores | 50 emisores, cinco entrenadores, tres cursos; transferencia y coexistencia por curso con reclutador original intacto: aprobado |
| 3. Sesiones y evaluaciones | 14 prácticas y quizzes; bancos 10/25/50, mínimo 75%, tres intentos y extras aprobados: aprobado |
| 4. Evidencias y seguimiento | PNG/JPEG/WebP/PDF/MP4 alojados, consentimiento, checksum/contenido, rechazo por alcance; alertas y evaluación más reciente en navegador aislado: aprobado |
| 5. Reportes | Cierre/exportación alojados; estadísticas, filtros y CSV protegido en navegador aislado: aprobado. Navegación del Preview protegido no ejecutada |
| 6. Seguridad | JWT real, cuenta activa, RLS, denegación de preguntas/claves por Data API, permisos cruzados, caducidad y carrera de renovación/logout: aprobado; advertencia de HIBP requiere plan Pro |
| 7. Liberación | Build/TypeScript y Preview: aprobados. Lint y registros Supabase resueltos en el seguimiento; recorrido autenticado del Preview protegido: pendiente; producción no aprobada |

La caída de respuesta se prueba en Chromium para 10/25/50 preguntas: se conserva el formulario y se reenvía exactamente el mismo intento y respuestas. La idempotencia real del servidor se verifica además en las entregas HTTP alojadas. Los resultados esperados 401/403/404/409 no se cuentan como defectos ni como operaciones exitosas; sus pruebas pasan cuando la denegación corresponde al caso.

Se eliminaron las seis cuentas sin uso del primer aprovisionamiento fallido; se conservaron únicamente cinco entrenadores y un administrador ficticio del lote de 50 emisores, además de los dos usuarios y dos emisores previos del proyecto.

## Commits y despliegues

- `b726487`: alcance por inscripción, calificación variable y regresión inicial.
- `cb28fd2`: parámetros JSON del runtime alojado y recorrido de aceptación.
- Las correcciones finales de sesión, pruebas de reintentos y este informe forman el commit de cierre de la rama; consultar `git log` para su SHA.
- Edge Function: v16 inspeccionada; v17 desplegada para alcance/calificación; v18 desplegada para corregir JSON y verificada por HTTP real.
- Vercel Preview del commit `cb28fd2`: `dpl_7911ZGq7FtnGtHvBVwQuqxSbxwps`, READY; 52 eventos de compilación inspeccionados, ninguno de tipo error. La rama publica los commits posteriores automáticamente como Preview, nunca como producción.
- Enlace estable de la rama: https://mi-app-famous-git-base44-setup-b8f0f68b-davex242s-projects.vercel.app (con protección Vercel).

## Acciones externas pendientes

1. Revisar/publicar el borrador del entorno para activar los destinos de red Preview y conservar la instalación y el arranque. Esto no publica la aplicación en producción.
2. Verificar el login completo y la navegación con una sesión autorizada de Vercel. No se crearon excepciones a su protección.
3. Los registros Supabase se recuperaron y revisaron en el seguimiento; falta revisar el runtime del gateway durante el recorrido autenticado de Vercel.
4. Decidir si contratar Pro para activar protección contra contraseñas filtradas. No se cambió el plan.
5. Los 59 errores de lint se corrigieron en el seguimiento; quedan 27 advertencias visibles para mantenimiento.

**Recomendación:** conservar en Preview. El flujo sintético alojado funciona, pero aún no existe evidencia suficiente para aprobar producción.
