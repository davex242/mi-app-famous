import React,{useState} from 'react';
import {ClosingPreview,LocalActor,LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const reasons:Record<string,string>={active_enrollment_required:'La inscripción debe estar activa.',published_program_required:'Se requiere un programa publicado.',practices_pending:'Hay prácticas pendientes.',quiz_pending:'Falta un quiz verificado y aprobado.',validation_missing:'Sin validación.',completed_session_missing:'Sin sesión completada.',approved_evidence_missing:'Falta evidencia aprobada.',passing_assessment_missing:'Falta evaluación aprobada.'};
function download(content:string,mime:string,format:'html'|'json') {const url=URL.createObjectURL(new Blob([content],{type:mime})),link=document.createElement('a');link.href=url;link.download=`cierre-demo.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;role:LocalActor['role'];busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalClosing({api,workspace,role,busy,run,refresh,notify}:Props){
  const [enrollmentId,setEnrollmentId]=useState(''),[attemptId,setAttemptId]=useState(''),[notes,setNotes]=useState('');
  const [preview,setPreview]=useState<{data:ClosingPreview;workspace:LocalWorkspace;enrollmentId:string;attemptId:string}|null>(null);
  const [confirmed,setConfirmed]=useState<typeof preview>(null);
  const admin=role==='superadmin'||role==='subadmin';
  const selected=workspace.enrollments.find(row=>row.id===enrollmentId);
  const attempts=workspace.exam_attempts.filter(row=>!!row.submitted_at&&workspace.exam_assignments.some(a=>a.id===row.assignment_id&&a.enrollment_id===enrollmentId));
  const current=preview?.workspace===workspace&&preview.enrollmentId===enrollmentId&&preview.attemptId===attemptId?preview:null;
  const label=(id:unknown)=>{const e=workspace.enrollments.find(row=>row.id===id),host=workspace.trainees.find(row=>row.host_id===e?.host_id);return host?text(host,'label'):'Emisor DEMO';};
  const records=workspace.closing_records.filter(row=>!enrollmentId||row.enrollment_id===enrollmentId);
  function invalidate(){setPreview(null);setConfirmed(null);}
  return <>
    <label>Inscripción para cierre<select aria-label="Inscripción para cierre" disabled={busy} value={enrollmentId} onChange={e=>{setEnrollmentId(e.target.value);setAttemptId('');setNotes('');invalidate();}}><option value="">Selecciona una inscripción</option>{workspace.enrollments.map(row=><option key={row.id} value={row.id}>{label(row.id)} · {text(row,'status')}</option>)}</select></label>
    {selected&&selected.status==='active'&&<>
      <label>Intento de quiz para cierre<select aria-label="Intento de quiz para cierre" disabled={busy} value={attemptId} onChange={e=>{setAttemptId(e.target.value);invalidate();}}><option value="">Revisar sin quiz seleccionado</option>{attempts.map(row=><option key={row.id} value={row.id}>Intento {String(row.attempt_number)} · {String(row.score_percent)} % · {row.passed===true?'Aprobado':'No aprobado'} · {text(row,'submitted_at')}</option>)}</select></label>
      <button disabled={busy} onClick={()=>{invalidate();void run(async()=>{const data=await api.previewClosing(enrollmentId,attemptId||undefined);setPreview({data,workspace,enrollmentId,attemptId});});}}>Revisar requisitos de cierre DEMO</button>
    </>}
    {current&&<article className="td-panel" aria-label="Revisión de cierre"><h3>{current.data.program_title} · v{current.data.program_version}</h3><p>Prácticas: {current.data.progress.completed_items} / {current.data.progress.total_items} · {current.data.progress.percent} %</p><p>Quiz: {current.data.quiz.ready?'Verificado y aprobado':'Pendiente de aprobación verificada'}{current.data.quiz.score_percent!==null?` · ${current.data.quiz.score_percent} % · umbral ${current.data.quiz.pass_percent} %`:''}</p>
      <p>{current.data.ready?'Requisitos completos según el servidor.':'El entrenamiento todavía no puede cerrarse.'}</p><ul>{current.data.problems.map(reason=><li key={reason}>{reasons[reason]??'Requisito pendiente.'}</li>)}</ul>
      <ol>{current.data.checks.map((check,index)=><li key={index}>Día {check.day}: {check.ready?'Verificado':check.problems.map(reason=>reasons[reason]??'Requisito pendiente.').join(' ')}</li>)}</ol>
      {admin&&<form onSubmit={event=>{event.preventDefault();if(!current.data.ready||confirmed!==current||!attemptId)return;setConfirmed(null);setPreview(null);void run(async()=>{await api.closeTraining(enrollmentId,attemptId,current.data.program_version_id,current.data.preview_hash,notes);await refresh();notify('Entrenamiento DEMO cerrado. Su resultado quedó conservado en el historial.');});}}>
        <label>Notas de cierre<textarea aria-label="Notas de cierre" required maxLength={2000} disabled={busy} value={notes} onChange={e=>{setNotes(e.target.value);setConfirmed(null);}}/></label>
        <label className="td-weekday"><input aria-label="Confirmo cierre del entrenamiento" type="checkbox" checked={confirmed===current} disabled={busy||!current.data.ready||!attemptId} onChange={e=>setConfirmed(e.target.checked?current:null)}/>Confirmo el cierre de este entrenamiento DEMO con los requisitos revisados.</label>
        <button disabled={busy||!current.data.ready||confirmed!==current||!attemptId||!notes.trim()}>Confirmar cierre final DEMO</button>
      </form>}
    </article>}
    {selected?.status==='completed'&&<p>Este entrenamiento ya está cerrado. Su registro histórico conserva el resultado del cierre.</p>}
    <h3>Historial de cierres</h3>
    {records.map(row=><article className="td-panel td-local-closing-record" key={row.id}><h4>{label(row.enrollment_id)}</h4><p>Cierre (UTC): {text(row,'created_at')}</p><button disabled={busy} onClick={()=>void run(async()=>{const report=await api.exportClosing(row.id!,'html');download(report.content,report.mime,'html');})}>Descargar informe HTML DEMO</button><button disabled={busy} onClick={()=>void run(async()=>{const report=await api.exportClosing(row.id!,'json');download(report.content,report.mime,'json');})}>Descargar historial JSON DEMO</button></article>)}
    {!records.length&&<p>Sin cierres registrados para esta selección.</p>}
  </>;
}
