import React, {useRef,useState} from 'react';
import {LocalActor,LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const labels:Record<string,string>={pending:'Pendiente',approved:'Aprobada',rejected:'Rechazada'};
const MAX_BYTES=2*1024*1024;
async function attachment(file:File) {
  if(!file.size||file.size>MAX_BYTES)throw Error('Invalid evidence file size');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  const data=btoa(binary);
  if(file.type==='image/png')return {image_base64:data};
  if(file.type==='application/pdf')return {pdf_base64:data};
  return {video_base64:data};
}
function download(file:{mime:string;image_base64?:string;pdf_base64?:string;video_base64?:string}) {
  const formats:Record<string,[string|undefined,string]>={'image/png':[file.image_base64,'png'],'application/pdf':[file.pdf_base64,'pdf'],'video/mp4':[file.video_base64,'mp4']};
  const format=formats[file.mime];if(!format?.[0]||format[0].length>Math.ceil(MAX_BYTES/3)*4)throw Error('Invalid evidence file');
  const bytes=Uint8Array.from(atob(format[0]),char=>char.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:file.mime})),link=document.createElement('a');
  link.href=url;link.download=`evidencia-demo.${format[1]}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;role:LocalActor['role'];busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalEvidence({api,workspace,role,busy,run,refresh,notify}:Props){
  const [filter,setFilter]=useState(''),[sessionId,setSessionId]=useState(''),[description,setDescription]=useState('');
  const [file,setFile]=useState<File|null>(null),[consent,setConsent]=useState(false),[fileError,setFileError]=useState('');
  const [notes,setNotes]=useState<Record<string,string>>({}),[decisions,setDecisions]=useState<Record<string,string>>({});
  const fileInput=useRef<HTMLInputElement>(null);
  const admin=role==='superadmin'||role==='subadmin',readonly=role==='readonly';
  const active=(id:unknown)=>workspace.enrollments.some(row=>row.id===id&&row.status==='active');
  const sessionLabel=(id:unknown)=>{
    const session=workspace.sessions.find(row=>row.id===id),enrollment=workspace.enrollments.find(row=>row.id===session?.enrollment_id),trainee=workspace.trainees.find(row=>row.host_id===enrollment?.host_id),topic=workspace.topics.find(row=>row.id===session?.topic_id);
    return `${trainee?text(trainee,'label'):'Emisor DEMO'} · ${topic?text(topic,'title'):'Práctica DEMO'}`;
  };
  return <>
    <label>Estado de evidencia<select aria-label="Estado de evidencia" value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    {workspace.evidence.filter(row=>!filter||row.status===filter).map(row=><article className="td-panel td-local-proof" key={row.id} aria-label={`Evidencia ${row.id}`}>
      <h3>{sessionLabel(row.session_id)}</h3><p>{text(row,'description')}</p><p>Estado: <strong>{labels[text(row,'status')]}</strong></p>
      {!!row.storage_path&&<button disabled={busy} onClick={()=>void run(async()=>download(await api.downloadEvidence(row.id!)))}>Descargar archivo DEMO</button>}
      {!row.storage_path&&<p>Evidencia descriptiva sin archivo adjunto.</p>}
      {workspace.approvals.filter(approval=>approval.evidence_id===row.id&&approval.status!=='pending').map(approval=><p key={approval.id}>Revisión: {text(approval,'review_notes')}</p>)}
      {admin&&row.status==='pending'&&active(row.enrollment_id)&&<form onSubmit={event=>{event.preventDefault();void run(async()=>{
        await api.reviewEvidence(row.id!,decisions[row.id!]??'',notes[row.id!]??'');await refresh();notify('Revisión DEMO guardada.');
      });}}>
        <label>Decisión de revisión<select aria-label="Decisión de revisión" required disabled={busy} value={decisions[row.id!]??''} onChange={e=>setDecisions({...decisions,[row.id!]:e.target.value})}><option value="">Selecciona una decisión</option><option value="approved">Aprobar</option><option value="rejected">Rechazar</option></select></label>
        <label>Notas de revisión<textarea aria-label="Notas de revisión" required maxLength={2000} disabled={busy} value={notes[row.id!]??''} onChange={e=>setNotes({...notes,[row.id!]:e.target.value})}/></label>
        <button disabled={busy||!decisions[row.id!]||!notes[row.id!]?.trim()}>Guardar revisión DEMO</button>
      </form>}
    </article>)}
    {!workspace.evidence.some(row=>!filter||row.status===filter)&&<p>Sin evidencias para este filtro.</p>}
    {!readonly&&<form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
      await api.submitEvidence({session_id:sessionId,description,...(file?{...await attachment(file),consent_confirmed:consent}:{})});
      setDescription('');setFile(null);setConsent(false);if(fileInput.current)fileInput.current.value='';await refresh();notify('Evidencia DEMO enviada a revisión.');
    });}}><h3>Enviar evidencia DEMO</h3>
      <label>Sesión de evidencia<select aria-label="Sesión de evidencia" required value={sessionId} disabled={busy} onChange={e=>setSessionId(e.target.value)}><option value="">Selecciona una sesión activa</option>{workspace.sessions.filter(row=>active(row.enrollment_id)).map(row=><option key={row.id} value={row.id}>{sessionLabel(row.id)}</option>)}</select></label>
      <label>Descripción de evidencia<textarea aria-label="Descripción de evidencia" required maxLength={2000} disabled={busy} value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <label>Archivo DEMO opcional<input aria-label="Archivo DEMO opcional" ref={fileInput} type="file" accept="image/png,application/pdf,video/mp4" disabled={busy} onChange={e=>{
        const next=e.target.files?.[0]??null;setConsent(false);setFileError('');setFile(null);
        if(next&&(!next.size||next.size>MAX_BYTES||!['image/png','application/pdf','video/mp4'].includes(next.type))){setFileError('Elige un PNG, PDF o MP4 de hasta 2 MiB.');e.target.value='';return;}setFile(next);
      }}/></label>
      <p>Usa archivos ficticios: PNG, PDF estático o MP4 H.264, hasta 2 MiB. El servidor valida el contenido. La aprobación de evidencia no completa por sí sola una práctica.</p>
      {fileError&&<p role="alert">{fileError}</p>}
      {file&&<label className="td-weekday"><input aria-label="Confirmo uso de archivo ficticio" type="checkbox" required checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>Confirmo que el archivo es ficticio y autorizado para esta prueba local.</label>}
      <button disabled={busy||!sessionId||!description.trim()||!!fileError||(!!file&&!consent)}>Enviar evidencia a revisión DEMO</button>
    </form>}
  </>;
}
