import React, {useEffect, useRef, useState} from 'react';
import {LocalTrainingApi, LocalTrainingError, LocalActor, LocalWorkspace, PublicRow} from './localTrainingApi';
import './TrainingDemoWorkspace.css';
import HostedTrainingAdministration from './HostedTrainingAdministration';
import {HostedTrainingApi,HostedTrainingConfig} from './HostedTrainingApi';
import TrainingLocalAgenda from './TrainingLocalAgenda';
import TrainingLocalEvidence from './TrainingLocalEvidence';
import TrainingLocalLibrary from './TrainingLocalLibrary';
import TrainingLocalQuizInvitations from './TrainingLocalQuizInvitations';
import TrainingLocalClosing from './TrainingLocalClosing';
import TrainingLocalUpdates from './TrainingLocalUpdates';
import TrainingLocalProgramEditor from './TrainingLocalProgramEditor';
import {supabase} from '@/lib/supabase';
import type {Host} from '@/types';
const sections = ['Resumen','Programas','Agenda','Evidencias','Biblioteca','Actualizaciones','Quiz final','Cierre','Historial'];
const value = (row: PublicRow, key: string) => typeof row[key] === 'string' || typeof row[key] === 'number' ? String(row[key]) : '—';
const statusLabels:Record<string,string>={active:'Activo',paused:'Pausado',completed:'Completado',cancelled:'Cancelado',draft:'Borrador',published:'Publicado',archived:'Archivado'};
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
export default function TrainingSandboxWorkspace({hosted,defaultEmail='',sharedApi,onLogout}:{hosted?:HostedTrainingConfig;defaultEmail?:string;sharedApi?:HostedTrainingApi;onLogout?:()=>void}={}) {
  const api = useRef<LocalTrainingApi>(sharedApi||(hosted?new HostedTrainingApi(hosted):new LocalTrainingApi()));
  const mounted = useRef(true);
  const [data,setData] = useState<{actor:LocalActor; workspace:LocalWorkspace}|null>(null);
  const [section,setSection] = useState('Resumen'), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [username,setUsername] = useState(hosted?defaultEmail:''), [password,setPassword] = useState('');
  const [selectedHosts,setSelectedHosts] = useState<string[]>([]), [batchResults,setBatchResults] = useState<{hostId:string;ok:boolean;message:string}[]>([]), [program,setProgram] = useState(''), [timezone,setTimezone] = useState('America/Costa_Rica');
  const [notice,setNotice] = useState('');
  const [hostSearch,setHostSearch] = useState('');
  const [recruiterFilter,setRecruiterFilter] = useState('');
  const [officialRoster,setOfficialRoster]=useState<Pick<Host,'id'|'host_id'|'host_name'|'reclutador'>[]>([]),[officialError,setOfficialError]=useState(''),[officialLoading,setOfficialLoading]=useState(false),[trainingIdentities,setTrainingIdentities]=useState<Record<string,unknown>[]>([]);
  const [batchLimit,setBatchLimit] = useState(25);
  useEffect(() => {mounted.current=true; const client=api.current;
    if(sharedApi)void run(async()=>{const resumed=await sharedApi.resume();if(resumed&&mounted.current)setData(resumed);});
    return () => {mounted.current=false;if(!sharedApi)void client.logout();};}, [sharedApi]);
  async function run(operation:()=>Promise<void>) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try {await operation();} catch (reason) {
      if (mounted.current) {if (reason instanceof LocalTrainingError && [401,403].includes(reason.status)) {setData(null); void api.current.logout();}
        setError(reason instanceof LocalTrainingError ? reason.message : hosted?'No se pudo conectar al backend de capacitación. Intenta nuevamente.':'No se pudo conectar con la API local. Comprueba que esté disponible.');}
    } finally {if (mounted.current) setBusy(false);}
  }
  async function refresh() {const next=await api.current.load(); if (mounted.current) setData(next);}
  const workspace=data?.workspace, readonly=data?.actor.role==='readonly';
  const hostLabel=(id:unknown)=>{const trainee=workspace?.trainees.find(row=>row.host_id===id);return trainee?value(trainee,'label'):'Emisor DEMO';};
  const spec=columns[section], rows=workspace && spec ? workspace[spec.table] : [];
  const enrolledHostIds=new Set((workspace?.enrollments??[]).filter(row=>row.status==='active').map(row=>String(row.host_id)));
  const recruiterOf=(row:PublicRow)=>typeof row.reclutador==='string'?row.reclutador:typeof row.original_recruiter==='string'?row.original_recruiter:'';
  const recruiters=[...new Set([...((workspace?.trainees??[]).map(recruiterOf)),...officialRoster.map(h=>h.reclutador)].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const officialMapped=officialRoster.map(h=>{const matches=trainingIdentities.filter(x=>String(x.legacy_host_key||'')===h.id||(!!h.host_id&&String(x.mico_id||'')===String(h.host_id)));const linked=matches.length===1&&(!matches[0].legacy_host_key||String(matches[0].legacy_host_key)===h.id)&&(!matches[0].mico_id||String(matches[0].mico_id)===String(h.host_id))?matches[0]:null;const trainee=workspace?.trainees.find(row=>String(row.host_id)===String(linked?.id));return {official:h,trainee,linked,conflict:matches.length>1||(matches.length===1&&!linked)};});
  const visibleTrainees=(workspace?.trainees??[]).filter(row=>(!recruiterFilter||recruiterOf(row)===recruiterFilter)&&[value(row,'label'),value(row,'mico_id'),value(row,'host_id')].some(part=>part.toLocaleLowerCase().includes(hostSearch.trim().toLocaleLowerCase())));
  return <section className="training-demo td-local" aria-label="Training API local">
    <div className="td-notice"><strong>{hosted?'PREVIEW · Capacitación con datos persistentes':'PRUEBA LOCAL · API de entrenamiento'}</strong><p>{hosted?'Este módulo usa el Supabase separado de capacitación y una sesión propia verificada. Los registros existentes de la app continúan en su backend actual.':'Solo cuentas y datos ficticios. Los cambios DEMO se guardan en este entorno local. La base actual de la app no se utiliza.'}</p></div>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data ? <form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
      const secret=password; setPassword(''); const next=await api.current.login(username,secret);
      if (mounted.current) {setData(next);setSection('Resumen');setSelectedHosts([]);setProgram('');}
    });}}><h2>{hosted?'Entrar a capacitación':'Entrar con una cuenta de prueba'}</h2><p>{hosted?'Usa una cuenta de capacitación con correo confirmado. El acceso inicial de administración corresponde al correo de Dave; otros accesos requieren autorización.':'Usa las credenciales sintéticas preparadas por el servidor local.'}</p>
      <label>{hosted?'Correo de capacitación':'Usuario DEMO'}<input type={hosted?'email':'text'} required autoComplete={hosted?'username':'off'} value={username} onChange={e=>setUsername(e.target.value)} disabled={busy}/></label>
      <label>{hosted?'Contraseña de capacitación':'Contraseña DEMO'}<input required type="password" autoComplete={hosted?'current-password':'off'} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
      <button disabled={busy}>{busy?'Conectando…':hosted?'Entrar a capacitación':'Entrar a prueba local'}</button>{hosted&&<><p>La cuenta de la app actual no se copia automáticamente. Si ya creaste y confirmaste tu cuenta, entra con su contraseña. Después, el inicio principal del preview abrirá ambos accesos cuando las contraseñas coincidan.</p><button type="button" disabled={busy||!username||password.length<12} onClick={()=>void run(async()=>{const secret=password;setPassword('');await (api.current as HostedTrainingApi).register(username,secret);setNotice('Solicitud enviada. Revisa el correo de confirmación y después entra a capacitación.');})}>Crear cuenta de capacitación</button><p>Para crearla usa una contraseña de al menos 12 caracteres.</p></>}</form> : <>
      <div className="td-actions"><p>Permiso verificado por el servidor: <strong>{data.actor.role}</strong></p>
        <button disabled={busy} onClick={()=>void run(refresh)}>Actualizar datos</button>
        <button disabled={busy} onClick={()=>{setData(null);setPassword('');void run(async()=>{await api.current.logout();if(sharedApi)onLogout?.();});}}>{hosted?'Cerrar sesión':'Salir de prueba'}</button></div>
      <nav className="td-tabs" aria-label="Secciones de prueba">{sections.map(name=><button key={name} className={section===name?'td-active':undefined} aria-current={section===name?'page':undefined} disabled={busy} onClick={()=>setSection(name)}>{name}</button>)}</nav>
      <h2>{section}</h2>
      {section==='Resumen' && workspace && <>
        <div className="td-stats"><article className="td-panel">Emisores asignados: <strong>{workspace.trainees.length}</strong></article><article className="td-panel">Inscripciones: <strong>{workspace.enrollments.length}</strong></article><article className="td-panel">Sesiones: <strong>{workspace.sessions.length}</strong></article></div>
        <h3>Inscripciones del entorno local</h3>{workspace.enrollments.length===0?<p>Aún no hay inscripciones.</p>:<ul>{workspace.enrollments.map(row=><li key={row.id}>{hostLabel(row.host_id)} · {statusLabels[value(row,'status')]??value(row,'status')} · {value(row,'timezone')}</li>)}</ul>}
      </>}
      {spec && section!=='Agenda' && section!=='Evidencias' && section!=='Biblioteca' && section!=='Quiz final' && section!=='Cierre' && section!=='Actualizaciones' && <div className="td-table-scroll" role="region" aria-label={`${section}: tabla de registros`} tabIndex={0}><table><thead><tr>{spec.fields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id??index}>{spec.fields.map(([key])=><td key={key}>{key==='status'?(statusLabels[value(row,key)]??value(row,key)):value(row,key)}</td>)}</tr>)}</tbody></table>{rows.length===0&&<p>Sin registros de prueba en esta sección.</p>}</div>}
      {section==='Agenda' && workspace && <TrainingLocalAgenda api={api.current} workspace={workspace} readonly={readonly} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Evidencias' && workspace && <TrainingLocalEvidence api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Biblioteca' && workspace && <TrainingLocalLibrary api={api.current} workspace={workspace} role={data.actor.role} refresh={refresh} notify={setNotice} busy={busy} run={run}/> }
      {section==='Quiz final' && workspace && <TrainingLocalQuizInvitations api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Cierre' && workspace && <TrainingLocalClosing api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Actualizaciones' && workspace && <TrainingLocalUpdates api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {hosted&&section==='Programas'&&workspace&&(data.actor.role==='superadmin'||data.actor.role==='subadmin')&&<HostedTrainingAdministration api={api.current as HostedTrainingApi} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/>}
      {section==='Programas' && workspace && (data.actor.role==='superadmin'||data.actor.role==='subadmin') && <TrainingLocalProgramEditor api={api.current} workspace={workspace} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Programas' && workspace && !readonly && <form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
        const targets=[...new Set(selectedHosts)].filter(id=>workspace.trainees.some(row=>value(row,'host_id')===id)).slice(0,batchLimit);
        const outcomes:{hostId:string;ok:boolean;message:string}[]=[];
        const remaining:string[]=[...selectedHosts.filter(id=>!targets.includes(id))];
        for(const hostId of targets){
          if(workspace.enrollments.some(row=>row.host_id===hostId&&row.program_version_id===program&&row.status==='active')){outcomes.push({hostId,ok:false,message:'Ya tiene una inscripción activa en este programa'});continue;}
          try{await api.current.enroll(hostId,program,timezone);outcomes.push({hostId,ok:true,message:'Inscrito'});}
          catch(reason){if(reason instanceof LocalTrainingError&&[401,403].includes(reason.status))throw reason;outcomes.push({hostId,ok:false,message:reason instanceof LocalTrainingError?reason.message:'No se pudo inscribir'});remaining.push(hostId);}
        }
        setBatchResults(outcomes);setSelectedHosts(remaining);await refresh();
        if(mounted.current)setNotice(`Lote procesado: ${outcomes.filter(row=>row.ok).length} correctas, ${outcomes.filter(row=>!row.ok).length} fallidas; ${remaining.length} emisores conservados en la selección.`);
      });}}><h3>Inscribir emisores por lotes</h3><label>Máximo por lote<select aria-label="Tamaño del lote" value={batchLimit} onChange={e=>setBatchLimit(Number(e.target.value))} disabled={busy}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><p>Para evitar bloqueos, se procesan hasta {batchLimit} emisores por operación. Los restantes continúan seleccionados para el siguiente lote.</p>
        {hosted&&<><p>Consulta el padrón oficial y sus vinculaciones antes de seleccionar emisores. Solo se pueden inscribir identidades que el servidor ya reconoce y que aparecen en el catálogo autorizado de capacitación.</p><button type="button" disabled={busy||officialLoading} onClick={()=>{setOfficialLoading(true);setOfficialError('');void (async()=>{try{const [roster,identities]=await Promise.all([supabase.from('hosts').select('id,host_id,host_name,reclutador').order('host_name',{ascending:true}).range(0,1999),(api.current as HostedTrainingApi).identities()]);if(roster.error)throw roster.error;setOfficialRoster(roster.data||[]);setTrainingIdentities(identities.hosts);}catch{setOfficialError('No se pudo cargar el padrón o las vinculaciones autorizadas.');}finally{setOfficialLoading(false);}})();}}>{officialLoading?'Consultando...':'Cargar emisores oficiales para inscripción'}</button>{officialError&&<p role="alert">{officialError}</p>}{officialRoster.length>0&&<p>{officialRoster.length} emisores oficiales consultados · {officialMapped.filter(x=>x.trainee).length} disponibles para inscribir · {officialMapped.filter(x=>!x.trainee).length} sin identidad habilitada en este catálogo.</p>}</>}
        {!hosted&&<p role="note">Origen: catálogo local de capacitación.</p>}
        <label>Buscar emisor por nombre o ID de MICO<input aria-label="Buscar emisor registrado" value={hostSearch} onChange={event=>setHostSearch(event.target.value)} placeholder="Nombre o ID" disabled={busy}/></label>
        <label>Filtrar por reclutador<select aria-label="Filtrar por reclutador" value={recruiterFilter} onChange={event=>setRecruiterFilter(event.target.value)} disabled={busy||!recruiters.length}><option value="">Todos los reclutadores disponibles</option>{recruiters.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        {!recruiters.length&&<p>El catálogo de capacitación todavía no incluye el reclutador original. El filtro se activará cuando la integración entregue ese dato verificado.</p>}
        <p>Selecciona uno o varios emisores. Cada inscripción se guarda por separado y conserva su historial individual. Los errores no cancelan las inscripciones correctas.</p>
        <fieldset disabled={busy}><legend>Emisores ({selectedHosts.length} seleccionados)</legend>
          <button type="button" disabled={busy} onClick={()=>setSelectedHosts(current=>[...new Set([...current,...visibleTrainees.map(row=>value(row,'host_id')).filter(id=>id!=='—')])])}>Seleccionar todos los visibles</button>
          <button type="button" disabled={busy} onClick={()=>setSelectedHosts(current=>current.filter(id=>!visibleTrainees.some(row=>value(row,'host_id')===id)))}>Quitar visibles</button><button type="button" disabled={busy} onClick={()=>setSelectedHosts([])}>Limpiar toda la selección</button>
          {(hosted&&officialRoster.length?visibleTrainees.filter(row=>officialMapped.some(x=>x.trainee?.host_id===row.host_id&&(!recruiterFilter||x.official.reclutador===recruiterFilter))):visibleTrainees).map(row=>{const id=value(row,'host_id');return <label key={id} className="td-weekday"><input type="checkbox" checked={selectedHosts.includes(id)} onChange={event=>setSelectedHosts(current=>event.target.checked?[...current,id]:current.filter(item=>item!==id))}/ >{value(row,'label')} {enrolledHostIds.has(id)?'· Ya tiene capacitación activa':''}</label>;})}
        </fieldset>
        <label>Programa publicado<select aria-label="Programa publicado" required value={program} onChange={e=>setProgram(e.target.value)} disabled={busy}><option value="">Selecciona un programa</option>{workspace.program_versions.filter(row=>row.status==='published').map(row=><option key={row.id} value={row.id}>{value(row,'title')} · v{value(row,'version')}</option>)}</select></label>
        <label>Zona horaria<select aria-label="Zona horaria" value={timezone} onChange={e=>setTimezone(e.target.value)} disabled={busy}>{['America/Costa_Rica','America/Bogota','America/Mexico_City','UTC'].map(zone=><option key={zone}>{zone}</option>)}</select></label>
        <button disabled={busy||!selectedHosts.length||!program}>Inscribir {selectedHosts.length} emisor(es)</button>
        {!!batchResults.length&&<div role="status"><h4>Resultado por emisor</h4><ul>{batchResults.map((row,index)=><li key={row.hostId+'-'+index}>{hostLabel(row.hostId)}: {row.message}</li>)}</ul></div>}
      </form>}
      {section!=='Resumen' && section!=='Historial' && section!=='Agenda' && section!=='Evidencias' && section!=='Biblioteca' && section!=='Quiz final' && section!=='Cierre' && section!=='Actualizaciones' && <p>Cada inscripción conserva su versión del programa. Publicar una versión nueva permite revisarla después en Actualizaciones.</p>}
    </>}
  </section>;
}
