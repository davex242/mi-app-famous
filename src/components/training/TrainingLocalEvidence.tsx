import {preparePrivateImage} from './preparePrivateImage';
import TrainingLocalAssessment from './TrainingLocalAssessment';
import React, {useEffect,useRef,useState} from 'react';
import {EvidencePreview,LocalTrainingError,LocalActor,LocalTrainingApi,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const labels:Record<string,string>={pending:'Pendiente',approved:'Aprobada',rejected:'Rechazada'};
const MAX_BYTES=2*1024*1024;
async function attachment(file:File) {
  if(!file.size||file.size>MAX_BYTES)throw Error('Invalid evidence file size');
  if(['image/png','image/jpeg','image/webp'].includes(file.type))return {image_base64:(await preparePrivateImage(file)).base64};
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
  const data=btoa(binary);
  if(file.type==='application/pdf')return {pdf_base64:data};
  if(file.type==='video/mp4')return {video_base64:data};
  throw Error('Formato no admitido. Usa PNG, JPG, JPEG, WebP, PDF o MP4.');
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
  const [selectedEvidence,setSelectedEvidence]=useState<string[]>([]),[batchDecision,setBatchDecision]=useState(''),[batchNotes,setBatchNotes]=useState(''),[batchResults,setBatchResults]=useState<{id:string;ok:boolean;message:string}[]>([]);
  const fileInput=useRef<HTMLInputElement>(null),dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null);
  const [preview,setPreview]=useState<{data:EvidencePreview;workspace:LocalWorkspace;videoUrl?:string}|null>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const current=useRef({workspace,filter});current.current={workspace,filter};
  useEffect(()=>{setPreview(null);},[workspace,filter]);
  useEffect(()=>{const url=preview?.videoUrl,element=video.current;return ()=>{if(element){element.pause();element.removeAttribute('src');element.load();}if(url)URL.revokeObjectURL(url);};},[preview]);
  useEffect(()=>{if(preview&&preview.workspace===workspace)dialog.current?.showModal();else dialog.current?.close();},[preview,workspace]);
  function close(){video.current?.pause();setPreview(null);}
  const data=preview?.workspace===workspace?preview.data:null;
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
      {['.png','.mp4'].some(extension=>text(row,'storage_path').endsWith(extension))&&<button disabled={busy} onClick={()=>void run(async()=>{
        const result=await api.previewEvidence(row.id!);
        if(!mounted.current||current.current.workspace!==workspace||current.current.filter!==filter)return;
        let videoUrl:string|undefined;
        if(result.type==='video'){if(result.video.data.length>Math.ceil(MAX_BYTES/3)*4)throw Error('Invalid evidence file');const bytes=Uint8Array.from(atob(result.video.data),char=>char.charCodeAt(0));videoUrl=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));}
        setPreview({data:result,workspace,videoUrl});
      })}>Vista previa de evidencia</button>}
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
    {admin&&<form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
      const results:{id:string;ok:boolean;message:string}[]=[];
      const eligible=workspace.evidence.filter(row=>row.status==='pending'&&active(row.enrollment_id));
      for(const id of selectedEvidence.filter(id=>eligible.some(row=>row.id===id))){
        try{await api.reviewEvidence(id,batchDecision,batchNotes);results.push({id,ok:true,message:'Revisión guardada'});}
        catch(reason){if(reason instanceof LocalTrainingError&&[401,403].includes(reason.status))throw reason;results.push({id,ok:false,message:reason instanceof Error?reason.message:'No se pudo revisar'});}
      }
      setBatchResults(results);setSelectedEvidence([]);await refresh();notify(`Revisión masiva: ${results.filter(row=>row.ok).length} guardadas, ${results.filter(row=>!row.ok).length} fallidas.`);
    });}}><h3>Revisar evidencias de varios emisores</h3>
      <p>La decisión se aplica únicamente a las evidencias pendientes seleccionadas. Cada evidencia mantiene su ficha, historial y validaciones individuales.</p>
      <fieldset disabled={busy}><legend>Evidencias seleccionadas: {selectedEvidence.length}</legend>
        <button type="button" disabled={busy} onClick={()=>setSelectedEvidence(workspace.evidence.filter(row=>row.status==='pending'&&active(row.enrollment_id)&&(!filter||row.status===filter)).map(row=>row.id!))}>Seleccionar pendientes visibles</button>
        <button type="button" disabled={busy} onClick={()=>setSelectedEvidence([])}>Limpiar selección</button>
        {workspace.evidence.filter(row=>row.status==='pending'&&active(row.enrollment_id)&&(!filter||row.status===filter)).map(row=><label key={row.id} className="td-weekday"><input type="checkbox" checked={selectedEvidence.includes(row.id!)} onChange={event=>setSelectedEvidence(current=>event.target.checked?[...current,row.id!]:current.filter(id=>id!==row.id))}/>{sessionLabel(row.session_id)} · {text(row,'description')}</label>)}
      </fieldset>
      <label>Decisión<select aria-label="Decisión masiva de evidencia" required disabled={busy} value={batchDecision} onChange={e=>setBatchDecision(e.target.value)}><option value="">Selecciona una decisión</option><option value="approved">Aprobar</option><option value="rejected">Rechazar</option></select></label>
      <label>Notas de revisión<textarea aria-label="Notas de revisión masiva" required maxLength={2000} disabled={busy} value={batchNotes} onChange={e=>setBatchNotes(e.target.value)}/></label>
      <button disabled={busy||!selectedEvidence.length||!batchDecision||!batchNotes.trim()}>Revisar {selectedEvidence.length} evidencia(s)</button>
      {!!batchResults.length&&<div role="status"><h4>Resultados individuales</h4><ul>{batchResults.map(row=><li key={row.id}>{sessionLabel(workspace.evidence.find(e=>e.id===row.id)?.session_id)}: {row.message}</li>)}</ul></div>}
    </form>}
    {!readonly&&<form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
      let prepared={};if(file){try{prepared=await attachment(file);}catch(e){setFileError(e instanceof Error?e.message:'No se pudo preparar el archivo.');return;}}
      await api.submitEvidence({session_id:sessionId,description,...(file?{...prepared,consent_confirmed:consent}:{})});
      setDescription('');setFile(null);setConsent(false);if(fileInput.current)fileInput.current.value='';await refresh();notify('Evidencia DEMO enviada a revisión.');
    });}}><h3>Enviar evidencia DEMO</h3>
      <label>Sesión de evidencia<select aria-label="Sesión de evidencia" required value={sessionId} disabled={busy} onChange={e=>setSessionId(e.target.value)}><option value="">Selecciona una sesión activa</option>{workspace.sessions.filter(row=>active(row.enrollment_id)).map(row=><option key={row.id} value={row.id}>{sessionLabel(row.id)}</option>)}</select></label>
      <label>Descripción de evidencia<textarea aria-label="Descripción de evidencia" required maxLength={2000} disabled={busy} value={description} onChange={e=>setDescription(e.target.value)}/></label>
      <label>Archivo DEMO opcional<input aria-label="Archivo DEMO opcional" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4" disabled={busy} onChange={e=>{
        const next=e.target.files?.[0]??null;setConsent(false);setFileError('');setFile(null);
        if(next&&(!next.size||next.size>MAX_BYTES||!['image/png','image/jpeg','image/webp','application/pdf','video/mp4'].includes(next.type))){setFileError('Elige un PNG/JPEG/WebP, PDF o MP4 de hasta 2 MiB.');e.target.value='';return;}setFile(next);
      }}/></label>
      <p>Usa archivos ficticios: PNG/JPEG/WebP, PDF estático o MP4 H.264, hasta 2 MiB. Las imágenes se convierten a PNG de hasta 768 píxeles por lado, conservando sus proporciones. El servidor valida el contenido. La aprobación de evidencia no completa por sí sola una práctica.</p>
      {fileError&&<p role="alert">{fileError}</p>}
      {file&&<label className="td-weekday"><input aria-label="Confirmo uso de archivo ficticio" type="checkbox" required checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>Confirmo que el archivo es ficticio y autorizado para esta prueba local.</label>}
      <button disabled={busy||!sessionId||!description.trim()||!!fileError||(!!file&&!consent)}>Enviar evidencia a revisión DEMO</button>
    </form>}
    <dialog ref={dialog} aria-labelledby="tl-evidence-title" onCancel={close} onClose={close}><h3 id="tl-evidence-title">Evidencia DEMO</h3>
      {data?.type==='image'&&<img alt="Evidencia de prueba" src={`data:image/png;base64,${data.image.data}`}/>}
      {data?.type==='video'&&<video ref={video} controls preload="none" src={preview?.videoUrl}/>}
      <button onClick={close}>Cerrar evidencia</button>
    </dialog>
    <TrainingLocalAssessment api={api} workspace={workspace} role={role} busy={busy} run={run} refresh={refresh} notify={notify}/>
  </>;
}
