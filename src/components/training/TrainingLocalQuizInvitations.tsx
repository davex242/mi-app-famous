import TrainingLocalAttemptApprovals from './TrainingLocalAttemptApprovals';
import TrainingLocalExamEditor from './TrainingLocalExamEditor';
import React,{useEffect,useState} from 'react';
import {LocalActor,LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;role:LocalActor['role'];busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalQuizInvitations({api,workspace,role,busy,run,refresh,notify}:Props){
  const [enrollmentId,setEnrollmentId]=useState(''),[examId,setExamId]=useState(''),[attempts,setAttempts]=useState('');
  const [invitation,setInvitation]=useState<{id:string;url:string}|null>(null),[revokeId,setRevokeId]=useState('');
  useEffect(()=>{setInvitation(current=>role!=='readonly'&&current&&workspace.exam_assignments.some(row=>row.id===current.id&&!row.revoked_at&&row.status==='issued'&&Date.parse(text(row,'expires_at'))>Date.now())?current:null);setRevokeId('');},[workspace,role]);
  useEffect(()=>{if(!invitation)return;const row=workspace.exam_assignments.find(row=>row.id===invitation.id);const timeout=setInterval(()=>{if(Date.parse(text(row??{},'expires_at'))<=Date.now())setInvitation(null);},1000);return ()=>clearInterval(timeout);},[invitation,workspace]);
  const readonly=role==='readonly';
  const budget=workspace.exam_attempt_budgets.find(row=>row.enrollment_id===enrollmentId);
  const valid=Number(budget?.remaining)>0&&Number(attempts)<=Number(budget?.total)&&attempts!==''&&Number.isInteger(Number(attempts))&&Number(attempts)>=1&&Number(attempts)<=10;
  const label=(id:unknown)=>{const e=workspace.enrollments.find(row=>row.id===id),host=workspace.trainees.find(row=>row.host_id===e?.host_id);return host?text(host,'label'):'Emisor DEMO';};
  return <>
    <div className="td-table-scroll"><table><thead><tr><th>Examen publicado</th><th>Versión</th><th>Preguntas</th><th>Umbral</th></tr></thead><tbody>{workspace.exams.map(row=><tr key={row.id}><td>{text(row,'exam_key')}</td><td>{String(row.version)}</td><td>{String(row.question_count)}</td><td>{String(row.pass_percent)} %</td></tr>)}</tbody></table></div>
    <p>Las preguntas y su calificación se entregan en la página de quiz existente. Las claves se administran solo en el editor autorizado; no se entregan al participante. Los enlaces generados aquí sirven solo en este servidor local.</p>
    {!readonly&&<form className="td-panel" onSubmit={event=>{event.preventDefault();if(!valid)return;setInvitation(null);void run(async()=>{
      const result=await api.issueExam(enrollmentId,examId,Number(attempts));
      if(!/^[A-Za-z0-9_-]{43}$/.test(result.invitation_token))throw Error('Invalid invitation');
      await refresh();setInvitation({id:result.assignment.id,url:`${window.location.origin}/quiz#${result.invitation_token}`});notify('Invitación DEMO creada. Conserva el enlace; no se recupera al recargar.');
    });}}><h3>Crear invitación DEMO</h3>
      <label>Inscripción para quiz<select aria-label="Inscripción para quiz" required disabled={busy} value={enrollmentId} onChange={e=>setEnrollmentId(e.target.value)}><option value="">Selecciona una inscripción activa</option>{workspace.enrollments.filter(row=>row.status==='active').map(row=><option key={row.id} value={row.id}>{label(row.id)}</option>)}</select></label>
      <label>Examen publicado<select aria-label="Examen publicado" required disabled={busy} value={examId} onChange={e=>setExamId(e.target.value)}><option value="">Selecciona un examen</option>{workspace.exams.map(row=><option key={row.id} value={row.id}>{text(row,'exam_key')} · v{String(row.version)} · {String(row.pass_percent)} %</option>)}</select></label>
      <label>Máximo de intentos<input aria-label="Máximo de intentos" type="number" min="1" max={Math.min(10,Number(budget?.total)||3)} step="1" required disabled={busy} value={attempts} onChange={e=>setAttempts(e.target.value)}/></label>
      <p>El cupo inicial es de 3 intentos por entrenamiento. Renovar un enlace no reinicia el cupo; los extras requieren aprobación previa.</p>
      <p>Vencimiento confirmado: 24 horas desde la emisión, calculadas por el servidor. La fecha exacta aparece en la invitación.</p>
      <button disabled={busy||!enrollmentId||!examId||!valid}>Crear enlace de quiz DEMO</button>
    </form>}
    {invitation&&!readonly&&<article className="td-panel" aria-label="Invitación DEMO"><label>Enlace de quiz DEMO<input aria-label="Enlace de quiz DEMO" readOnly value={invitation.url}/></label><a href={invitation.url} target="_blank" rel="noopener noreferrer">Abrir quiz local</a><button onClick={()=>setInvitation(null)}>Ocultar enlace DEMO</button></article>}
    <TrainingLocalAttemptApprovals api={api} workspace={workspace} role={role} busy={busy} run={run} refresh={refresh} notify={notify}/>
    <h3>Invitaciones del entorno local</h3>
    {workspace.exam_assignments.map(row=><article className="td-panel td-local-invitation" key={row.id}><p>{label(row.enrollment_id)} · {row.revoked_at?'Revocada':text(row,'status')} · {String(row.max_attempts)} intentos · vence {text(row,'expires_at')} (UTC)</p>
      {!readonly&&!row.revoked_at&&row.status==='issued'&&<><button disabled={busy} onClick={()=>setRevokeId(row.id!)}>Revisar revocación DEMO</button>{revokeId===row.id&&<><p>Confirma que quieres invalidar este enlace de prueba.</p><button disabled={busy} onClick={()=>void run(async()=>{await api.revokeExam(row.id!);setInvitation(null);await refresh();notify('Invitación DEMO revocada.');})}>Confirmar revocación DEMO</button></>}</>}
    </article>)}
    {!workspace.exam_assignments.length&&<p>Aún no hay invitaciones de prueba.</p>}
    {(role==='superadmin'||role==='subadmin')&&<TrainingLocalExamEditor api={api} workspace={workspace} busy={busy} run={run} refresh={refresh} notify={notify}/>}
  </>;
}
