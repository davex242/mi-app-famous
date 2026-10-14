# Integración pendiente: catálogo real de emisores registrados

Estado: contrato de diseño, NO integración activa ni permiso para modificar producción.

## Fuente de verdad
El selector actual consume `workspace.trainees`, que proviene del backend aislado de capacitación. La fuente oficial solicitada es la **base de datos de emisores registrados**, donde consta quién reclutó a cada emisor. No es la tabla de resultados de productividad. La aplicación principal configura DatabasePad en `src/lib/supabase.ts`; aún hay que verificar en lectura el esquema, claves, filtros y permisos efectivos de emisores registrados. No usar el Supabase de capacitación ni resultados como sustituto.

## Contrato propuesto (solo lectura)
Crear en el backend confiable un endpoint autenticado `GET /api/training/eligible-hosts?cursor=...` que lea el catálogo canónico de emisores registrados, con paginación, búsqueda por MICO ID/nombre de MICO y filtrado por asignaciones autorizadas. No debe aceptar roles ni scopes desde el navegador.

Campos de salida mínimos: `legacy_host_key` (opaco), `mico_id` (cadena, preservando ceros iniciales), `mico_name`, `original_recruiter_id`, `current_recruiter_id` (cuando exista asignación vigente distinta), `active`, `eligible`, `ineligibility_reason` y `training_host_id` si existe puente explícito verificado. No exponer correo Google, datos privados ni métricas de otros emisores. La inscripción debe usar el UUID canónico del puente, jamás convertir un ID MICO en UUID.

Si un emisor aparece en el registro de emisores y no existe aún puente al entrenamiento, mostrar «Pendiente de vinculación» y bloquear inscripción hasta completar la vinculación por servidor. Los cambios de nombre en MICO no deben duplicar registros. La ausencia de resultados de productividad no debe excluir a un emisor registrado: la elegibilidad es una regla administrativa separada de la existencia del perfil. Conservar reclutador original como dato histórico y responsable actual como asignación mutable; no sobreescribir uno con otro.

## Condiciones antes de conectar
1. Verificar en modo lectura la tabla de emisores registrados, su relación con el reclutador original y las asignaciones actuales, claves, unicidad de MICO ID, estatus, asignación y permisos efectivos.
2. Resolver el login del usuario actual con sesión verificada en servidor; no confiar en `localStorage` ni roles de cliente.
3. Definir cómo sincronizar altas, bajas, cambios de nombre, transferencia de agencia y reingresos; usar cursor/fecha de sincronización y reconciliación idempotente.
4. Aplicar permisos de agencia, reclutador y administrador en cada lectura e inscripción; bloquear lectura cruzada y dobles inscripciones activas.
5. Registrar fuente, versión, fecha, usuario actor y resultado de cada vinculación/inscripción.
6. Probar con emisores registrados reales autorizados en staging, no con datos de producción copiados sin control.

## Cuestionarios por sesión
No reutilizar indiscriminadamente el examen final: cada sesión necesita `quiz_version_id`, preguntas publicadas y respuestas privadas, `session_id`, `enrollment_id`, `host_id`, enlace tokenizado con expiración y revocación, intento único o política explícita, calificación en servidor y auditoría. Las respuestas y claves nunca deben llegar al cliente antes de entregar el intento. Cada intento pertenece a un único emisor. La asistencia y aprobación de evidencia no deben implicar aprobación automática del quiz.

## Examen final de 25
Publicar una NUEVA versión de 25 preguntas; no editar la versión histórica de 50 ni los intentos existentes. Definir banco suficiente, aleatorización, umbral (75% existente implica mínimo 19 aciertos de 25), política de tres intentos, bloqueo de respuestas y reglas de cierre. La versión actual de 50 continúa hasta publicación explícita de la nueva.

## Evidencia y pruebas de salida
Imágenes estáticas PNG/JPEG/WebP se normalizan a PNG en cliente, con validación de firma y tamaño en servidor. Verificar PDF y MP4 contra contratos de backend, límites y MIME. Ejecutar pruebas de API y navegador para 400, 401/403, duplicados, concurrencia, enlaces expirados, multi-emisor, permisos, recuperación de fallas y reintentos. No desplegar ni migrar sin aprobación explícita.
