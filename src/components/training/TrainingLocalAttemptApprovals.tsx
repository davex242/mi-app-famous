import React,{useState} from 'react';
import {LocalActor,LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;role:LocalActor['role'];busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
export default function TrainingLocalAttemptApprovals({api,workspace,role,busy,run,refresh,notify}:Props){
 const [enrollmentId,setEnrollmentId]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState('');
 const [decisions,setDecisions]=useState<Record<string,string>>({}),[notes,setNotes]=useState<Record<string,string>>({});
 const [confirmation,setConfirmation]=useState<{id:string;workspace:LocalWorkspace;decision:string;notes:string}|null>(null);
 const admin=role==='superadmin'||role==='subadmin',readonly=role==='readonly';
 const label=(id:unknown)=>{const enrollment=workspace.enrollments.find(row=>row.id===id),trainee=workspace.trainees.find(row=>row.host_id===enrollment?.host_id);return trainee?text(trainee,'label'):'Emisor DEMO';};
 const active=(id:unknown)=>workspace.enrollments.some(row=>row.id===id&&row.status==='active');
 const requests=workspace.exam_attempt_budgets.flatMap(row=>Array.isArray(row.requests)?row.requests as PublicRow[]:[]);
 const selected=workspace.exam_attempt_budgets.find(row=>row.enrollment_id===enrollmentId);
 return <section className="td-panel" aria-label="Autorización de intentos adicionales"><h3>Intentos adicionales · Preaprobación</h3>
   {workspace.exam_attempt_budgets.map(row=><p key={String(row.enrollment_id)}>{label(row.enrollment_id)} · Cupo: {String(row.total)} · Iniciados: {String(row.used)} · Disponibles: {String(row.remaining)} · Extras aprobados: {String(row.approved_extra)}</p>)}
   <p>Los intentos iniciados cuentan aunque el enlace venza o se revoque. Una solicitud pendiente no aumenta el cupo. Retomar un intento abierto no consume otro.</p>
   {!readonly&&<form onSubmit={event=>{event.preventDefault();void run(async()=>{await api.requestExtraAttempts(enrollmentId,Number(amount),reason);setAmount('');setReason('');await refresh();notify('Solicitud DEMO registrada; el cupo sigue igual hasta su aprobación.');});}}>
    <label>Entrenamiento para intentos adicionales<select aria-label="Entrenamiento para intentos adicionales" required disabled={busy} value={enrollmentId} onChange={event=>setEnrollmentId(event.target.value)}><option value="">Selecciona un entrenamiento activo</option>{workspace.enrollments.filter(row=>active(row.id)).map(row=><option key={row.id} value={row.id}>{label(row.id)}</option>)}</select></label>
    <label>Intentos adicionales solicitados<input aria-label="Intentos adicionales solicitados" required type="number" min="1" max="10" step="1" disabled={busy} value={amount} onChange={event=>setAmount(event.target.value)}/></label>
    <label>Motivo de la solicitud<textarea aria-label="Motivo de la solicitud" required maxLength={2000} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)}/></label>
    <button disabled={busy||!enrollmentId||!active(enrollmentId)||!reason.trim()||!Number.isInteger(Number(amount))||Number(amount)<1||Number(amount)>10||(selected&&Array.isArray(selected.requests)&&selected.requests.some(row=>row.status==='pending'))}>Solicitar intentos adicionales DEMO</button>
   </form>}
   {requests.map(row=><article className="td-panel td-local-attempt-request" key={row.id}><h4>{label(row.enrollment_id)} · {String(row.extra_attempts)} intentos solicitados</h4><p>{text(row,'reason')}</p><p>Estado: {row.status==='pending'?'Pendiente':row.status==='approved'?'Aprobada':'Rechazada'}</p>{!!row.review_notes&&<p>Revisión: {text(row,'review_notes')} · {text(row,'reviewed_at')}</p>}
    {admin&&row.status==='pending'&&active(row.enrollment_id)&&<form onSubmit={event=>{event.preventDefault();if(confirmation?.id!==row.id||confirmation?.workspace!==workspace||confirmation?.decision!==decisions[row.id!]||confirmation?.notes!==notes[row.id!])return;void run(async()=>{await api.reviewExtraAttempts(text(row,'enrollment_id'),row.id!,decisions[row.id!],notes[row.id!]);setConfirmation(null);await refresh();notify('Decisión DEMO registrada con el administrador que la tomó.');});}}>
     <label>Decisión de intentos adicionales<select aria-label="Decisión de intentos adicionales" required disabled={busy} value={decisions[row.id!]??''} onChange={event=>{setConfirmation(null);setDecisions({...decisions,[row.id!]:event.target.value});}}><option value="">Selecciona una decisión</option><option value="approved">Aprobar cantidad solicitada</option><option value="rejected">Rechazar solicitud</option></select></label>
     <label>Notas de autorización<textarea aria-label="Notas de autorización" required maxLength={2000} disabled={busy} value={notes[row.id!]??''} onChange={event=>{setConfirmation(null);setNotes({...notes,[row.id!]:event.target.value});}}/></label>
     <label className="td-weekday"><input aria-label="Confirmo decisión sobre intentos adicionales" type="checkbox" checked={confirmation?.id===row.id&&confirmation?.workspace===workspace} disabled={busy||!decisions[row.id!]||!notes[row.id!]?.trim()} onChange={event=>setConfirmation(event.target.checked?{id:row.id!,workspace,decision:decisions[row.id!],notes:notes[row.id!]}:null)}/>Confirmo esta decisión y la cantidad indicada.</label>
     <button disabled={busy||confirmation?.id!==row.id||confirmation?.workspace!==workspace}>Guardar decisión de intentos DEMO</button>
    </form>}
   </article>)}
   {!requests.length&&<p>Sin solicitudes de intentos adicionales.</p>}
 </section>;
}
