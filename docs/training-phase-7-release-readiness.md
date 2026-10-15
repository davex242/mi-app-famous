# Mi App Famous — Fase 7: pruebas finales y publicación

Estado: **NO APROBADO PARA PUBLICACIÓN**. Fecha de registro: 2026-10-14.
Entorno autorizado: rama Preview `base44/setup-b8f0f68b`. No fusionar a producción hasta cumplir todos los criterios.

## 1. Pruebas de punta a punta con datos autorizados
- [ ] Alta de emisor por ID interno oficial y verificación con ID MICO.
- [ ] Inscripción, asignación y transferencia de responsable conservando reclutador original.
- [ ] Agenda de 14 días, asistencia, quiz de 10 preguntas por sesión, evidencias, cierre.
- [ ] Examen final de 25 preguntas, 75 % de aprobación, tres intentos iniciales y autorización de extras.
- [ ] Confirmar acceso al enlace individual y registro de respuestas por emisor.

## 2. Grupos grandes y operaciones masivas
- [ ] Lotes de 10, 25 y 50 participantes, errores parciales y reintentos sin duplicados.
- [ ] Carga de evidencia, asistencia y emisión de quiz con 2 fallos entre 30 participantes; los otros 28 deben procesarse.
- [ ] Reasignación y visibilidad del nuevo responsable en cursos separados.

## 3. Migraciones y compatibilidad
- [ ] Inspección de migraciones pendientes y políticas de acceso; sin ejecutar modificaciones no aprobadas.
- [ ] Confirmar esquema de capacitación y coexistencia con el padrón oficial de emisores.
- [ ] Compatibilidad móvil, escritorio, formatos PNG/JPEG/WebP/PDF/MP4.

## 4. Vercel y Supabase
- [x] Último despliegue conocido de la Fase 5, commit `9724c2d`, estado Vercel **READY** (estado de construcción, no prueba funcional).
- [ ] Revisar registros de compilación, runtime y Edge Function; corregir fallos y repetir pruebas.
- [ ] Revisar control de permisos por inscripción; el acceso sigue parcialmente ligado a la asignación global de host.

## 5. Publicación controlada
- [ ] Validación de las fases 1–6 y aprobación explícita para publicar.
- [ ] Plan de rollback, copia de seguridad y criterios de aceptación.
- [ ] Desplegar de forma controlada y verificar inmediatamente después.

## 6. Operación y recuperación
- [ ] Guía de responsables, usuarios, incidencias y restablecimiento.
- [ ] Procedimiento de sesión vencida, pérdida de conexión, recuperación de datos y exportación.
- [ ] Registro de auditoría de cambios sensibles con identidad, fecha y contexto.

## Bloqueos funcionales conocidos
1. El quiz automático de 10 preguntas por sesión no está implementado integralmente.
2. El backend del examen final todavía valida 50 preguntas, no las 25 acordadas.
3. La reasignación de responsable requiere ajustar el alcance de lectura y las autorizaciones de workspace.
4. Fase 6 requiere pruebas integrales de permisos y acceso cruzado.
5. Las alertas de Fase 4 son calculadas en la interfaz y requieren validación con casos reales.

**Regla de liberación:** ningún indicador READY de Vercel autoriza por sí solo publicar; no modificar producción ni el padrón oficial durante esta fase sin aprobación.
