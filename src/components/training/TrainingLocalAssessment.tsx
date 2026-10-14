import React, {useState} from 'react';
import {LocalActor,LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const number=(row:PublicRow,key:string)=>typeof row[key]==='number'?row[key] as number:0;
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;role:LocalActor['role'];busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalAssessment({api,workspace,role,busy,run,refresh,notify}:Props){
  const [sessionId,setSessionId]=useState(''),[score,setScore]=useState(''),[result,setResult]=useState(''),[notes,setNotes]=useState('');
  const [confirmation,setConfirmation]=useState<{workspace:LocalWorkspace;sessionId:string}|null>(null);
  const admin=role==='superadmin'||role==='subadmin';
  const active=(id:unknown)=>workspace.enrollments.some(row=>row.id===id&&row.status==='active');
  const latest=(session:PublicRow)=>workspace.assessments.filter(row=>row.enrollment_id===session.enrollment_id&&row.topic_id===session.topic_id).sort((a,b)=>text(b,'assessed_at').localeCompare(text(a,'assessed_at'))||text(b,'id').localeCompare(text(a,'id')))[0];
  const completed=(session:PublicRow)=>workspace.completions.some(row=>row.enrollment_id===session.enrollment_id&&(row.item_id===session.item_id||row.item_id===session.current_item_id));
  const label=(session:PublicRow)=>{const enrollment=workspace.enrollments.find(row=>row.id===session.enrollment_id),trainee=workspace.trainees.find(row=>row.host_id===enrollment?.host_id),topic=workspace.topics.find(row=>row.id===session.topic_id);return `${trainee?text(trainee,'label'):'Emisor DEMO'} · ${topic?text(topic,'title'):'Práctica DEMO'}`;};
  const selected=workspace.sessions.find(row=>row.id===sessionId),item=workspace.program_items.find(row=>row.id===selected?.item_id);
  const assessment=selected?latest(selected):undefined;
  const hasEvidence=workspace.evidence.some(row=>row.session_id===sessionId&&row.status==='approved');
  const ready=!!item&&(!item.evidence_required||hasEvidence)&&(!item.assessment_required||assessment?.passed===true);
  const confirmed=confirmation?.workspace===workspace&&confirmation.sessionId===sessionId;
  const validScore=score.trim()!==''&&Number.isFinite(Number(score))&&Number(score)>=0&&Number(score)<=100;
  return <section aria-label="Evaluación de prácticas"><h3>Evaluación y validación de prácticas</h3>
    <p>La evaluación guarda una decisión administrativa. Validar una práctica requiere una confirmación separada y la comprobación final del servidor. El cierre y el quiz final siguen siendo independientes.</p>
    <div className="td-table-scroll"><table><thead><tr><th>Práctica</th><th>Última evaluación</th><th>Validación</th></tr></thead><tbody>{workspace.sessions.map(session=>{const assessment=latest(session);return <tr key={session.id}><td>{label(session)}</td><td>{assessment?`${String(assessment.score)} / 100 · ${assessment.passed===true?'Aprobada':'No aprobada'}`:'Sin evaluar'}</td><td>{completed(session)?'Validada':'Sin validar'}</td></tr>;})}</tbody></table></div>
    {workspace.progress.map(row=><p key={text(row,'enrollment_id')}>Progreso práctico: {number(row,'completed_items')} / {number(row,'total_items')} prácticas · {number(row,'percent')} %</p>)}
    {admin&&<>
      <label>Práctica a evaluar<select aria-label="Práctica a evaluar" disabled={busy} value={sessionId} onChange={e=>{setSessionId(e.target.value);setScore('');setResult('');setNotes('');setConfirmation(null);}}><option value="">Selecciona una sesión activa</option>{workspace.sessions.filter(row=>active(row.enrollment_id)).map(row=><option key={row.id} value={row.id}>{label(row)}{completed(row)?' · Validada':''}</option>)}</select></label>
      {selected&&active(selected.enrollment_id)&&!completed(selected)&&<>
        <form className="td-panel" onSubmit={event=>{event.preventDefault();if(!validScore)return;void run(async()=>{
          await api.assess(sessionId,Number(score),result==='passed',notes);setScore('');setResult('');setNotes('');setConfirmation(null);await refresh();notify('Evaluación DEMO guardada. La práctica aún requiere validación explícita.');
        });}}><h4>Guardar evaluación DEMO</h4>
          <label>Calificación de práctica<input aria-label="Calificación de práctica" type="number" min="0" max="100" step="0.01" required disabled={busy} value={score} onChange={e=>setScore(e.target.value)}/></label>
          <label>Resultado administrativo<select aria-label="Resultado administrativo" required disabled={busy} value={result} onChange={e=>setResult(e.target.value)}><option value="">Selecciona una decisión</option><option value="passed">Aprobada</option><option value="failed">No aprobada</option></select></label>
          <label>Notas de evaluación<textarea aria-label="Notas de evaluación" required maxLength={2000} disabled={busy} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
          <p>No se aplica un umbral automático: el resultado lo decide el administrador y queda registrado con la calificación.</p>
          <button disabled={busy||!validScore||!result||!notes.trim()}>Guardar evaluación DEMO</button>
        </form>
        <article className="td-panel" aria-label="Requisitos de validación"><h4>Validar práctica DEMO</h4>
          <p>Evidencia: {item?.evidence_required?(hasEvidence?'Aprobada':'Falta evidencia aprobada'):'No requerida por esta práctica'}.</p>
          <p>Evaluación: {item?.assessment_required?(assessment?.passed===true?'Última evaluación aprobada':'Falta una evaluación aprobada'):'No requerida por esta práctica'}.</p>
          {assessment&&<p>Últimas notas: {text(assessment,'notes')}</p>}
          <label className="td-weekday"><input aria-label="Confirmo validación de práctica" type="checkbox" checked={confirmed} disabled={busy||!ready} onChange={e=>setConfirmation(e.target.checked?{workspace,sessionId}:null)}/>Confirmo validar esta práctica DEMO con los requisitos mostrados.</label>
          <button disabled={busy||!ready||!confirmed} onClick={()=>void run(async()=>{setConfirmation(null);await api.completePractice(sessionId);await refresh();notify('Práctica DEMO validada. El entrenamiento sigue sujeto a sus requisitos de cierre.');})}>Validar práctica DEMO</button>
        </article>
      </>}
      {selected&&completed(selected)&&<p>Esta práctica ya está validada.</p>}
    </>}
  </section>;
}
