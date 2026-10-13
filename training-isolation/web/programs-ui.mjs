export function createProgramUI({ state, zone, esc, opt, empty, pill, isAdmin, canWrite, api, action, render, notify, topic, date, enrollLabel }) {
  let draft = null, preview = null, previewBody = null, controls = null;
  const publishedTopics = () => state.workspace.topics.filter(t => t.status === 'published');
  const latest = p => !state.workspace.program_versions.some(other => other.program_key === p.program_key && other.version > p.version);
  function parts(value, timezone) {
    const result = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
    return { local_date: `${result.year}-${result.month}-${result.day}`, local_time: `${result.hour}:${result.minute}` };
  }
  function initDraft() {
    draft ??= { title: '', duration_days: 14, changelog: 'Versión inicial', items: [{ day: 1, topic_id: publishedTopics()[0]?.id || '', notes: '', material_ids: [] }] };
  }
  function captureProgram() {
    const form = document.querySelector('#program-form'); if (!form) return;
    draft.title = form.elements.title.value; draft.duration_days = Number(form.elements.duration_days.value); draft.changelog = form.elements.changelog.value;
    draft.items = [...form.querySelectorAll('.program-item')].map(row => ({ day: Number(row.querySelector('[name="item_day"]').value),
      topic_id: row.querySelector('[name="item_topic"]').value, notes: row.querySelector('[name="item_notes"]').value,
      material_ids: [...row.querySelector('[name="item_materials"]').selectedOptions].map(option => option.value).filter(Boolean) }));
  }
  function materialOptions(item) {
    return state.workspace.materials.filter(m => m.topic_id === item.topic_id && m.status === 'published').map(m => `<option value="${esc(m.id)}" ${item.material_ids.includes(m.id) ? 'selected' : ''}>${esc(m.title)} · r${m.revision}</option>`).join('');
  }
  function renderPrograms() {
    const w = state.workspace;
    const cards = w.program_versions.slice().sort((a,b) => a.title.localeCompare(b.title) || b.version-a.version).map(p => {
      const items = w.program_items.filter(i => i.program_version_id === p.id).sort((a,b) => a.day-b.day || a.position-b.position);
      return `<article class="catalogue-card"><div class="catalogue-card-head"><div><h3>${esc(p.title)}</h3><p class="caption">Versión ${p.version} · ${p.duration_days} días de entrenamiento · ${items.length} prácticas</p></div>${pill(p.status)}</div><p class="caption">${esc(p.changelog || 'Programa DEMO inicial')}</p><details><summary>Ver estructura del programa</summary>${items.map(i => `<div class="list-row"><div><p>Día ${i.day} · ${esc(topic(i.topic_id))}</p><small>${esc(i.notes || 'Evidencia práctica y evaluación obligatorias')}</small></div><span class="pill">${w.program_materials.filter(m => m.item_id===i.id).length} materiales</span></div>`).join('')}</details>${isAdmin() ? `<div class="actions"><button class="secondary" data-edit-program="${esc(p.id)}" ${!latest(p) ? 'disabled' : ''}>Nueva versión</button>${p.status === 'draft' && latest(p) ? `<button class="primary" data-publish-program="${esc(p.id)}">Publicar programa</button>` : ''}</div>` : ''}</article>`;
    }).join('');
    let form = '';
    if (isAdmin()) {
      initDraft();
      const topics = publishedTopics();
      form = `<section class="panel"><div class="panel-head"><div><h2>${draft.source_id ? 'Nueva versión del programa' : 'Crear programa'}</h2><p>Las versiones previas y las inscripciones actuales se conservan.</p></div>${draft.source_id ? '<button class="secondary" data-new-program>Cancelar</button>' : ''}</div><form id="program-form"><label>Título<input name="title" maxlength="120" value="${esc(draft.title)}" required></label><div class="form-grid"><label>Días de entrenamiento<input name="duration_days" type="number" min="1" max="90" value="${draft.duration_days}" required></label><label>Descripción del cambio<input name="changelog" maxlength="2000" value="${esc(draft.changelog)}" required></label></div><div id="program-items">${draft.items.map((item,index) => `<div class="program-item" data-index="${index}"><div class="program-item-head"><strong>Práctica ${index+1}</strong><div class="actions"><button type="button" class="secondary" data-program-up="${index}" ${index===0 || draft.items[index-1].day!==item.day ? 'disabled' : ''}>↑</button><button type="button" class="secondary" data-program-down="${index}" ${index===draft.items.length-1 || draft.items[index+1].day!==item.day ? 'disabled' : ''}>↓</button><button type="button" class="danger" data-remove-program-item="${index}" ${draft.items.length===1 ? 'disabled' : ''}>Quitar</button></div></div><div class="form-grid"><label>Día<input name="item_day" type="number" min="1" max="${draft.duration_days}" value="${item.day}" required></label><label>Tema y revisión<select name="item_topic" required>${topics.map(t=>`<option value="${esc(t.id)}" ${item.topic_id===t.id?'selected':''}>${esc(t.title)} · r${t.revision}</option>`).join('')}</select></label></div><label>Materiales publicados (selección múltiple opcional)<select name="item_materials" multiple>${materialOptions(item)}</select></label><label>Notas de esta práctica<textarea name="item_notes" maxlength="2000">${esc(item.notes)}</textarea></label><p class="caption">Evidencia y evaluación práctica obligatorias.</p></div>`).join('')}</div><div class="actions"><button class="secondary" type="button" data-add-program-item ${!topics.length ? 'disabled' : ''}>+ Agregar práctica</button><button class="primary" type="submit" ${!topics.length ? 'disabled' : ''}>Guardar programa como borrador</button></div></form></section>`;
    }
    return `<section class="panel"><h2>${isAdmin() ? 'Constructor de programas' : 'Programas disponibles'}</h2><p>Organiza temas y materiales por día. Cada inscripción conserva la versión que recibió.</p></section><div class="${isAdmin() ? 'cols' : ''}"><section class="panel"><h2>Versiones de programa</h2>${cards || empty('No hay programas disponibles', 'Un administrador debe preparar y publicar el programa.')}</section>${form}</div>`;
  }
  function renderAgendaExtras() {
    if (!canWrite()) return { automatic: '', controls: '' };
    const w=state.workspace, active=w.enrollments.filter(e=>e.status==='active');
    controls ??= { enrollment_id: active[0]?.id || '', start_date: parts(new Date(),zone).local_date, local_time:'19:00', weekends:false };
    if (!active.some(e=>e.id===controls.enrollment_id)) controls.enrollment_id=active[0]?.id || '';
    const e=active.find(e=>e.id===controls.enrollment_id);
    const proposal = preview ? `<div class="agenda-proposal"><h3>Propuesta sin guardar</h3><p class="caption">${preview.sessions.length} sesiones nuevas · ${preview.skipped} sesiones existentes conservadas · ${esc(preview.timezone)}</p>${preview.sessions.length ? `<div class="table-scroll"><table><thead><tr><th>Práctica</th><th>Hora en zona del emisor</th></tr></thead><tbody>${preview.sessions.map(s=>`<tr><td>Día ${s.day} · ${esc(topic(s.topic_id))}</td><td>${esc(new Intl.DateTimeFormat('es',{timeZone:preview.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(s.scheduled_at)))}</td></tr>`).join('')}</tbody></table></div>` : empty('La agenda ya tiene sus sesiones', 'No se modificarán las fechas ni las sesiones registradas.')}<button class="primary" type="button" data-generate-agenda ${!preview.sessions.length?'disabled':''}>Generar ${preview.sessions.length} sesiones</button></div>` : '';
    const automatic=`<section class="panel"><div class="panel-head"><div><h2>Agenda automática</h2><p>Genera las sesiones faltantes sin sobrescribir las existentes.</p></div><span class="pill">Versión asignada</span></div><form id="auto-agenda-form" class="form-grid"><label class="wide">Emisor en entrenamiento<select name="enrollment_id" required>${active.map(e=>`<option value="${esc(e.id)}" ${controls.enrollment_id===e.id?'selected':''}>${esc(enrollLabel(e))}</option>`).join('')}</select></label><label>Fecha inicial<input type="date" name="start_date" value="${esc(controls.start_date)}" required></label><label>Hora local del emisor<input type="time" name="local_time" value="${esc(controls.local_time)}" required></label><label class="check-label wide"><input type="checkbox" name="weekends" ${controls.weekends?'checked':''}> Incluir sábados y domingos</label><p class="caption wide" id="auto-timezone">Zona del emisor: ${esc(e?.timezone||'—')}. Las prácticas del mismo día se programan consecutivamente.</p><div class="wide"><button class="secondary" type="submit" ${!active.length?'disabled':''}>Ver propuesta de agenda</button></div></form><div id="agenda-proposal">${proposal}</div></section>`;
    const sessions=w.sessions.filter(s=>active.some(e=>e.id===s.enrollment_id)), movable=sessions.filter(s=>s.status!=='completed');
    const first=movable[0], firstEnrollment=active.find(e=>e.id===first?.enrollment_id);
    const local=first ? parts(first.scheduled_at,firstEnrollment.timezone) : {local_date:'',local_time:''};
    const options=values=>values.map(s=>opt(s.id,`${enrollLabel(active.find(e=>e.id===s.enrollment_id))} · ${topic(s.topic_id)} · ${date(s.scheduled_at)}`)).join('');
    const record=w.attendance.find(a=>a.session_id===sessions[0]?.id);
    const statusOptions=status=>[['present','Presente'],['absent','Ausente'],['late','Tarde'],['excused','Justificada']].map(([value,label])=>`<option value="${value}" ${value===(status||'present')?'selected':''}>${label}</option>`).join('');
    return { automatic, controls:`<div class="cols"><section class="panel"><h2>Reprogramar sesión</h2><p>No se pueden mover sesiones completadas.</p><form id="reschedule-form"><label>Sesión<select name="session_id" required>${options(movable)}</select></label><p class="caption" id="reschedule-timezone">Zona del emisor: ${esc(firstEnrollment?.timezone||'—')}</p><div class="form-grid"><label>Nueva fecha<input type="date" name="local_date" value="${esc(local.local_date)}" required></label><label>Nueva hora local<input type="time" name="local_time" value="${esc(local.local_time)}" required></label></div><label>Motivo<input name="reason" maxlength="1000" required></label><button class="secondary" type="submit" ${!movable.length?'disabled':''}>Guardar reprogramación</button></form></section><section class="panel"><h2>Registrar asistencia</h2><p>La asistencia no aprueba evidencias ni completa el programa.</p><form id="attendance-form"><label>Sesión<select name="session_id" required>${options(sessions)}</select></label><label>Asistencia<select name="status">${statusOptions(record?.status)}</select></label><button class="primary" type="submit" ${!sessions.length?'disabled':''}>Guardar asistencia</button></form></section></div>` };
  }
  function handleChange(event) {
    if (event.target.closest('#program-form')) {
      captureProgram();
      if (event.target.name==='item_topic') {
        const row=event.target.closest('.program-item'), item=draft.items[Number(row.dataset.index)]; item.material_ids=[];
        row.querySelector('[name="item_materials"]').innerHTML=materialOptions(item);
      }
      for (const [index,row] of [...document.querySelectorAll('.program-item')].entries()) {
        row.querySelector('[name="item_day"]').max=draft.duration_days;
        row.querySelector('[data-program-up]').disabled=index===0||draft.items[index-1].day!==draft.items[index].day;
        row.querySelector('[data-program-down]').disabled=index===draft.items.length-1||draft.items[index+1].day!==draft.items[index].day;
      }
    }
    if (event.target.closest('#auto-agenda-form')) {
      const f=event.target.closest('form'); controls={enrollment_id:f.elements.enrollment_id.value,start_date:f.elements.start_date.value,local_time:f.elements.local_time.value,weekends:f.elements.weekends.checked};
      preview=null;previewBody=null;document.querySelector('#agenda-proposal').replaceChildren();
      document.querySelector('#auto-timezone').textContent=`Zona del emisor: ${state.workspace.enrollments.find(e=>e.id===controls.enrollment_id)?.timezone || '—'}. Las prácticas del mismo día se programan consecutivamente.`;
    }
    if (event.target.matches('#reschedule-form [name="session_id"]')) {
      const s=state.workspace.sessions.find(s=>s.id===event.target.value),e=state.workspace.enrollments.find(e=>e.id===s.enrollment_id), local=parts(s.scheduled_at,e.timezone),f=event.target.closest('form');
      f.elements.local_date.value=local.local_date;f.elements.local_time.value=local.local_time;
      document.querySelector('#reschedule-timezone').textContent=`Zona del emisor: ${e.timezone}`;
    }
    if (event.target.matches('#attendance-form [name="session_id"]')) event.target.closest('form').elements.status.value=state.workspace.attendance.find(a=>a.session_id===event.target.value)?.status||'present';
  }
  async function handleSubmit(form,data) {
    if (form.id==='program-form') { captureProgram(); action('/api/programs',draft,'Programa guardado como borrador.',()=>{draft=null;});return true; }
    if (form.id==='auto-agenda-form') {
      if(state.busy)return true;state.busy=true;
      try {
        controls={enrollment_id:data.enrollment_id,start_date:data.start_date,local_time:data.local_time,weekends:form.elements.weekends.checked};
        previewBody={enrollment_id:data.enrollment_id,start_date:data.start_date,local_time:data.local_time,weekdays:controls.weekends?[1,2,3,4,5,6,7]:[1,2,3,4,5]};
        preview=await api('/api/agenda/preview',previewBody);render();notify('Propuesta calculada. Todavía no se han creado sesiones.');
      } catch(error){notify(error.message,true);}finally{state.busy=false;}return true;
    }
    if (form.id==='reschedule-form') { const s=state.workspace.sessions.find(s=>s.id===data.session_id);action('/api/sessions/reschedule',{...data,expected_scheduled_at:s.scheduled_at},'Sesión reprogramada.',()=>{preview=null;previewBody=null;});return true; }
    if (form.id==='attendance-form') { const a=state.workspace.attendance.find(a=>a.session_id===data.session_id);action('/api/attendance',{...data,...(a?{expected_recorded_at:a.recorded_at}:{})},'Asistencia registrada.');return true; }
    return false;
  }
  async function handleClick(button) {
    if(button.dataset.editProgram){const p=state.workspace.program_versions.find(p=>p.id===button.dataset.editProgram);draft={source_id:p.id,title:p.title,duration_days:p.duration_days,changelog:'',items:state.workspace.program_items.filter(i=>i.program_version_id===p.id).sort((a,b)=>a.day-b.day||a.position-b.position).map(i=>({day:i.day,topic_id:i.topic_id,notes:i.notes,material_ids:state.workspace.program_materials.filter(m=>m.item_id===i.id).map(m=>m.material_id)}))};render();document.querySelector('#program-form input').focus();return true;}
    if(button.dataset.publishProgram){action('/api/programs/publish',{id:button.dataset.publishProgram},'Programa publicado.');return true;}
    if(button.hasAttribute('data-new-program')){draft=null;render();return true;}
    if(button.hasAttribute('data-add-program-item')){captureProgram();draft.items.push({day:Math.min(draft.duration_days,(draft.items.at(-1)?.day||0)+1),topic_id:publishedTopics()[0]?.id||'',notes:'',material_ids:[]});render();return true;}
    if(button.hasAttribute('data-remove-program-item')){captureProgram();draft.items.splice(Number(button.dataset.removeProgramItem),1);render();return true;}
    if(button.hasAttribute('data-program-up')||button.hasAttribute('data-program-down')){captureProgram();const index=Number(button.dataset.programUp??button.dataset.programDown),other=index+(button.hasAttribute('data-program-up')?-1:1);if(draft.items[other]?.day===draft.items[index]?.day)[draft.items[index],draft.items[other]]=[draft.items[other],draft.items[index]];render();return true;}
    if(button.hasAttribute('data-generate-agenda')){if(previewBody)action('/api/agenda/generate',previewBody,result=>`${result.created} sesiones creadas; ${result.skipped} sesiones existentes conservadas.`,()=>{preview=null;previewBody=null;});return true;}
    return false;
  }
  return {renderPrograms,renderAgendaExtras,handleChange,handleSubmit,handleClick,invalidateAgenda(){preview=null;previewBody=null;},reset(){draft=null;preview=null;previewBody=null;controls=null;}};
}
