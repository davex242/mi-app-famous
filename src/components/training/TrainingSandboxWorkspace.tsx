import React, {useEffect, useRef, useState} from 'react';
import {LocalTrainingApi, LocalTrainingError, LocalActor, LocalWorkspace, PublicRow} from './localTrainingApi';
import './TrainingDemoWorkspace.css';
const sections = ['Resumen','Programas','Agenda','Evidencias','Biblioteca','Actualizaciones','Quiz final','Cierre','Historial'];
const value = (row: PublicRow, key: string) => typeof row[key] === 'string' || typeof row[key] === 'number' ? String(row[key]) : '—';
const columns: Record<string, {table: string; fields: [string,string][]}> = {
  Programas:{table:'program_versions',fields:[['title','Programa'],['version','Versión'],['status','Estado']]},
  Agenda:{table:'sessions',fields:[['scheduled_at','Fecha'],['duration_minutes','Minutos'],['status','Estado']]},
  Evidencias:{table:'evidence',fields:[['description','Descripción'],['status','Estado']]},
  Biblioteca:{table:'materials',fields:[['title','Material'],['kind','Tipo'],['status','Estado']]},
  Actualizaciones:{table:'update_history',fields:[['accepted_at','Fecha'],['enrollment_id','Inscripción']]},
  'Quiz final':{table:'exams',fields:[['exam_key','Examen'],['version','Versión'],['question_count','Preguntas'],['pass_percent','Umbral']]},
  Cierre:{table:'closing_records',fields:[['enrollment_id','Inscripción'],['created_at','Fecha']]},
  Historial:{table:'events',fields:[['event_type','Evento'],['created_at','Fecha']]},
};
export default function TrainingSandboxWorkspace() {
  const api = useRef(new LocalTrainingApi());
  const mounted = useRef(true);
  const [data,setData] = useState<{actor:LocalActor; workspace:LocalWorkspace}|null>(null);
  const [section,setSection] = useState('Resumen'), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [username,setUsername] = useState(''), [password,setPassword] = useState('');
  const [host,setHost] = useState(''), [program,setProgram] = useState(''), [timezone,setTimezone] = useState('America/Costa_Rica');
  const [notice,setNotice] = useState('');
  useEffect(() => {mounted.current=true; const client=api.current; return () => {mounted.current=false; void client.logout();};}, []);
  async function run(operation:()=>Promise<void>) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {await operation();} catch (reason) {
      if (mounted.current) {if (reason instanceof LocalTrainingError && [401,403].includes(reason.status)) {setData(null); void api.current.logout();}
        setError(reason instanceof LocalTrainingError ? reason.message : 'No se pudo conectar con la API local. Comprueba que esté disponible.');}
    } finally {if (mounted.current) setBusy(false);}
  }
  async function refresh() {const next=await api.current.load(); if (mounted.current) setData(next);}
  const workspace=data?.workspace, readonly=data?.actor.role==='readonly';
  const spec=columns[section], rows=workspace && spec ? workspace[spec.table] : [];
  return <section className="training-demo td-local" aria-label="Training API local">
    <div className="td-notice"><strong>PRUEBA LOCAL · API de entrenamiento</strong><p>Solo cuentas y datos ficticios. La inscripción se guarda en este entorno local. La base actual de la app no se utiliza.</p></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data ? <form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
      const secret=password; setPassword(''); const next=await api.current.login(username,secret);
      if (mounted.current) {setData(next);setSection('Resumen');setHost('');setProgram('');}
    });}}><h2>Entrar con una cuenta de prueba</h2><p>Usa las credenciales sintéticas preparadas por el servidor local.</p>
      <label>Usuario DEMO<input required autoComplete="off" value={username} onChange={e=>setUsername(e.target.value)} disabled={busy}/></label>
      <label>Contraseña DEMO<input required type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
      <button disabled={busy}>{busy?'Conectando…':'Entrar a prueba local'}</button></form> : <>
      <div className="td-actions"><p>Permiso verificado por el servidor: <strong>{data.actor.role}</strong></p>
        <button disabled={busy} onClick={()=>void run(refresh)}>Actualizar datos</button>
        <button disabled={busy} onClick={()=>{setData(null);setPassword('');void run(()=>api.current.logout());}}>Salir de prueba</button></div>
      <nav className="td-tabs" aria-label="Secciones de prueba">{sections.map(name=><button key={name} aria-current={section===name?'page':undefined} disabled={busy} onClick={()=>setSection(name)}>{name}</button>)}</nav>
      <h2>{section}</h2>
      {section==='Resumen' && workspace && <>
        <div className="td-stats"><article className="td-panel">Emisores asignados: <strong>{workspace.trainees.length}</strong></article><article className="td-panel">Inscripciones: <strong>{workspace.enrollments.length}</strong></article><article className="td-panel">Sesiones: <strong>{workspace.sessions.length}</strong></article></div>
        <h3>Inscripciones del entorno local</h3>{workspace.enrollments.length===0?<p>Aún no hay inscripciones.</p>:<ul>{workspace.enrollments.map(row=><li key={row.id}>{value(row,'host_id')} · {value(row,'status')} · {value(row,'timezone')}</li>)}</ul>}
      </>}
      {spec && <div className="td-table-scroll"><table><thead><tr>{spec.fields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id??index}>{spec.fields.map(([key])=><td key={key}>{value(row,key)}</td>)}</tr>)}</tbody></table>{rows.length===0&&<p>Sin registros de prueba en esta sección.</p>}</div>}
      {section==='Programas' && workspace && !readonly && <form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
        await api.current.enroll(host,program,timezone); await refresh();if(mounted.current)setNotice('Inscripción DEMO guardada.');
      });}}><h3>Inscribir emisor DEMO</h3>
        <label>Emisor DEMO<select aria-label="Emisor DEMO" required value={host} onChange={e=>setHost(e.target.value)} disabled={busy}><option value="">Selecciona un emisor</option>{workspace.trainees.map(row=><option key={value(row,'host_id')} value={value(row,'host_id')}>{value(row,'label')}</option>)}</select></label>
        <label>Programa publicado<select aria-label="Programa publicado" required value={program} onChange={e=>setProgram(e.target.value)} disabled={busy}><option value="">Selecciona un programa</option>{workspace.program_versions.filter(row=>row.status==='published').map(row=><option key={row.id} value={row.id}>{value(row,'title')} · v{value(row,'version')}</option>)}</select></label>
        <label>Zona horaria<select aria-label="Zona horaria" value={timezone} onChange={e=>setTimezone(e.target.value)} disabled={busy}>{['America/Costa_Rica','America/Bogota','America/Mexico_City','UTC'].map(zone=><option key={zone}>{zone}</option>)}</select></label>
        <button disabled={busy || !host || !program}>Guardar inscripción DEMO</button>
      </form>}
      {section!=='Resumen' && section!=='Historial' && <p>Esta etapa permite consultar datos de la API e inscribir emisores. Las demás acciones se conectarán en los siguientes pasos.</p>}
    </>}
  </section>;
}
