const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let token=location.hash.slice(1),attempt=null,busy=false;
// Fragments do not reach HTTP/access logs; remove it before any page interaction.
history.replaceState(null,'',location.pathname);
// Opening another invitation in this same tab must validate it again.
window.addEventListener('hashchange',()=>{if(location.hash)location.reload();});
const content=document.querySelector('#quiz-content'),message=document.querySelector('#quiz-message');
const errors={'Invitation unavailable':'La invitación no está disponible: puede haber vencido o sido revocada. Solicita un enlace vigente a tu reclutador.','Exam is finished':'Este examen ya finalizó.','Attempt limit reached':'Se alcanzó el límite de intentos.','Answer all 50 questions':'Responde las 50 preguntas antes de enviar.','Submitted answers cannot change':'El intento ya fue enviado y no admite cambios.','Try again later':'Espera un minuto antes de intentarlo otra vez.'};
async function api(path,body){const r=await fetch('/api/training/gateway?route='+encodeURIComponent(path),{method:'POST',headers:{'content-type':'application/json','x-training-authorization':`Bearer ${token}`},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(errors[data.error]||'No se pudo completar esta acción.');return data;}
function notify(text,error=false){message.textContent=text;message.className=error?'error':'caption';}
function resultCard(r){return `<article class="stat"><label>Intento ${r.attempt_number}</label><strong>${r.score_percent}%</strong><p>${r.passed?'Aprobado':'No aprobado'}</p></article>`;}
async function status(){const s=await api('/api/quiz/status',{});content.innerHTML=`<section class="panel"><h2>Antes de empezar</h2><p>Responde las 50 preguntas y envía una sola vez al terminar. Aprobación: ${s.pass_percent}%. Intentos permitidos: ${s.max_attempts}. Vence: ${esc(new Date(s.expires_at).toLocaleString('es-CR'))}.</p><p class="caption">El enlace autoriza esta invitación; no verifica quién está respondiendo. Responde personalmente. No se muestran las claves correctas.</p>${s.can_start?'<div class="actions"><button id="quiz-start" class="primary">Empezar o retomar el intento</button></div>':'<p class="caption">El examen finalizó. Consulta el resultado con tu reclutador.</p>'}</section>${s.attempts.map(resultCard).join('')}`;}
content.addEventListener('click',async e=>{
  if(e.target.id!=='quiz-start'||busy)return;
  busy=true;e.target.disabled=true;
  try{attempt=await api('/api/quiz/start',{});content.innerHTML=`<form id="quiz-answers"><section class="panel"><h2>Intento ${attempt.attempt_number}</h2><p>Responde cada pregunta. Tus respuestas sin enviar permanecen solo en esta pantalla.</p><p id="quiz-counter" class="caption">0 de 50 respondidas</p></section>${attempt.questions.map(q=>`<fieldset class="panel quiz-question"><legend>${q.position}. ${esc(q.prompt)}</legend>${q.options.map((o,i)=>`<label class="quiz-option"><input type="radio" name="${esc(q.id)}" value="${i}" required><span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}<div class="panel"><button class="primary" type="submit">Enviar las 50 respuestas</button></div></form>`;notify('Intento listo. Si cierras esta página, necesitarás volver a abrir el enlace original.');}
  catch(err){notify(err.message,true);e.target.disabled=false;}finally{busy=false;}
});
content.addEventListener('change',()=>{const c=document.querySelector('#quiz-counter');if(c)c.textContent=`${content.querySelectorAll('input:checked').length} de 50 respondidas`;});
content.addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button');button.disabled=true;
  try{const values=new FormData(e.target);const r=await api('/api/quiz/submit',{attempt_id:attempt.attempt_id,answers:attempt.questions.map(q=>({question_id:q.id,selected_option:values.has(q.id)?Number(values.get(q.id)):null}))});await status();notify(`Resultado guardado: ${r.score_percent}% · ${r.passed?'Aprobado':'No aprobado'}.`);}
  catch(err){notify(err.message,true);button.disabled=false;}finally{busy=false;}
});
if(!/^[A-Za-z0-9_-]{43}$/.test(token)){token=null;notify('Abre el enlace completo que te entregó tu reclutador.',true);}else status().catch(e=>notify(e.message,true));
