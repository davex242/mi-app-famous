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
