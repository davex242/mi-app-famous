import {preparePrivateImage} from './image-input.mjs';
import { createProgramUI } from './programs-ui.mjs';
import { createUpdatesUI } from './updates-ui.mjs';
import { createExamsUI } from './exams-ui.mjs';
import {createClosingUI} from './closing-ui.mjs';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { token: null, actor: null, workspace: null, tab: 'overview', busy: false, catalogueMode: 'topics', catalogueHistory: false, editTopic: null, editMaterial: null };
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Costa_Rica';
const persistent=document.body.dataset.storage==='local-persistent';
const labels = { superadmin: 'Superadmin', subadmin: 'Subadmin', edit: 'Reclutador', readonly: 'Solo lectura' };
const statuses = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado', in_review: 'En revisión', pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', active: 'En curso', paused: 'En pausa', completed: 'Completada', cancelled: 'Cancelada', scheduled: 'Programada', missed: 'No realizada', rescheduled: 'Reprogramada' };
const errors = {
  'Choose one evidence file':'Adjunta una imagen, un PDF o un clip MP4 por evidencia.',
  'Evidence PDF preview unavailable':'Los PDF de evidencia se descargan sin visor integrado.',
  'Evidence file consent required':'Confirma que tienes autorización para adjuntar esta evidencia y el consentimiento de terceros, si aparecen.',
  'Private evidence content unavailable':'No se pudo verificar el archivo de evidencia. No se aprobó ni validó la práctica.',
  'Compatible MP4 H264 with optional AAC required':'Usa un MP4 progresivo compatible con H.264 y audio AAC opcional, sin pistas externas ni fragmentación.',
  'Video exceeds 2 MiB limit':'El video debe pesar como máximo 2 MiB.',
  'Video duration exceeds 60 seconds':'El clip debe durar como máximo 60 segundos.',
  'Video dimensions exceed sandbox limit':'El video admite hasta 1280 píxeles por lado y 921600 píxeles en total.',
  'Private video content unavailable':'No se pudo verificar el video privado de esta revisión.',
  'Static PDF without passwords, forms, actions or attachments required':'Usa un PDF estático compatible, sin contraseña, formularios, acciones ni archivos adjuntos, con 1 a 100 páginas.',
  'PDF exceeds 2 MiB limit':'El PDF debe pesar como máximo 2 MiB.',
  'Private PDF content unavailable':'No se pudo verificar el PDF privado de esta revisión.',
  'Valid RGB or RGBA PNG required':'Usa una imagen PNG RGB o RGBA de 8 bits, sin animación ni entrelazado.',
  'PNG exceeds 2 MiB limit':'La imagen PNG debe pesar como máximo 2 MiB.',
  'PNG dimensions exceed sandbox limit':'La imagen admite hasta 2048 píxeles por lado y 4 millones de píxeles en total.',
  'Private image content unavailable':'No se pudo verificar el archivo privado de esta imagen.',
  'Choose HTML or JSON report':'Selecciona informe HTML o registro JSON.',
  'Closing record is inconsistent':'Este registro necesita revisión administrativa antes de exportarse.',
  'Closing requirements changed; review again':'Los requisitos cambiaron. Revisa el cierre otra vez antes de confirmar.',
  'Training requirements are incomplete':'Todavía hay requisitos pendientes; no se cerró el entrenamiento.',
  'Training is already closed; its record cannot change':'Este entrenamiento ya fue cerrado y su registro se conserva sin cambios.',
  'Exactly 50 questions required':'El examen debe contener exactamente 50 preguntas.',
  'Explicit approval threshold required':'Indica un porcentaje de aprobación mayor que 0 y hasta 100, con máximo dos decimales.',
  'Invalid options':'Cada pregunta necesita de 2 a 6 opciones de texto.',
  'Invalid answer key':'Revisa las claves y evita opciones repetidas en una pregunta.',
  'Questions must be distinct':'Las 50 preguntas deben ser distintas.',
  'Exam version changed; refresh first':'La versión del examen cambió. Actualiza antes de publicar.',
  'Explicit attempt limit required':'Indica entre 1 y 10 intentos permitidos.',
  'Future expiry within 30 days required':'El vencimiento debe ser futuro y dentro de los próximos 30 días.',
  'Published exam required':'Selecciona un examen publicado.',
  'An invitation is already active':'Este entrenamiento ya tiene una invitación vigente. Puedes revocarla antes de emitir otra.',
  'Exam content is inconsistent':'El examen tiene contenido incompleto. Solicita una revisión administrativa.',
  'Invalid text':'Completa los textos requeridos y revisa su longitud.',
  'Invalid credentials': 'La cuenta o la contraseña DEMO no coinciden.',
  'Authentication required': 'La sesión venció o fue revocada. Inicia sesión otra vez.',
  'Record unavailable': 'No tienes acceso a ese registro o ya no está disponible.',
  'Write access denied': 'Tu cuenta tiene acceso de solo lectura.',
  'Administrative role required': 'Esta acción requiere un administrador.',
  'Operation conflicts with current data': 'La operación entra en conflicto con un registro existente. Revisa si ya está creado.',
  'Approved practical evidence required': 'Primero debe aprobarse una evidencia práctica de esta sesión.',
  'Passing administrative assessment required': 'Falta una evaluación administrativa satisfactoria.',
  'Evidence already reviewed': 'Esta evidencia ya fue revisada. Conservamos su historial.',
  'Enrollment is not active': 'La inscripción debe estar en curso para esta acción.',
  'Invalid fields': 'Los campos enviados no son válidos.',
  'Published program required': 'Selecciona un programa publicado.',
  'Try again later': 'Se alcanzó el límite de solicitudes. Espera un minuto.',
  'A newer revision exists': 'Existe una revisión más reciente. Actualiza la biblioteca antes de editar.',
  'Only the latest draft can be published': 'Solo se puede publicar el borrador más reciente.',
  'Publish the topic revision first': 'Primero debes publicar la revisión del tema al que pertenece el material.',
  'Preview is disabled for this revision': 'Esta revisión no permite vista previa.',
  'Download is disabled for this revision': 'Esta revisión no permite descarga.',
  'Valid public HTTPS link required': 'Usa un enlace HTTPS público, sin credenciales ni direcciones locales.',
  'A newer program version exists': 'Existe una versión más reciente de este programa. Actualiza antes de editar.',
  'Only the latest draft program can be published': 'Solo se puede publicar el borrador más reciente del programa.',
  'Publish required topic revisions and retain practical requirements': 'Publica los temas del programa y conserva las prácticas obligatorias.',
  'Publish required material revisions first': 'Primero publica los materiales seleccionados.',
  'Material must belong to the exact topic revision': 'Cada material debe pertenecer a la revisión exacta del tema elegido.',
  'Local time is skipped or repeated by a timezone change': 'Esa hora no existe o se repite por un cambio de horario. Elige otra hora.',
  'Agenda overlaps an existing session': 'La fecha se cruza con otra sesión del mismo emisor. Elige otro horario.',
  'Session schedule changed; refresh first': 'Otra acción cambió esta sesión. Actualiza la agenda antes de reprogramar.',
  'Completed sessions cannot be rescheduled': 'Las sesiones completadas conservan su fecha.',
  'Attendance changed; refresh first': 'La asistencia cambió. Actualiza antes de guardar otra revisión.',
  'Training changed; preview the update again': 'El entrenamiento cambió desde la comparación. Revisa la actualización otra vez.',
  'Enrollment version changed; preview again': 'La versión asignada cambió. Revisa una comparación nueva.',
  'Choose a newer published version of the same program': 'Selecciona una versión más reciente, publicada y del mismo programa.',
  'Only active or paused enrollments can update': 'Solo se pueden actualizar entrenamientos en curso o en pausa.',
  'This practice already has a preserved session': 'Esta práctica ya tiene una sesión conservada de una versión anterior.',
  'This practice is already validated': 'Esta práctica ya está validada.',
};
const isPDF=value=>value?.kind==='document'&&value.storage_path===`sandbox/materials/${value.id}.pdf`;
const isAdmin = () => ['superadmin', 'subadmin'].includes(state.actor?.role);
const canWrite = () => isAdmin() || state.actor?.role === 'edit';
const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
const empty = (title, detail) => `<div class="empty"><strong>${esc(title)}</strong>${esc(detail)}</div>`;
const pill = status => `<span class="pill ${['approved', 'completed', 'published'].includes(status) ? 'good' : status === 'rejected' ? 'rejected' : 'pending'}">${esc(statuses[status] || status)}</span>`;
const topic = id => state.workspace.topics.find(t => t.id === id)?.title || 'Tema DEMO';
const trainee = id => state.workspace.trainees.find(t => t.host_id === id)?.label || 'Emisor DEMO';
const enrollLabel = enrollment => `${trainee(enrollment.host_id)} · Programa ${state.workspace.program_versions.find(p => p.id === enrollment.program_version_id)?.version || 1}`;
const date = value => value ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(value)) : '—';
const programUI = createProgramUI({ state, zone, esc, opt, empty, pill, isAdmin, canWrite, api, action, render, notify, topic, date, enrollLabel });
const updatesUI = createUpdatesUI({state,esc,opt,empty,isAdmin,canWrite,api,action,render,notify,enrollLabel,topic,date,invalidateAgenda:programUI.invalidateAgenda});
const examsUI=createExamsUI({state,esc,opt,empty,isAdmin,canWrite,api,action,notify,render,enrollLabel,date});
const closingUI=createClosingUI({state,esc,opt,empty,isAdmin,api,action,render,notify,enrollLabel,topic,date});
function notify(message, error = false) {
  const node = $('#notice'); node.textContent = message; node.className = error ? 'error' : ''; node.hidden = false;
}
let materialVideoURL=null;
function clearMaterialVideo(){
  const video=$('#preview-video');if(video){video.onerror=null;video.pause();video.removeAttribute('src');video.load();}
  if(materialVideoURL){URL.revokeObjectURL(materialVideoURL);materialVideoURL=null;}
}
let evidenceVideoURL=null;
function clearEvidenceImage(){
  $('#evidence-preview-image')?.removeAttribute('src');
  const video=$('#evidence-preview-video');if(video){video.onerror=null;video.pause();video.removeAttribute('src');video.load();}
  if(evidenceVideoURL){URL.revokeObjectURL(evidenceVideoURL);evidenceVideoURL=null;}
}
function exitSession() {
  clearEvidenceImage();
  clearMaterialVideo();
  state.token = null; state.actor = null; state.workspace = null;
  state.editTopic = null; state.editMaterial = null; state.catalogueMode = 'topics'; state.catalogueHistory = false;
  programUI.reset();
  updatesUI.reset();
  examsUI.reset();
  closingUI.reset();
  $('#content').querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());$('#content').replaceChildren();
  $('#app-view').hidden = true; $('#login-view').hidden = false; $('#login-form').reset();
}
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.token) exitSession();
    throw new Error(errors[result.error] || result.error || 'No se pudo completar la acción.');
  }
  return result;
}
async function refresh() {
  // Re-read identity as well as data; role changes must update the view immediately.
  state.actor = await api('/api/me');
  state.workspace = await api('/api/workspace');
  render();
}
function render() {
  clearEvidenceImage();
  clearMaterialVideo();
  const w = state.workspace;
  $('#role-label').textContent = labels[state.actor.role];
  $('#workspace-title').textContent = isAdmin() ? 'Training Administration' : 'Recruiter Training Workspace';
  $('#workspace-subtitle').textContent = isAdmin() ? 'Acompaña el progreso y valida cada práctica.' : 'Tu agenda, tus emisores y su próximo paso.';
  $('#stats').innerHTML = [
    ['Emisores asignados', w.trainees.length, 'Perfiles ficticios'],
    ['Sesiones programadas', w.sessions.filter(s => ['scheduled','rescheduled'].includes(s.status)).length, 'Agenda de entrenamiento'],
    ['Evidencias pendientes', w.evidence.filter(e => e.status === 'pending').length, 'Esperan revisión administrativa'],
    ['Prácticas validadas', w.progress.reduce((n,p)=>n+p.completed_items,0), 'Validaciones de la versión asignada'],
  ].map(([name, count, note]) => `<article class="stat"><label>${name}</label><strong>${count}</strong><small>${note}</small></article>`).join('');
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === state.tab));
  const views = { overview, programs: programUI.renderPrograms, updates: updatesUI.renderUpdates, exams:examsUI.renderExams, closing:closingUI.renderClosing, agenda, evidence, library, history };
  $('#content').innerHTML = (state.actor.role === 'readonly' ? '<div class="readonly-note">Acceso de solo lectura: puedes consultar tu información asignada.</div>' : '') + views[state.tab]();
}
function overview() {
  const w = state.workspace, program = w.program_versions.find(p => p.id === w.enrollments[0]?.program_version_id) || w.program_versions[0];
  const available = w.trainees.filter(t => !w.enrollments.some(e => e.host_id === t.host_id && ['active', 'paused'].includes(e.status) && !e.is_free_training));
  const items = w.program_items.filter(item => item.program_version_id === program?.id).sort((a, b) => a.day - b.day);
  const grid = items.length ? `<div class="day-grid">${items.map(item => {
    const done = w.completions.filter(c => c.item_id === item.id).length;
    const planned = w.sessions.some(s => s.item_id === item.id);
    return `<div class="day ${done ? 'done' : planned ? 'planned' : ''}"><span>DÍA ${item.day}</span><strong>Práctica ${item.day}</strong><small>${done ? `${done} validada${done > 1 ? 's' : ''}` : planned ? 'En agenda' : 'Por programar'}</small></div>`;
  }).join('')}</div>` : empty('Sin programa publicado', 'El catálogo está vacío en este entorno.');
  const enrollmentForm = canWrite() ? `<form id="enroll-form"><label>Emisor<select name="host_id" required>${available.length ? available.map(t => opt(t.host_id, t.label)).join('') : opt('', 'Sin emisores pendientes de inscripción')}</select></label><label>Programa publicado<select name="program_version_id" required>${w.program_versions.filter(p => p.status === 'published').map(p => opt(p.id, p.title)).join('')}</select></label><label>Zona horaria<input name="timezone" value="${esc(zone)}" required></label><button class="primary" type="submit" ${!available.length ? 'disabled' : ''}>Inscribir emisor →</button></form>` : '<p class="caption">Las inscripciones las gestiona tu reclutador o un administrador.</p>';
  const shortcuts = [
    ['agenda', 'Agenda y asistencia', 'Consulta las sesiones y el registro de asistencia.'],
    ['evidence', isAdmin() ? 'Revisar evidencias' : 'Evidencias prácticas', `${w.evidence.filter(e=>e.status==='pending').length} pendientes de revisión administrativa.`],
    ['exams', 'Quiz final', 'Consulta la evaluación de 50 preguntas.'],
  ].map(([tab,title,description])=>`<button class="overview-shortcut" data-open-tab="${tab}"><strong>${esc(title)} <span aria-hidden="true">→</span></strong><span>${esc(description)}</span></button>`).join('');
  const rows = w.enrollments.map(e => {
    const progress=w.progress.find(p=>p.enrollment_id===e.id);
    const assigned=w.program_versions.find(p=>p.id===e.program_version_id);
    const percent=Math.min(100,Math.max(0,Number(progress?.percent)||0));
    return `<div class="list-row trainee-progress"><div><p>${esc(trainee(e.host_id))}</p><small>${esc(assigned?.title || 'Entrenamiento libre')} · ${esc(e.timezone)}</small><label class="progress-label">Prácticas validadas · ${progress?.completed_items || 0} de ${progress?.total_items || 0}<progress max="100" value="${percent}" aria-label="Prácticas validadas de ${esc(trainee(e.host_id))}">${percent}%</progress></label><small>${percent.toLocaleString('es-CR')}% de prácticas · El quiz y el cierre se revisan por separado.</small></div>${pill(e.status)}</div>`;
  }).join('');
  return `<section class="overview-start"><div><p class="eyebrow">TU PRÓXIMO PASO</p><h2>Todo el seguimiento, en un lugar</h2><p>Agenda, práctica y evaluación para acompañar a tus emisores.</p></div><div class="overview-shortcuts">${shortcuts}</div></section><div class="panel"><div class="panel-head"><div><h2>Un programa, a tu ritmo</h2><p>${esc(program?.title || 'Programa DEMO')} · Vista conjunta de prácticas de este programa.</p></div><span class="pill">${program ? `DEMO · ${program.duration_days} días` : 'SIN PROGRAMA'}</span></div>${grid}</div><div class="cols"><section class="panel"><h2>Emisores en entrenamiento</h2>${rows || empty('Todo empieza con una inscripción', 'Inscribe un emisor DEMO para comenzar su agenda.')}</section><section class="panel"><h2>${canWrite() ? 'Nueva inscripción' : 'Tu seguimiento'}</h2>${enrollmentForm}</section></div>`;
}
function agenda() {
  const w = state.workspace, active = w.enrollments.filter(e => e.status === 'active');
  const extras = programUI.renderAgendaExtras();
  const schedule = canWrite() ? `<section class="panel"><div class="panel-head"><div><h2>Programa una sesión</h2><p>Tu zona horaria: ${esc(zone)}. Elige una práctica pendiente de la versión asignada.</p></div></div><form id="schedule-form" class="form-grid"><label>Emisor en entrenamiento<select name="enrollment_id" required>${active.map(e => opt(e.id, enrollLabel(e))).join('')}</select></label><label>Práctica<select name="item_id" required>${itemOptions(active[0]?.id) || opt('', 'Todas las prácticas ya tienen sesión')}</select></label><label>Fecha y hora<input type="datetime-local" name="local_date" required></label><label>Duración en minutos<input type="number" name="duration_minutes" min="1" max="480" value="30" required></label><div class="wide"><button class="primary" type="submit" ${!active.length || !itemOptions(active[0]?.id) ? 'disabled' : ''}>Agregar a la agenda →</button></div></form></section>` : '';
  const rows = w.sessions.slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map(s => {
    const e = w.enrollments.find(e => e.id === s.enrollment_id);
    const attendance = w.attendance.find(a=>a.session_id===s.id);
    const attendanceLabels = {present:'Presente',absent:'Ausente',late:'Tarde',excused:'Justificada'};
    return `<tr><td>${esc(trainee(e?.host_id))}<small>${esc(topic(s.topic_id))}${s.current_item_id ? '' : ' · Histórica: versión anterior'}</small></td><td>${esc(date(s.scheduled_at))}<small>${s.duration_minutes} minutos</small></td><td>${pill(s.status)}</td><td>${esc(attendance ? attendanceLabels[attendance.status] : 'Sin registro')}</td></tr>`;
  }).join('');
  return extras.automatic + schedule + `<section class="panel"><div class="panel-head"><div><h2>Agenda de entrenamiento</h2><p>Las horas se muestran en tu zona: ${esc(zone)}.</p></div></div>${rows ? `<div class="table-scroll"><table><thead><tr><th>Emisor y práctica</th><th>Fecha</th><th>Estado</th><th>Asistencia</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('Tu agenda está lista para empezar', 'Crea una inscripción y programa su primera práctica.')}</section>` + extras.controls;
}
function itemOptions(enrollmentId) {
  const version = state.workspace.enrollments.find(e => e.id === enrollmentId)?.program_version_id;
  return state.workspace.program_items.filter(item => item.program_version_id === version && !state.workspace.sessions.some(s=>s.enrollment_id===enrollmentId && (s.current_item_id||s.item_id)===item.id) && !state.workspace.completions.some(c=>c.enrollment_id===enrollmentId && c.item_id===item.id)).sort((a, b) => a.day - b.day).map(item => opt(item.id, `Día ${item.day} · ${topic(item.topic_id)}`)).join('');
}
function evidence() {
  const w = state.workspace;
  const sessions = w.sessions.filter(s => w.enrollments.some(e => e.id === s.enrollment_id && e.status === 'active'));
  const submit = canWrite() ? `<section class="panel"><h2>Envía una práctica</h2><p>Describe lo que realizó el emisor y, si lo necesitas, adjunta una imagen, un PDF o un clip MP4 privado. Solo el personal con acceso actual a este emisor puede verla o descargarla.</p><form id="evidence-form"><label>Sesión<select name="session_id" required>${sessions.map(s => opt(s.id, `${enrollLabel(w.enrollments.find(e=>e.id===s.enrollment_id))} · ${topic(s.topic_id)} · ${date(s.scheduled_at)}`)).join('')}</select></label><label>Descripción de la práctica<textarea name="description" maxlength="2000" required placeholder="Qué se hizo, qué se aprendió y qué queda por mejorar…"></textarea></label><label>Tipo de archivo opcional<select name="evidence_kind"><option value="image">Imagen PNG o JPEG</option><option value="pdf">Documento PDF</option><option value="video">Clip MP4</option></select></label><label><span id="evidence-file-label">Imagen de evidencia (opcional)</span><input name="evidence_file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg"><small id="evidence-image-help">Máximo 2 MiB y 2048 píxeles por lado, hasta 4 millones de píxeles. PNG RGB/RGBA de 8 bits, sin animación ni entrelazado. JPEG se convierte a PNG y se reduce proporcionalmente hasta 768 píxeles por lado. Se eliminan los metadatos y el nombre original; la descarga será PNG.</small><small id="evidence-pdf-help" hidden>Máximo 2 MiB y 100 páginas. PDF estático compatible, sin contraseña, formularios, acciones ni archivos adjuntos. Se conserva el archivo original, incluidos sus metadatos. Se descarga para revisión; no hay visor integrado.</small><small id="evidence-video-help" hidden>Máximo 2 MiB y 60 segundos. MP4 progresivo H.264 con audio AAC opcional; hasta 1280 píxeles por lado y 921600 píxeles en total. Se conserva el archivo original y sus metadatos. La reproducción comienza solo al pulsar Reproducir.</small></label><label class="check-label" id="evidence-consent-field" hidden><input name="consent_confirmed" type="checkbox"> Confirmo que tengo autorización para usar este archivo y el consentimiento de terceros, si aparecen.</label><button class="primary" type="submit" ${!sessions.length ? 'disabled' : ''}>Enviar a revisión →</button></form></section>` : '';
  const cards = w.evidence.slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).map(e => {
    const review = isAdmin() && e.status === 'pending' && w.enrollments.some(n=>n.id===e.enrollment_id&&n.status==='active') ? `<form class="review-form" data-review="${esc(e.id)}"><label>Decisión<select name="decision"><option value="approved">Aprobar práctica</option><option value="rejected">Rechazar y solicitar corrección</option></select></label><label>Notas de revisión<textarea name="notes" maxlength="2000" required></textarea></label><button class="primary" type="submit">Registrar revisión</button></form>` : '';
    const enrollment=w.enrollments.find(n=>n.id===e.enrollment_id);
    const approval = w.approvals.find(a => a.evidence_id === e.id);
    return `<article class="evidence-card">${pill(e.status)}<small>${esc(enrollment?enrollLabel(enrollment):'Emisor DEMO')}</small><h3>${esc(topic(e.topic_id))}</h3><p>${esc(e.description)}</p><small>${esc(date(e.submitted_at))}</small>${approval?.review_notes ? `<p><strong>Revisión:</strong> ${esc(approval.review_notes)}</p>` : ''}${e.storage_path?`<p>${e.storage_path===`sandbox/evidence/${e.id}.pdf`?'Documento privado · PDF · Solo descarga':e.storage_path===`sandbox/evidence/${e.id}.mp4`?'Video privado · MP4':'Imagen privada · PNG'}</p><div class="actions"><button class="secondary" data-preview-evidence="${esc(e.id)}" ${e.storage_path===`sandbox/evidence/${e.id}.pdf`?'disabled':''}>Ver evidencia</button><button class="secondary" data-download-evidence="${esc(e.id)}">Descargar evidencia</button></div>`:''}${review}</article>`;
  }).join('');
  const assess = isAdmin() ? `<section class="panel"><h2>Evaluación y validación administrativa</h2><p>La validación exige evidencia aprobada y evaluación satisfactoria. Conservamos cada revisión.</p><form id="assessment-form" class="form-grid"><label class="wide">Sesión<select name="session_id" required>${sessions.map(s => opt(s.id, `${enrollLabel(w.enrollments.find(e=>e.id===s.enrollment_id))} · ${topic(s.topic_id)} · ${date(s.scheduled_at)}`)).join('')}</select></label><label>Puntuación<input name="score" type="number" min="0" max="100" step="0.01" value="90" required></label><label>Resultado<select name="passed"><option value="true">Satisfactorio</option><option value="false">Requiere mejora</option></select></label><label class="wide">Notas<textarea name="notes" maxlength="2000" required></textarea></label><div class="wide actions"><button class="secondary" type="submit" ${!sessions.length ? 'disabled' : ''}>Guardar evaluación</button><button id="complete-button" class="primary" type="button" ${!sessions.length ? 'disabled' : ''}>Validar práctica ✓</button></div></form></section>` : '';
  return `<div class="cols">${submit}<section class="panel"><h2>Evidencias y revisiones</h2>${cards ? `<div class="cards">${cards}</div>` : empty('Aún no hay evidencias', 'Las prácticas enviadas aparecerán aquí para su revisión.')}</section></div>${assess}<dialog id="evidence-preview"><div class="panel-head"><h2>Evidencia de la práctica</h2><button class="secondary" data-close-evidence>Cerrar</button></div><img id="evidence-preview-image" alt="Evidencia de la práctica"><video id="evidence-preview-video" controls playsinline preload="metadata" controlslist="nodownload noremoteplayback" disablepictureinpicture hidden></video><p id="evidence-video-error" class="error" role="alert" hidden>Este navegador no puede reproducir el clip. Puedes descargarlo y abrirlo con un reproductor compatible.</p></dialog>`;
}
function library() {
  const w = state.workspace, materials = state.catalogueMode === 'materials';
  const all = materials ? w.materials : w.topics;
  const latest = values => values.filter(value => !values.some(other => other.content_key === value.content_key && other.revision > value.revision));
  const values = state.catalogueHistory ? all : latest(all);
  const head = `<section class="panel"><div class="panel-head"><div><h2>Biblioteca de entrenamiento</h2><p>Catálogo de prueba de temas y materiales. Cada cambio crea una nueva revisión.</p></div><span class="pill">ENTORNO DEMO</span></div><div class="catalogue-tabs"><button class="${!materials ? 'primary' : 'secondary'}" data-catalogue-mode="topics">Temas</button><button class="${materials ? 'primary' : 'secondary'}" data-catalogue-mode="materials">Materiales</button><label class="check-label"><input type="checkbox" id="catalogue-history" ${state.catalogueHistory ? 'checked' : ''}> Mostrar revisiones anteriores</label></div></section>`;
  const rows = values.slice().sort((a, b) => a.title.localeCompare(b.title)).map(value => {
    const current = latest(all).some(row => row.id === value.id);
    const edit = isAdmin() ? `<button class="secondary" data-edit-${materials ? 'material' : 'topic'}="${esc(value.id)}" ${!current ? 'disabled' : ''}>Nueva revisión</button>` : '';
    const publish = isAdmin() && value.status === 'draft' && current ? `<button class="primary" data-publish-${materials ? 'material' : 'topic'}="${esc(value.id)}">Publicar</button>` : '';
    const access = materials ? `<button class="secondary" data-preview-material="${esc(value.id)}" ${!value.allow_preview ? 'disabled' : ''}>Vista previa</button><button class="secondary" data-download-material="${esc(value.id)}" ${!value.allow_download || !['document','image','video'].includes(value.kind) ? 'disabled' : ''}>Descargar</button>` : '';
    const detail = materials ? `${value.kind==='video'?'Video MP4':isPDF(value)?'Documento PDF':value.kind === 'image'?'Imagen PNG':value.kind === 'document' ? 'Documento de texto' : 'Enlace HTTPS'} · ${topic(value.topic_id)}` : `${value.category} · ${value.estimated_minutes} minutos`;
    return `<article class="catalogue-card"><div class="catalogue-card-head"><div><h3>${esc(value.title)}</h3><p class="caption">${esc(detail)} · Revisión ${value.revision}</p></div>${pill(value.status)}</div>${!materials && value.description ? `<p class="caption">${esc(value.description)}</p>` : ''}<div class="actions">${access}${edit}${publish}</div></article>`;
  }).join('');
  let form = '';
  if (isAdmin() && !materials) {
    const value = state.editTopic;
    form = `<section class="panel"><div class="panel-head"><div><h2>${value ? 'Nueva revisión del tema' : 'Crear tema'}</h2><p>${value ? `La revisión ${value.revision} se conservará sin cambios.` : 'El tema comenzará como borrador.'}</p></div>${value ? '<button class="secondary" data-cancel-topic>Cancelar</button>' : ''}</div><form id="topic-form"><label>Título<input name="title" maxlength="120" value="${esc(value?.title)}" required></label><label>Descripción<textarea name="description" maxlength="2000">${esc(value?.description)}</textarea></label><div class="form-grid"><label>Categoría<input name="category" maxlength="100" value="${esc(value?.category || 'Entrenamiento')}" required></label><label>Tiempo estimado (minutos)<input name="estimated_minutes" type="number" min="1" max="480" value="${value?.estimated_minutes || 30}" required></label></div><button class="primary" type="submit">Guardar borrador</button></form></section>`;
  } else if (isAdmin() && materials) {
    const value = state.editMaterial;
    const topics = w.topics.filter(t => ['draft', 'published'].includes(t.status));
    const options = topics.map(t => `<option value="${esc(t.id)}" ${value?.topic_id === t.id ? 'selected' : ''}>${esc(t.title)} · r${t.revision} · ${esc(statuses[t.status])}</option>`).join('');
    form = `<section class="panel"><div class="panel-head"><div><h2>${value ? 'Nueva revisión del material' : 'Crear material'}</h2><p>Publica primero el tema. Se admiten texto, enlaces HTTPS, imágenes, PDF y clips MP4 privados. Los PDF se descargan sin visor integrado.</p></div>${value ? '<button class="secondary" data-cancel-material>Cancelar</button>' : ''}</div><form id="material-form"><label>Título<input name="title" maxlength="120" value="${esc(value?.title)}" required></label><label>Tema y revisión<select name="topic_id" required>${options}</select></label><label>Tipo<select name="kind"><option value="document" ${!value||value.kind==='document'&&!isPDF(value) ? 'selected' : ''}>Documento de texto</option><option value="link" ${value?.kind === 'link' ? 'selected' : ''}>Enlace HTTPS</option><option value="image" ${value?.kind==='image'?'selected':''}>Imagen privada (PNG o JPEG)</option><option value="pdf" ${isPDF(value)?'selected':''}>Documento PDF privado</option><option value="video" ${value?.kind==='video'?'selected':''}>Video MP4 privado</option></select></label><label id="material-text-field" ${value&&(value.kind!=='document'||isPDF(value)) ? 'hidden' : ''}>Contenido<textarea name="content" maxlength="20000" ${!value||value.kind==='document'&&!isPDF(value) ? 'required' : ''}>${esc(value?.content)}</textarea></label><label id="material-link-field" ${value?.kind !== 'link' ? 'hidden' : ''}>Enlace HTTPS<input name="external_url" type="url" value="${esc(value?.external_url)}" ${value?.kind === 'link' ? 'required' : ''}></label><label id="material-image-field" ${value?.kind!=='image'?'hidden':''}>Imagen PNG o JPEG<input name="image_file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" ${value?.kind==='image'&&!value?.image?'required':''}><small>Máximo 2 MiB, 2048 píxeles por lado y 4 millones de píxeles. PNG RGB/RGBA de 8 bits, sin animación ni entrelazado. JPEG se convierte a PNG y se reduce, si hace falta, hasta 768 píxeles por lado. Se conserva la proporción y se eliminan los metadatos; la descarga será PNG.${value?.image?' Puedes conservar la imagen actual o elegir otra para esta revisión.':''}</small></label><label id="material-pdf-field" ${!isPDF(value)?'hidden':''}>Archivo PDF<input name="pdf_file" type="file" accept="application/pdf,.pdf" ${isPDF(value)&&!value?.pdf?'required':''}><small>Máximo 2 MiB y 100 páginas. PDF estático compatible, sin contraseña, formularios, acciones ni archivos adjuntos. Se conserva el archivo original, incluidos sus metadatos. Esta entrega permite descarga, sin visor integrado.${value?.pdf?' Puedes conservar el PDF actual o elegir otro para esta revisión.':''}</small></label><label id="material-video-field" ${value?.kind!=='video'?'hidden':''}>Clip MP4<input name="video_file" type="file" accept="video/mp4,.mp4" ${value?.kind==='video'&&!value?.video?'required':''}><small>Máximo 2 MiB y 60 segundos. MP4 progresivo H.264 con audio AAC opcional; hasta 1280 píxeles por lado y 921600 píxeles en total. Se conserva el archivo y sus metadatos originales. La reproducción comienza solo al pulsar Reproducir.${value?.video?' Puedes conservar el clip actual o elegir otro para esta revisión.':''}</small></label><label class="check-label"><input name="allow_preview" type="checkbox" ${value?.allow_preview !== false&&!isPDF(value) ? 'checked' : ''} ${isPDF(value)?'disabled':''}> Permitir vista previa</label><label class="check-label" id="material-download-field" ${value?.kind === 'link' ? 'hidden' : ''}><input name="allow_download" type="checkbox" ${value?.kind !== 'link' && value?.allow_download !== false ? 'checked' : ''}> Permitir descarga</label><button class="primary" type="submit" ${!topics.length ? 'disabled' : ''}>Guardar borrador</button></form></section>`;
  }
  return head + `<div class="${isAdmin() ? 'cols' : ''}"><section class="panel"><h2>${materials ? 'Materiales' : 'Temas'}</h2>${rows || empty(materials ? 'Aún no hay materiales' : 'Biblioteca vacía', isAdmin() ? 'Crea un borrador y publícalo cuando esté listo.' : 'El contenido aparecerá cuando un administrador lo publique.')}</section>${form}</div><dialog id="material-preview"><div class="panel-head"><h2 id="preview-title"></h2><button class="secondary" data-close-preview>Cerrar</button></div><pre id="preview-text" hidden></pre><img id="preview-image" alt="Material de entrenamiento" hidden><video id="preview-video" controls playsinline preload="metadata" controlslist="nodownload noremoteplayback" disablepictureinpicture hidden></video><p id="preview-video-error" class="error" role="alert" hidden>Este navegador no puede reproducir el clip. Si la revisión permite descargar, puedes usar un reproductor compatible.</p><div id="preview-link" hidden><p>Este recurso se abre en una página externa.</p><a class="primary" id="preview-link-anchor" target="_blank" rel="noopener noreferrer">Abrir enlace ↗</a></div></dialog>`;
}
function history() {
  const w = state.workspace;
  const rows = w.approvals.filter(a => a.reviewed_at).map(a => `<tr><td>${a.topic_id ? 'Publicación de tema' : a.material_id ? 'Publicación de material' : a.program_version_id ? 'Publicación de programa' : 'Revisión de evidencia'}<small>${esc(a.review_notes)}</small></td><td>${pill(a.status)}</td><td>${esc(date(a.reviewed_at))}</td></tr>`).join('') + w.assessments.map(a => `<tr><td>Evaluación práctica<small>${esc(a.notes)}</small></td><td>${a.score}/100 · ${a.passed ? 'Satisfactoria' : 'Requiere mejora'}</td><td>${esc(date(a.assessed_at))}</td></tr>`).join('') + w.attendance.map(a=>`<tr><td>Asistencia de sesión</td><td>${esc({present:'Presente',absent:'Ausente',late:'Tarde',excused:'Justificada'}[a.status])}</td><td>${esc(date(a.recorded_at))}</td></tr>`).join('') + w.events.filter(e=>e.event_type==='session_rescheduled').map(e=>`<tr><td>Reprogramación de sesión<small>${esc(e.details.reason)}</small></td><td>${esc(date(e.details.previous_scheduled_at))} → ${esc(date(e.details.scheduled_at))}</td><td>${esc(date(e.created_at))}</td></tr>`).join('');
  return `<section class="panel"><h2>Historial de entrenamiento</h2><p>Cada revisión conserva su resultado y sus notas.</p>${rows ? `<div class="table-scroll"><table><thead><tr><th>Acción</th><th>Resultado</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('Tu historial comienza aquí', 'Aparecerá cuando se revisen evidencias o se registren evaluaciones.')}</section><div class="future"><h3>Quiz final · 50 preguntas</h3><p>El quiz y las prácticas se verifican en Cierre. Solo un administrador puede confirmar la finalización del entrenamiento.</p></div>`;
}
async function action(path, body, message, afterSuccess) {
  if (state.busy) return;
  state.busy = true;
  $('#notice').hidden=true;$('#content').setAttribute('aria-busy','true');
  $('#content').querySelectorAll('button,input,select,textarea').forEach(control => { control.disabled = true; });
  try {
    const result = await api(path, body); afterSuccess?.(result); await refresh(); notify((typeof message === 'function' ? message(result) : message) + (persistent?' Datos guardados en esta prueba local.':' Datos guardados únicamente en este entorno temporal.'));
  } catch (error) { if (state.token) { render(); notify(error.message, true); } else $('#login-error').textContent = error.message; }
  finally { state.busy = false;$('#content').setAttribute('aria-busy','false'); }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true; $('#login-error').textContent = '';
  try {
    const result = await api('/api/login', Object.fromEntries(new FormData(form))); state.token = result.token; state.tab = 'overview';
    await refresh(); $('#login-view').hidden = true; $('#app-view').hidden = false; $('#notice').hidden = true; form.reset();
  } catch (error) { exitSession(); $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#nav').addEventListener('click', event => { const button = event.target.closest('[data-tab]'); if (!button || state.busy) return; state.tab = button.dataset.tab; $('#notice').hidden = true; render(); });
$('#refresh-button').addEventListener('click', async () => { try { await refresh(); notify('Información actualizada.'); } catch (error) { if (state.token) notify(error.message, true); else $('#login-error').textContent = error.message; } });
$('#logout-button').addEventListener('click', async () => {
  try { await api('/api/logout', {}); exitSession(); } catch (error) { if (state.token) notify(error.message, true); else $('#login-error').textContent = error.message; }
});
$('#content').addEventListener('close',event=>{if(event.target.id==='evidence-preview')clearEvidenceImage();if(event.target.id==='material-preview'){clearMaterialVideo();$('#preview-image')?.removeAttribute('src');}},true);
$('#content').addEventListener('input',event=>examsUI.handleInput(event));
$('#content').addEventListener('change', event => {
  if(event.target.matches('#evidence-form [name="evidence_kind"]')){
    const pdf=event.target.value==='pdf',video=event.target.value==='video',file=$('#evidence-form [name="evidence_file"]');file.value='';file.accept=pdf?'application/pdf,.pdf':video?'video/mp4,.mp4':'image/png,image/jpeg,.png,.jpg,.jpeg';
    $('#evidence-file-label').textContent=pdf?'PDF de evidencia (opcional)':video?'Video de evidencia (opcional)':'Imagen de evidencia (opcional)';$('#evidence-image-help').hidden=pdf||video;$('#evidence-pdf-help').hidden=!pdf;$('#evidence-video-help').hidden=!video;
    const consent=$('#evidence-form [name="consent_confirmed"]');consent.checked=false;consent.required=false;$('#evidence-consent-field').hidden=true;
  }
  if(event.target.matches('#evidence-form [name="evidence_file"]')){const attached=!!event.target.files[0];$('#evidence-consent-field').hidden=!attached;const consent=$('#evidence-form [name="consent_confirmed"]');consent.checked=false;consent.required=attached;}
  closingUI.handleChange(event);
  examsUI.handleChange(event);
  updatesUI.handleChange(event);
  programUI.handleChange(event);
  if (event.target.matches('#schedule-form [name="enrollment_id"]')) {
    const options=itemOptions(event.target.value); $('#schedule-form [name="item_id"]').innerHTML = options || opt('', 'Todas las prácticas ya tienen sesión');
    $('#schedule-form button').disabled = !options || state.busy;
  }
  if (event.target.id === 'catalogue-history') { state.catalogueHistory = event.target.checked; render(); }
  if (event.target.matches('#material-form [name="kind"]')) {
    const link = event.target.value === 'link',image=event.target.value==='image',pdf=event.target.value==='pdf',video=event.target.value==='video';
    $('#material-text-field').hidden = link||image||pdf||video; $('#material-link-field').hidden = !link; $('#material-download-field').hidden = link;$('#material-image-field').hidden=!image;
    $('#material-form [name="image_file"]').required=image&&!state.editMaterial?.image;
    $('#material-video-field').hidden=!video;$('#material-form [name="video_file"]').required=video&&!state.editMaterial?.video;
    $('#material-pdf-field').hidden=!pdf;$('#material-form [name="pdf_file"]').required=pdf&&!state.editMaterial?.pdf;
    $('#material-form [name="allow_preview"]').disabled=pdf;if(pdf)$('#material-form [name="allow_preview"]').checked=false;
    $('#material-form [name="content"]').required = !link&&!image&&!pdf&&!video; $('#material-form [name="external_url"]').required = link;
    $('#material-form [name="allow_download"]').checked = !link;
  }
});
$('#content').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target, data = Object.fromEntries(new FormData(form));
  if (await closingUI.handleSubmit(form,data)) return;
  if (await examsUI.handleSubmit(form,data)) return;
  if (await updatesUI.handleSubmit(form,data)) return;
  if (await programUI.handleSubmit(form,data)) return;
  if (form.id === 'enroll-form') action('/api/enrollments', data, 'Emisor inscrito.');
  if (form.id === 'schedule-form') {
    const parsed = new Date(data.local_date);
    if (!Number.isFinite(parsed.getTime())) return notify('Selecciona una fecha y hora válidas.', true);
    action('/api/sessions', { enrollment_id: data.enrollment_id, item_id: data.item_id, scheduled_at: parsed.toISOString(), duration_minutes: Number(data.duration_minutes) }, 'Sesión programada.');
  }
  if (form.id === 'evidence-form') {
    if(state.busy)return;
    const body={session_id:data.session_id,description:data.description},file=form.elements.evidence_file.files[0];
    if(!file)return action('/api/evidence',body,'Práctica enviada para revisión.');
    if(!form.elements.consent_confirmed.checked)return notify(errors['Evidence file consent required'],true);
    state.busy=true;const token=state.token,button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const pdf=form.elements.evidence_kind.value==='pdf',video=form.elements.evidence_kind.value==='video';let prepared;
      if(pdf||video){if(!file.size||file.size>2*1024*1024)throw Error(errors[video?'Video exceeds 2 MiB limit':'PDF exceeds 2 MiB limit']);const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));prepared={base64:btoa(binary)};}
      else prepared=await preparePrivateImage(file);
      if(state.token!==token||!form.isConnected)return;
      state.busy=false;
      await action('/api/evidence',{...body,...(pdf?{pdf_base64:prepared.base64}:video?{video_base64:prepared.base64}:{image_base64:prepared.base64}),consent_confirmed:true},(pdf?'Práctica y PDF enviados para revisión.':video?'Práctica y video enviados para revisión.':'Práctica e imagen enviadas para revisión.')+(prepared.converted?` JPEG convertido a PNG de ${prepared.width} × ${prepared.height} píxeles${prepared.resized?' con reducción proporcional':''}.`:''));
    }catch(error){if(state.token===token)notify(error.message,true);}
    finally{state.busy=false;if(button.isConnected)button.disabled=false;}
    return;
  }
  if (form.dataset.review) action('/api/evidence/review', { ...data, evidence_id: form.dataset.review }, 'Revisión registrada.');
  if (form.id === 'assessment-form') action('/api/assessments', { ...data, score: Number(data.score), passed: data.passed === 'true' }, 'Evaluación registrada.');
  if (form.id === 'topic-form') action('/api/topics', { ...data, estimated_minutes: Number(data.estimated_minutes), ...(state.editTopic ? { source_id: state.editTopic.id } : {}) }, 'Borrador de tema creado.', () => { state.editTopic = null; });
  if (form.id === 'material-form') {
    const link = data.kind === 'link';
    const body = { title: data.title, topic_id: data.topic_id, kind: data.kind, allow_preview: form.elements.allow_preview.checked,
      allow_download: !link && form.elements.allow_download.checked, ...(link ? { external_url: data.external_url } : { content: data.content }),
      ...(state.editMaterial ? { source_id: state.editMaterial.id } : {}) };
    if(data.kind==='video'){
      if(state.busy)return;state.busy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
      try{
        const file=form.elements.video_file.files[0];let video_base64=state.editMaterial?.video?.data;
        if(file){if(file.size>2*1024*1024)throw Error(errors['Video exceeds 2 MiB limit']);const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));video_base64=btoa(binary);}
        if(!video_base64)throw Error('Selecciona un clip MP4.');
        const {kind,content,...videoBody}=body;state.busy=false;
        action('/api/materials/video',{...videoBody,video_base64},'Borrador de video creado.',()=>{state.editMaterial=null;});
      }catch(e){state.busy=false;button.disabled=false;notify(e.message,true);}
    }else if(data.kind==='pdf'){

      if(state.busy)return;state.busy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
      try{
        const file=form.elements.pdf_file.files[0];let pdf_base64=state.editMaterial?.pdf?.data;
        if(file){if(file.size>2*1024*1024)throw Error(errors['PDF exceeds 2 MiB limit']);const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));pdf_base64=btoa(binary);}
        if(!pdf_base64)throw Error('Selecciona un archivo PDF.');
        const {kind,content,allow_preview,...pdfBody}=body;state.busy=false;
        action('/api/materials/pdf',{...pdfBody,pdf_base64},'Borrador PDF creado.',()=>{state.editMaterial=null;});
      }catch(e){state.busy=false;button.disabled=false;notify(e.message,true);}
    }else if(data.kind==='image'){

      if(state.busy)return;state.busy=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
      try{
        const file=form.elements.image_file.files[0];let image_base64=state.editMaterial?.image?.data;let prepared=null;
        if(file){prepared=await preparePrivateImage(file);image_base64=prepared.base64;}
        if(!image_base64)throw Error('Selecciona una imagen PNG o JPEG.');
        const {kind,content,...imageBody}=body;state.busy=false;
        action('/api/materials/image',{...imageBody,image_base64},'Borrador de imagen creado.'+(prepared?.converted?` JPEG convertido a PNG de ${prepared.width} × ${prepared.height} píxeles${prepared.resized?' con reducción proporcional':''}.`:''),()=>{state.editMaterial=null;});
      }catch(e){state.busy=false;button.disabled=false;notify(e.message,true);}
    }else action('/api/materials', body, 'Borrador de material creado.', () => { state.editMaterial = null; });
  }
});
$('#content').addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || state.busy) return;
  if (['agenda','evidence','exams'].includes(button.dataset.openTab)) {
    state.tab=button.dataset.openTab; $('#notice').hidden=true; render();
    $('#workspace-title').setAttribute('tabindex','-1'); $('#workspace-title').focus(); return;
  }
  if(button.hasAttribute('data-close-evidence')){clearEvidenceImage();$('#evidence-preview').close();return;}
  if(button.dataset.previewEvidence||button.dataset.downloadEvidence){
    state.busy=true;const token=state.token;
    try{
      const download=!!button.dataset.downloadEvidence,evidence_id=button.dataset.downloadEvidence||button.dataset.previewEvidence;
      const result=await api(download?'/api/evidence/file-download':'/api/evidence/file-preview',{evidence_id});
      if(state.token!==token||!button.isConnected)return;
      if(download){
        const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(result.video_base64||result.pdf_base64||result.image_base64),c=>c.charCodeAt(0))],{type:result.mime}));
        const anchor=document.createElement('a');anchor.href=url;anchor.download=result.filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify(result.video_base64?'Descarga de la evidencia MP4 iniciada.':result.pdf_base64?'Descarga de la evidencia PDF iniciada.':'Descarga de la evidencia PNG iniciada.');
      }else{
        clearEvidenceImage();const video=result.type==='video';$('#evidence-preview-image').hidden=video;$('#evidence-preview-video').hidden=!video;$('#evidence-video-error').hidden=true;
        if(video){evidenceVideoURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(result.video.data),c=>c.charCodeAt(0))],{type:'video/mp4'}));$('#evidence-preview-video').onerror=()=>{const node=$('#evidence-video-error');if(node)node.hidden=false;};$('#evidence-preview-video').src=evidenceVideoURL;}
        else $('#evidence-preview-image').src='data:image/png;base64,'+result.image.data;
        $('#evidence-preview').showModal();
      }
    }catch(error){if(state.token===token)notify(error.message,true);}
    finally{state.busy=false;}
    return;
  }
  if (await closingUI.handleClick(button)) return;
  if (await examsUI.handleClick(button)) return;
  if (await updatesUI.handleClick(button)) return;
  if (await programUI.handleClick(button)) return;
  if (event.target.id === 'complete-button') action('/api/items/complete', { session_id: $('#assessment-form [name="session_id"]').value }, 'Práctica validada.');
  if (button.dataset.catalogueMode) { state.catalogueMode = button.dataset.catalogueMode; render(); }
  if (button.hasAttribute('data-cancel-topic')) { state.editTopic = null; render(); }
  if (button.hasAttribute('data-cancel-material')) { state.editMaterial = null; render(); }
  if (button.dataset.editTopic) { state.editTopic = state.workspace.topics.find(t => t.id === button.dataset.editTopic); render(); $('#topic-form input').focus(); }
  if (button.dataset.publishTopic) action('/api/topics/publish', { id: button.dataset.publishTopic }, 'Tema publicado.');
  if (button.dataset.publishMaterial) action('/api/materials/publish', { id: button.dataset.publishMaterial }, 'Material publicado.');
  if (button.hasAttribute('data-close-preview')) {clearMaterialVideo();$('#preview-image').removeAttribute('src');$('#material-preview').close();}
  if (button.dataset.editMaterial || button.dataset.previewMaterial || button.dataset.downloadMaterial) {
    state.busy = true;
    try {
      if (button.dataset.editMaterial) {
        state.editMaterial = await api('/api/materials/edit-data', { id: button.dataset.editMaterial }); render(); $('#material-form input').focus();
      } else if (button.dataset.previewMaterial) {
        const result = await api('/api/materials/preview', { id: button.dataset.previewMaterial });
        clearMaterialVideo();$('#preview-video').hidden=result.type!=='video';$('#preview-video-error').hidden=true;
        if(result.type==='video'){materialVideoURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(result.video.data),c=>c.charCodeAt(0))],{type:'video/mp4'}));$('#preview-video').onerror=()=>{$('#preview-video-error').hidden=false;};$('#preview-video').src=materialVideoURL;}
        $('#preview-title').textContent = `${result.title} · Revisión ${result.revision}`;
        $('#preview-text').hidden = result.type !== 'text'; $('#preview-link').hidden = result.type !== 'link';
        $('#preview-image').hidden=result.type!=='image';$('#preview-image').removeAttribute('src');if(result.type==='image')$('#preview-image').src='data:image/png;base64,'+result.image.data;
        $('#preview-text').textContent = result.content || ''; $('#preview-link-anchor').removeAttribute('href');
        if (result.type === 'link') $('#preview-link-anchor').href = result.url;
        $('#material-preview').showModal();
      } else {
        const result = await api('/api/materials/download', { id: button.dataset.downloadMaterial });
        const url = URL.createObjectURL(new Blob([result.image_base64||result.pdf_base64||result.video_base64?Uint8Array.from(atob(result.image_base64||result.pdf_base64||result.video_base64),c=>c.charCodeAt(0)):result.content], { type: result.mime }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); notify(result.video_base64?'Descarga del video MP4 iniciada.':result.pdf_base64?'Descarga del PDF iniciada.':result.image_base64?'Descarga de la imagen PNG iniciada.':'Descarga del documento de texto iniciada.');
      }
    } catch (error) { if (state.token) notify(error.message, true); else $('#login-error').textContent = error.message; }
    finally { state.busy = false; }
  }
});
