const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { token: null, actor: null, workspace: null, tab: 'overview', busy: false };
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Costa_Rica';
const labels = { superadmin: 'Superadmin', subadmin: 'Subadmin', edit: 'Reclutador', readonly: 'Solo lectura' };
const statuses = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', active: 'En curso', paused: 'En pausa', completed: 'Completada', cancelled: 'Cancelada', scheduled: 'Programada', missed: 'No realizada', rescheduled: 'Reprogramada' };
const errors = {
  'Invalid credentials': 'La cuenta o la contraseña temporal no coinciden.',
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
};
const isAdmin = () => ['superadmin', 'subadmin'].includes(state.actor?.role);
const canWrite = () => isAdmin() || state.actor?.role === 'edit';
const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
const empty = (title, detail) => `<div class="empty"><strong>${esc(title)}</strong>${esc(detail)}</div>`;
const pill = status => `<span class="pill ${status === 'approved' || status === 'completed' ? 'good' : status === 'rejected' ? 'rejected' : 'pending'}">${esc(statuses[status] || status)}</span>`;
const topic = id => state.workspace.topics.find(t => t.id === id)?.title || 'Tema DEMO';
const trainee = id => state.workspace.trainees.find(t => t.host_id === id)?.label || 'Emisor DEMO';
const enrollLabel = enrollment => `${trainee(enrollment.host_id)} · Programa ${state.workspace.program_versions.find(p => p.id === enrollment.program_version_id)?.version || 1}`;
const date = value => value ? new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone: zone }).format(new Date(value)) : '—';
function notify(message, error = false) {
  const node = $('#notice'); node.textContent = message; node.className = error ? 'error' : ''; node.hidden = false;
}
function exitSession() {
  state.token = null; state.actor = null; state.workspace = null;
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
  const w = state.workspace;
  $('#role-label').textContent = labels[state.actor.role];
  $('#workspace-title').textContent = isAdmin() ? 'Training Administration' : 'Recruiter Training Workspace';
  $('#workspace-subtitle').textContent = isAdmin() ? 'Acompaña el progreso y valida cada práctica.' : 'Tu agenda, tus emisores y su próximo paso.';
  $('#stats').innerHTML = [
    ['Emisores asignados', w.trainees.length, 'Perfiles ficticios'],
    ['Sesiones programadas', w.sessions.filter(s => s.status === 'scheduled').length, 'Agenda de entrenamiento'],
    ['Evidencias pendientes', w.evidence.filter(e => e.status === 'pending').length, 'Esperan revisión administrativa'],
    ['Prácticas validadas', w.completions.length, 'Quiz final todavía pendiente'],
  ].map(([name, count, note]) => `<article class="stat"><label>${name}</label><strong>${count}</strong><small>${note}</small></article>`).join('');
  document.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === state.tab));
  const views = { overview, agenda, evidence, library, history };
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
  const rows = w.enrollments.map(e => `<div class="list-row"><div><p>${esc(trainee(e.host_id))}</p><small>${esc(e.timezone)} · ${w.completions.filter(c => c.enrollment_id === e.id).length} prácticas validadas</small></div>${pill(e.status)}</div>`).join('');
  return `<div class="panel"><div class="panel-head"><div><h2>Un programa, a tu ritmo</h2><p>${esc(program?.title || 'Programa DEMO')} · Duración inicial flexible, sin perder de vista el progreso.</p></div><span class="pill">DEMO · ${program?.duration_days || 14} días</span></div>${grid}</div><div class="cols"><section class="panel"><h2>Emisores en entrenamiento</h2>${rows || empty('Todo empieza con una inscripción', 'Inscribe un emisor DEMO para comenzar su agenda.')}</section><section class="panel"><h2>${canWrite() ? 'Nueva inscripción' : 'Tu seguimiento'}</h2>${enrollmentForm}</section></div>`;
}
function agenda() {
  const w = state.workspace, active = w.enrollments.filter(e => e.status === 'active');
  const schedule = canWrite() ? `<section class="panel"><div class="panel-head"><div><h2>Programa una sesión</h2><p>Tu zona horaria: ${esc(zone)}. Elige una práctica de la versión asignada.</p></div></div><form id="schedule-form" class="form-grid"><label>Emisor en entrenamiento<select name="enrollment_id" required>${active.map(e => opt(e.id, enrollLabel(e))).join('')}</select></label><label>Práctica<select name="item_id" required>${itemOptions(active[0]?.id)}</select></label><label>Fecha y hora<input type="datetime-local" name="local_date" required></label><label>Duración en minutos<input type="number" name="duration_minutes" min="1" max="480" value="30" required></label><div class="wide"><button class="primary" type="submit" ${!active.length ? 'disabled' : ''}>Agregar a la agenda →</button></div></form></section>` : '';
  const rows = w.sessions.slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).map(s => {
    const e = w.enrollments.find(e => e.id === s.enrollment_id);
    return `<tr><td>${esc(trainee(e?.host_id))}<small>${esc(topic(s.topic_id))}</small></td><td>${esc(date(s.scheduled_at))}<small>${s.duration_minutes} minutos</small></td><td>${pill(s.status)}</td></tr>`;
  }).join('');
  return schedule + `<section class="panel"><div class="panel-head"><div><h2>Agenda de entrenamiento</h2><p>Las horas se muestran en tu zona: ${esc(zone)}.</p></div></div>${rows ? `<div class="table-scroll"><table><thead><tr><th>Emisor y práctica</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('Tu agenda está lista para empezar', 'Crea una inscripción y programa su primera práctica.')}</section>`;
}
function itemOptions(enrollmentId) {
  const version = state.workspace.enrollments.find(e => e.id === enrollmentId)?.program_version_id;
  return state.workspace.program_items.filter(item => item.program_version_id === version).sort((a, b) => a.day - b.day).map(item => opt(item.id, `Día ${item.day} · ${topic(item.topic_id)}`)).join('');
}
function evidence() {
  const w = state.workspace;
  const sessions = w.sessions.filter(s => w.enrollments.some(e => e.id === s.enrollment_id && e.status === 'active'));
  const submit = canWrite() ? `<section class="panel"><h2>Envía una práctica</h2><p>Describe lo que realizó el emisor. En esta prueba se admite texto; la carga de archivos se habilitará más adelante.</p><form id="evidence-form"><label>Sesión<select name="session_id" required>${sessions.map(s => opt(s.id, `${topic(s.topic_id)} · ${date(s.scheduled_at)}`)).join('')}</select></label><label>Descripción de la práctica<textarea name="description" maxlength="2000" required placeholder="Qué se hizo, qué se aprendió y qué queda por mejorar…"></textarea></label><button class="primary" type="submit" ${!sessions.length ? 'disabled' : ''}>Enviar a revisión →</button></form></section>` : '';
  const cards = w.evidence.slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).map(e => {
    const review = isAdmin() && e.status === 'pending' ? `<form class="review-form" data-review="${esc(e.id)}"><label>Decisión<select name="decision"><option value="approved">Aprobar práctica</option><option value="rejected">Rechazar y solicitar corrección</option></select></label><label>Notas de revisión<textarea name="notes" maxlength="2000" required></textarea></label><button class="primary" type="submit">Registrar revisión</button></form>` : '';
    const approval = w.approvals.find(a => a.evidence_id === e.id);
    return `<article class="evidence-card">${pill(e.status)}<h3>${esc(topic(e.topic_id))}</h3><p>${esc(e.description)}</p><small>${esc(date(e.submitted_at))}</small>${approval?.review_notes ? `<p><strong>Revisión:</strong> ${esc(approval.review_notes)}</p>` : ''}${review}</article>`;
  }).join('');
  const assess = isAdmin() ? `<section class="panel"><h2>Evaluación y validación administrativa</h2><p>La validación exige evidencia aprobada y evaluación satisfactoria. Conservamos cada revisión.</p><form id="assessment-form" class="form-grid"><label class="wide">Sesión<select name="session_id" required>${sessions.map(s => opt(s.id, `${topic(s.topic_id)} · ${date(s.scheduled_at)}`)).join('')}</select></label><label>Puntuación<input name="score" type="number" min="0" max="100" step="0.01" value="90" required></label><label>Resultado<select name="passed"><option value="true">Satisfactorio</option><option value="false">Requiere mejora</option></select></label><label class="wide">Notas<textarea name="notes" maxlength="2000" required></textarea></label><div class="wide actions"><button class="secondary" type="submit" ${!sessions.length ? 'disabled' : ''}>Guardar evaluación</button><button id="complete-button" class="primary" type="button" ${!sessions.length ? 'disabled' : ''}>Validar práctica ✓</button></div></form></section>` : '';
  return `<div class="cols">${submit}<section class="panel"><h2>Evidencias y revisiones</h2>${cards ? `<div class="cards">${cards}</div>` : empty('Aún no hay evidencias', 'Las prácticas enviadas aparecerán aquí para su revisión.')}</section></div>${assess}`;
}
function library() {
  const rows = state.workspace.topics.map(t => `<div class="list-row"><div><p>${esc(t.title)}</p><small>${esc(t.category)} · ${t.estimated_minutes} minutos</small></div><span class="pill">DEMO</span></div>`).join('');
  return `<section class="panel"><h2>Biblioteca de entrenamiento</h2><p>Temas del programa de prueba. No son materiales definitivos.</p>${rows || empty('Biblioteca vacía', 'Todavía no hay temas disponibles.')}</section><div class="future"><h3>Materiales descargables y entrenamiento libre</h3><p>Próxima etapa: documentos, videos, vista previa, contenidos versionados y programas libres.</p></div>`;
}
function history() {
  const w = state.workspace;
  const rows = w.approvals.filter(a => a.reviewed_at).map(a => `<tr><td>Revisión de evidencia<small>${esc(a.review_notes)}</small></td><td>${pill(a.status)}</td><td>${esc(date(a.reviewed_at))}</td></tr>`).join('') + w.assessments.map(a => `<tr><td>Evaluación práctica<small>${esc(a.notes)}</small></td><td>${a.score}/100 · ${a.passed ? 'Satisfactoria' : 'Requiere mejora'}</td><td>${esc(date(a.assessed_at))}</td></tr>`).join('');
  return `<section class="panel"><h2>Historial de entrenamiento</h2><p>Cada revisión conserva su resultado y sus notas.</p>${rows ? `<div class="table-scroll"><table><thead><tr><th>Acción</th><th>Resultado</th><th>Fecha</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('Tu historial comienza aquí', 'Aparecerá cuando se revisen evidencias o se registren evaluaciones.')}</section><div class="future"><h3>Quiz final · 50 preguntas</h3><p>Función futura. Validar una práctica todavía no completa el programa ni genera una certificación.</p></div>`;
}
async function action(path, body, message) {
  if (state.busy) return;
  state.busy = true;
  $('#content').querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    await api(path, body); await refresh(); notify(message + ' Datos guardados únicamente en este entorno temporal.');
  } catch (error) { if (state.token) { render(); notify(error.message, true); } else $('#login-error').textContent = error.message; }
  finally { state.busy = false; }
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
$('#content').addEventListener('change', event => {
  if (event.target.matches('#schedule-form [name="enrollment_id"]')) $('#schedule-form [name="item_id"]').innerHTML = itemOptions(event.target.value);
});
$('#content').addEventListener('submit', event => {
  event.preventDefault(); const form = event.target, data = Object.fromEntries(new FormData(form));
  if (form.id === 'enroll-form') action('/api/enrollments', data, 'Emisor inscrito.');
  if (form.id === 'schedule-form') {
    const parsed = new Date(data.local_date);
    if (!Number.isFinite(parsed.getTime())) return notify('Selecciona una fecha y hora válidas.', true);
    action('/api/sessions', { enrollment_id: data.enrollment_id, item_id: data.item_id, scheduled_at: parsed.toISOString(), duration_minutes: Number(data.duration_minutes) }, 'Sesión programada.');
  }
  if (form.id === 'evidence-form') action('/api/evidence', data, 'Práctica enviada para revisión.');
  if (form.dataset.review) action('/api/evidence/review', { ...data, evidence_id: form.dataset.review }, 'Revisión registrada.');
  if (form.id === 'assessment-form') action('/api/assessments', { ...data, score: Number(data.score), passed: data.passed === 'true' }, 'Evaluación registrada.');
});
$('#content').addEventListener('click', event => {
  if (event.target.id === 'complete-button') action('/api/items/complete', { session_id: $('#assessment-form [name="session_id"]').value }, 'Práctica validada.');
});
