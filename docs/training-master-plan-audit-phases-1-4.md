# Mi App Famous — Registro de fases 1–4 (Preview)
Actualizado: 2026-10-14. Este registro separa implementación, verificación y deuda; no equivale a aprobación de producción.

## Fase 1 — Identidades y base
- Implementado: acceso a capacitación, entidades y vistas de trabajo; integración con padrón oficial.
- Auditoría: cotejar cobertura total del padrón, roles, permisos y sincronización sin modificar reclutador original; probar registros reales y duplicados.

## Fase 2 — Inscripciones y entrenadores
- Implementado: inscripción por emisor, asignación/reasignación de entrenador en Preview, conservación de inscripción al reasignar.
- Bloqueo: visibilidad del nuevo entrenador aún depende parcialmente de asignaciones globales de emisor; corregir autorización de workspace y rutas relacionadas, probar transferencia y acceso anterior/nuevo. Verificar compilación y flujo de identidad masiva.

## Fase 3 — Sesiones y evaluaciones
- Implementado: agenda, asistencia individual y masiva, evaluaciones administrativas, invitaciones individuales y emisión por lotes de examen, validación masiva de prácticas.
- Pendiente funcional: quiz de 10 preguntas al final de cada sesión con enlace individual y corrección automática; persistencia de respuestas y resultados por emisor; examen final de 25 preguntas (el backend actual valida 50); pruebas de intentos y flujos de participantes.

## Fase 4 — Evidencias y seguimiento
Alcance oficial: carga de imágenes/documentos; conversión segura; evidencia por participante y lote; aprobación/rechazo/comentarios; trazabilidad; alertas de pendientes, ausencias y resultados insuficientes.
- Implementado en Preview: archivos PNG/JPEG/WebP convertidos a PNG, PDF y MP4 con validación del servidor; envío por sesión y por lotes; revisión individual/masiva; eventos de auditoría; panel de seguimiento con alertas derivadas de evidencias pendientes, ausencias y evaluaciones no aprobadas.
- Pendiente de auditoría: compilación del Preview y pruebas reales de formatos, permisos, archivos y errores parciales; validar historial completo y actor responsable en cada evento; evitar alertas repetidas por evaluaciones históricas, revisar alertas de quiz por sesión y reglas de notificación persistente si las exige el plan.

## Reglas de entrega
- Solo rama `base44/setup-b8f0f68b`; no fusionar producción.
- No ejecutar migraciones ni modificar el padrón oficial sin revisión.
- No declarar cerrada una fase mientras queden funcionalidades obligatorias sin implementar. La auditoría integral se hará al finalizar las fases si el usuario así lo decide.
