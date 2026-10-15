# Entorno publicado: red y navegación pendiente

Comprobación: 14 de octubre de 2026, Costa Rica; 15 de octubre 03:52–03:57 UTC. Rama `base44/setup-b8f0f68b`. Evidencia sanitizada: [JSON](published-network-results.json).

## Estado comprobado nuevamente

- Supabase `jpnsxrzlthkvyphepbao`: `training-preview` v19 ACTIVE; health HTTP 200.
- Vercel Preview `dpl_GtnTot97KvpWSUMtAskpiDHePfUW`: READY, `target: null`, código `fe4f2e2925506d152f943017e9f7b993651efa6e`.
- API de Vercel: consulta autenticada del proyecto HTTP 200.
- Fixtures existentes: 50 emisores y cinco entrenadores ficticios. No se aprovisionaron cuentas, no se restablecieron contraseñas y no se modificaron datos de capacitación en esta ejecución.
- Supabase, ventana 02:53:31–03:53:31 UTC: 524 entradas agregadas, únicamente INFO y LOG; ninguna con severidad ERROR. Es una comprobación temporal, no demuestra ausencia histórica de defectos.
- Runtime de Vercel: consulta de lectura `POST /v1/observability/events`, evento `vercel.log`, restringida al proyecto, deployment anterior y `environment:"preview"`: HTTP 403, `{"error":{"code":"forbidden","message":"Forbidden"}}`. Endpoint y esquema contrastados con el paquete oficial `vercel@64.2.0`. Esto es una denegación de la API de observabilidad, distinta del rechazo CONNECT. No se puede concluir que el runtime de Vercel esté libre de errores. No se cambiaron permisos ni planes.

## Bloqueo reproducido

La configuración publicada tiene versión `62f7e34c-cb72-4fab-8a04-d5772b4c98aa~cecfgver_6ad0479e92a081948bbe1ebc3e33bcc2` y `draft_id: null`. Su allowlist personalizada incluye exactamente estos dominios probados:

- `mi-app-famous-git-base44-setup-b8f0f68b-davex242s-projects.vercel.app`
- `mi-app-famous-bi7c73hf2-davex242s-projects.vercel.app`

Ambos devuelven `Tunnel connection failed: 403 Forbidden` al consultar `/api/training/health`. curl reproduce el rechazo para `/`:

```text
curl: (56) CONNECT tunnel failed, response 403
HTTP/1.1 403 Forbidden
content-length: 16
content-type: text/plain
date: Thu, 15 Oct 2026 03:54:42 GMT
server: envoy
```

Chromium real, con Playwright, falla al navegar al alias de rama con `net::ERR_TUNNEL_CONNECTION_FAILED`; falla la petición del documento inicial. No se alcanza el formulario de login ni se recibe una respuesta de autenticación de la aplicación. No hay identificador de correlación en las cabeceras recibidas. No se desactivó el proxy, TLS ni ningún control de autenticación.

La URL inmutable del deployment actual termina en `h9ixtgatq`; no está en la allowlist publicada. No se usa su posible rechazo como evidencia de un fallo del proxy: el problema demostrado afecta al alias estable y al deployment antiguo que sí están explícitamente permitidos.

## Resultado del recorrido solicitado

| Comprobación en Preview publicado | Resultado de esta ejecución |
|---|---|
| Documento inicial en navegador | Fallido: túnel del proxy |
| Login con cuentas ficticias | No ejecutado: documento inaccesible |
| Paneles de administrador y entrenador | No ejecutado |
| Transferencia y pérdida/ganancia de acceso | No ejecutado |
| Cuestionarios y resultados por emisor | No ejecutado |
| Carga y revisión de evidencias | No ejecutado |
| Reportes, filtros y CSV | No ejecutado |
| Navegación móvil y escritorio | No ejecutado: mismo prerrequisito de red |
| Estado remoto, health y conteo de fixtures | Aprobado |
| Registros de Supabase | Consultados; sin ERROR en la ventana indicada |
| Registros de runtime de Vercel | Pendientes: API devuelve forbidden |

Las pruebas locales y HTTP de informes anteriores conservan su valor histórico; no sustituyen estas comprobaciones de navegador y no se cuentan como aprobadas nuevamente. No hubo cambios de código ni necesidad de repetir compilación o pruebas unitarias para este informe documental.

## Solicitud concreta para soporte de Codex

Investigar la discrepancia entre la allowlist publicada de la versión indicada y la política efectiva de egress del proxy Envoy de esta tarea. Verificar la aplicación de entradas exactas para ambos hosts, la decisión/razón de rechazo CONNECT y la resolución DNS usada por el proxy. Las APIs de Supabase y Vercel responden 200 desde el mismo entorno; los hosts Preview permitidos reciben 403 antes de establecer TLS con el origen. Adjuntar este informe y su JSON, junto con el identificador de la tarea/entorno que muestra la interfaz de Codex. Desde esta sesión no hay herramienta para inspeccionar la política efectiva ni reiniciar/publicar el entorno; no se puede atribuir una causa interna concreta sin soporte.

No hace falta volver a añadir los mismos dominios ni volver a aprovisionar fixtures. Una vez corregido el egress, ejecutar el recorrido autenticado usando las cuentas sintéticas existentes y los flujos normales de autenticación. Para los registros de Vercel, un administrador debe revisar el permiso de lectura de Observability del token o exportar los logs de este deployment Preview desde el panel; no se necesita acceso a producción.

**Producción sigue sin aprobación:** falta completar la navegación autenticada alojada y revisar el runtime de Vercel. Este informe prepara la escalación; no se ha enviado un ticket a terceros.
