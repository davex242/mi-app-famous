# Pruebas de cuestionarios — 2026-10-14

Entorno: Preview, sin alterar datos de emisores ni producción.

## Comprobaciones ejecutadas
- PASS: Vercel, commit 82ff179e849640e7e09f86dd7f14a1f848e53de9, estado READY. **Solo confirma compilación**.
- PASS: Supabase Edge Function training-preview v14 disponible. Inspección estática: admite bancos nuevos de 10 o 25 preguntas y versiones históricas de 50; exige cantidad completa de respuestas; verifica que la sesión del quiz pertenezca a la inscripción al emitir enlace.
- PASS: Inspección estática del editor React: distingue quiz de sesión (10) y examen final (25), y exige preguntas distintas y opciones válidas.
- PASS: Consultas SQL de solo lectura: 14 sesiones, 1 inscripción activa, 1 versión de examen, 2 invitaciones y 3 intentos. Examen existente: 50 preguntas. No hay sesiones completadas.
- PASS: Inspección estática del presupuesto: los intentos de quiz de sesión se excluyen del contador de examen final; cada quiz tiene presupuesto separado de 3 intentos.
- NO EJECUTADO: publicar un quiz de sesión y responderlo desde enlace real. No existe un banco de 10 preguntas publicado ni una sesión completada. Requiere sesión autenticada y creación de datos de prueba, para evitar modificar la única inscripción activa.
- NO EJECUTADO: verificar puntaje persistido y visible por emisor en pantalla tras envío real, caducidad 24h, reintentos y errores parciales. Requiere datos de prueba controlados y navegador con acceso al enlace.
- NO EJECUTADO: examen final de 25 preguntas de punta a punta. No existe aún una versión publicada de 25 preguntas.

## Observaciones
- READY no demuestra que la navegación y el envío real funcionen.
- La publicación del banco y las invitaciones deben probarse con una inscripción de prueba aislada, nunca alterando la inscripción activa sin autorización.
- El cierre del circuito requiere prueba autenticada: crear sesión/quiz de 10, publicar, emitir, abrir enlace, responder, calificar y confirmar persistencia por inscripción. Repetir con examen final de 25 y límites de intentos.

## Ejecución automatizada adicional (autorización expresa del propietario)
- PASS: migración `training_exam_question_counts_10_25_50` aplicada a la base Preview. Permite 10/25/50 preguntas y cambia el valor por defecto a 25.
- PASS: backend `training-preview` v15 registra `question_count` real al publicar, evitando el valor heredado de 50.
- ERROR DETECTADO Y CORREGIDO: la fórmula anterior de nota era `respuestas_correctas * 2`, válida solo para 50 preguntas. Backend v16 calcula `respuestas_correctas * 100 / total_preguntas`.
- PASS: prueba SQL automática con escritura transaccional para bancos de 10, 25 y 50, creación de preguntas y claves, validación de porcentaje y rechazo del tamaño inválido 11. El bloque de pruebas se revierte mediante subtransacción PL/pgSQL; no conserva registros.
- PASS: inspección de función publicada v16; el presupuesto de intentos de los cuestionarios de sesión se separa del examen final.
- SIN EJECUTAR: prueba HTTP real autenticada de publicación, emisión, apertura de enlace, entrega de respuestas y verificación de calificación. No se dispone de una sesión autenticada del navegador ni de credenciales de prueba para invocar ese flujo; no se sustituyó por operaciones SQL que eludirían permisos.
- SIN EJECUTAR: prueba de expiración de enlace, reintentos reales y errores parciales a través de la API.

Estado: **pruebas de esquema y lógica aprobadas; E2E HTTP no verificado**. No confundir pruebas SQL con pruebas del circuito de usuario.
