import React,{useState} from 'react';
import {LocalActor,LocalTrainingApi,LocalWorkspace,ProgramUpdatePreview,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;role:LocalActor['role'];busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalUpdates({api,workspace,role,busy,run,refresh,notify}:Props){
  const [enrollmentId,setEnrollmentId]=useState(''),[versionId,setVersionId]=useState('');
  const [preview,setPreview]=useState<{data:ProgramUpdatePreview;workspace:LocalWorkspace;enrollmentId:string;versionId:string}|null>(null);
  const [consent,setConsent]=useState<typeof preview>(null);
  const enrollment=workspace.enrollments.find(row=>row.id===enrollmentId);
  const source=workspace.program_versions.find(row=>row.id===enrollment?.program_version_id);
  const targets=workspace.program_versions.filter(row=>row.program_key===source?.program_key&&row.status==='published'&&row.is_optional_update===true&&Number(row.version)>Number(source?.version));
  const current=preview?.workspace===workspace&&preview.enrollmentId===enrollmentId&&preview.versionId===versionId?preview:null;
  const readonly=role==='readonly',canUpdate=enrollment&&['active','paused'].includes(text(enrollment,'status'));
  const label=(id:unknown)=>{const e=workspace.enrollments.find(row=>row.id===id),host=workspace.trainees.find(row=>row.host_id===e?.host_id);return host?text(host,'label'):'Emisor DEMO';};
  function invalidate(){setPreview(null);setConsent(null);}
  return <>
    <p>Actualizar es opcional. La inscripción conserva su versión actual hasta que confirmes el cambio. Solo las prácticas equivalentes conservan crédito; las anteriores siguen en el historial.</p>
    {!readonly&&<>
      <label>Inscripción para actualizar<select aria-label="Inscripción para actualizar" disabled={busy} value={enrollmentId} onChange={e=>{setEnrollmentId(e.target.value);setVersionId('');invalidate();}}><option value="">Selecciona una inscripción activa o pausada</option>{workspace.enrollments.filter(row=>['active','paused'].includes(text(row,'status'))).map(row=><option key={row.id} value={row.id}>{label(row.id)} · {text(row,'status')}</option>)}</select></label>
      {source&&<p>Versión actual: {text(source,'title')} · v{String(source.version)}</p>}
      <label>Nueva versión de programa<select aria-label="Nueva versión de programa" disabled={busy||!canUpdate} value={versionId} onChange={e=>{setVersionId(e.target.value);invalidate();}}><option value="">Selecciona una versión posterior publicada</option>{targets.map(row=><option key={row.id} value={row.id}>{text(row,'title')} · v{String(row.version)}</option>)}</select></label>
      {enrollment&&!targets.length&&<p>Sin versiones posteriores publicadas para esta inscripción.</p>}
      <button disabled={busy||!canUpdate||!targets.some(row=>row.id===versionId)} onClick={()=>{invalidate();void run(async()=>{const data=await api.previewProgramUpdate(enrollmentId,versionId);setPreview({data,workspace,enrollmentId,versionId});});}}>Revisar actualización DEMO</button>
      {current&&canUpdate&&<article className="td-panel" aria-label="Propuesta de actualización"><h3>Versión {current.data.from_version} → {current.data.to_version}</h3><p>{current.data.changelog}</p>
        <ul><li>Avance actual: {current.data.previous_progress.completed_items} / {current.data.previous_progress.total_items} · {current.data.previous_progress.percent} %</li><li>Prácticas validadas que conservan crédito: {current.data.preserved_completed_items}</li><li>Prácticas con sesiones que continúan: {current.data.preserved_session_items}</li><li>Nuevas prácticas o requisitos: {current.data.new_required_items}</li><li>Prácticas que quedan solo en el historial: {current.data.historical_only_items}</li><li>Avance tras actualizar: {current.data.preserved_completed_items} / {current.data.total_items} · {current.data.updated_percent} %</li></ul>
        <p>Un quiz emitido para la versión anterior no acredita el cierre de la nueva. Revísalo antes de actualizar.</p>
        <label className="td-weekday"><input aria-label="Confirmo actualización de programa" type="checkbox" checked={consent===current} disabled={busy} onChange={e=>setConsent(e.target.checked?current:null)}/>Confirmo aplicar esta actualización DEMO con el avance mostrado.</label>
        <button disabled={busy||consent!==current} onClick={()=>void run(async()=>{const proposal=current;invalidate();await api.acceptProgramUpdate(enrollmentId,versionId,proposal.data.from_version_id,proposal.data.preview_hash);await refresh();notify('Actualización DEMO aplicada. El historial y las prácticas equivalentes se conservaron.');})}>Aplicar actualización DEMO</button>
      </article>}
    </>}
    <h3>Actualizaciones aceptadas</h3>
    <div className="td-table-scroll"><table><thead><tr><th>Emisor</th><th>Versiones</th><th>Fecha UTC</th><th>Avance anterior</th></tr></thead><tbody>{workspace.update_history.map(row=>{const from=workspace.program_versions.find(v=>v.id===row.from_version_id),to=workspace.program_versions.find(v=>v.id===row.to_version_id);return <tr key={row.id}><td>{label(row.enrollment_id)}</td><td>v{String(from?.version??'—')} → v{String(to?.version??'—')}</td><td>{text(row,'accepted_at')}</td><td>{String(row.previous_progress_percent)} %</td></tr>;})}</tbody></table></div>
    {!workspace.update_history.length&&<p>Aún no se han aceptado actualizaciones.</p>}
  </>;
}
