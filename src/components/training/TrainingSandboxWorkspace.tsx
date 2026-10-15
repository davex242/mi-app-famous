import React, {useEffect, useRef, useState} from 'react';
import {LocalTrainingApi, LocalTrainingError, LocalActor, LocalWorkspace, PublicRow} from './localTrainingApi';
import './TrainingDemoWorkspace.css';
import HostedTrainingAdministration from './HostedTrainingAdministration';
import {HostedTrainingApi,HostedTrainingConfig} from './HostedTrainingApi';
import TrainingLocalAgenda from './TrainingLocalAgenda';
import TrainingPhaseFourTracking from './TrainingPhaseFourTracking';
import TrainingLocalEvidence from './TrainingLocalEvidence';
import TrainingLocalLibrary from './TrainingLocalLibrary';
import TrainingLocalQuizInvitations from './TrainingLocalQuizInvitations';
import TrainingLocalClosing from './TrainingLocalClosing';
import TrainingLocalUpdates from './TrainingLocalUpdates';
import TrainingLocalProgramEditor from './TrainingLocalProgramEditor';
import {supabase} from '@/lib/supabase';
import type {Host} from '@/types';
const sections = ['Resumen','Programas','Agenda','Evidencias','Biblioteca','Actualizaciones','Quiz final','Cierre','Seguimiento','Historial'];
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
  const [section,setSection] = useState(()=>{try{const saved=sessionStorage.getItem('famous_training_section');return saved&&sections.includes(saved)?saved:'Resumen';}catch{return 'Resumen';}}), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [username,setUsername] = useState(hosted?defaultEmail:''), [password,setPassword] = useState('');
  const [selectedHosts,setSelectedHosts] = useState<string[]>([]), [batchResults,setBatchResults] = useState<{hostId:string;ok:boolean;message:string}[]>([]), [program,setProgram] = useState(''), [timezone,setTimezone] = useState('America/Costa_Rica');
  const [notice,setNotice] = useState('');
  const [hostSearch,setHostSearch] = useState('');
  const [recruiterFilter,setRecruiterFilter] = useState('');
  const [officialRoster,setOfficialRoster]=useState<Pick<Host,'id'|'host_id'|'host_name'|'reclutador'>[]>([]),[officialError,setOfficialError]=useState(''),[officialLoading,setOfficialLoading]=useState(false),[trainingIdentities,setTrainingIdentities]=useState<Record<string,unknown>[]>([]);
  const [batchLimit,setBatchLimit] = useState(25);
  const [syncResults,setSyncResults]=useState<{id:string;name:string;status:string;detail:string}[]>([]),[syncRunning,setSyncRunning]=useState(false),[syncLimit,setSyncLimit]=useState(25);
  const [reassignEnrollmentId,setReassignEnrollmentId]=useState(''),[reassignTrainerId,setReassignTrainerId]=useState('');
  const [enrollmentOwner,setEnrollmentOwner]=useState(''),[trainingUsers,setTrainingUsers]=useState<Record<string,unknown>[]>([]),[officialCount,setOfficialCount]=useState<number|null>(null),[enrollConfirmed,setEnrollConfirmed]=useState(false);
  useEffect(()=>{if(hosted)sessionStorage.setItem('famous_training_section',section);},[section,hosted]);
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
  async function synchronizeOfficialHosts(roster:Pick<Host,'id'|'host_id'|'host_name'|'reclutador'>[],initial:Record<string,unknown>[],owner:string,limit:number){
    const remote=api.current as HostedTrainingApi;
    const counts=new Map<string,number>();for(const h of roster){const key=String(h.host_id||'');counts.set(key,(counts.get(key)||0)+1);}
    const results:{id:string;name:string;status:string;detail:string}[]=[];
    let known=initial;
    const pending=roster.filter(h=>!known.some(x=>String(x.legacy_host_key||'')===h.id||String(x.mico_id||'')===String(h.host_id)));
    for(const host of pending.slice(0,limit)){
      const key=String(host.host_id||'');
      if(!/^[0-9]{1,32}$/.test(key)||counts.get(key)!==1||!host.host_name?.trim()){results.push({id:host.id,name:host.host_name,status:'revisión',detail:'Nombre o ID MICO inválido/duplicado'});continue;}
      try{
        const fresh=await remote.identities();known=fresh.hosts;
        if(known.some(x=>String(x.legacy_host_key||'')===host.id||String(x.mico_id||'')===key)){results.push({id:host.id,name:host.host_name,status:'omitido',detail:'Ya existe identidad; no se duplica'});continue;}
        await remote.saveIdentity('host',{display_name:host.host_name,mico_id:key,legacy_host_key:host.id,recruiter_id:owner,confirmed:true,expected_hash:null});
        results.push({id:host.id,name:host.host_name,status:'vinculado',detail:'Identidad creada mediante API'});
      }catch(error){results.push({id:host.id,name:host.host_name,status:'error',detail:error instanceof Error?error.message:'Rechazado por servidor'});if(error instanceof LocalTrainingError&&[401,403].includes(error.status))break;}
    }
    const updated=await remote.identities();setTrainingIdentities(updated.hosts);setTrainingUsers(updated.users);setSyncResults(results);await refresh();
  }
  const visibleOfficial=officialMapped.filter(x=>(!recruiterFilter||x.official.reclutador===recruiterFilter)&&[x.official.host_name,x.official.host_id,x.official.reclutador].some(part=>String(part||'').toLowerCase().includes(hostSearch.trim().toLowerCase())));
  const visibleTrainees=(workspace?.trainees??[]).filter(row=>{const official=officialMapped.find(x=>x.trainee?.host_id===row.host_id);return (!hosted||!officialRoster.length||!!official)&&(!recruiterFilter||(hosted&&officialRoster.length?official?.official.reclutador===recruiterFilter:recruiterOf(row)===recruiterFilter))&&[value(row,'label'),value(row,'mico_id'),value(row,'host_id'),official?.official.host_name||'',official?.official.host_id||''].some(part=>part.toLocaleLowerCase().includes(hostSearch.trim().toLocaleLowerCase()));});
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
        {hosted&&data.actor.role==='superadmin'&&<section className="td-panel"><h3>Reasignar entrenador sin perder el avance</h3><p>La reasignación conserva el identificador de inscripción y todas las evidencias, asistencias y evaluaciones. No cambia el reclutador oficial de DatabasePad.</p><label>Inscripción<select value={reassignEnrollmentId} onChange={e=>setReassignEnrollmentId(e.target.value)}><option value="">Selecciona inscripción</option>{workspace.enrollments.map(e=><option key={e.id} value={e.id}>{hostLabel(e.host_id)} · {workspace.program_versions.find(p=>p.id===e.program_version_id)?.title||e.program_version_id}</option>)}</select></label><label>Nuevo entrenador<select value={reassignTrainerId} onChange={e=>setReassignTrainerId(e.target.value)}><option value="">Selecciona entrenador</option>{trainingUsers.filter(u=>u.is_active&&u.app_user_id).map(u=><option key={String(u.app_user_id)} value={String(u.app_user_id)}>{String(u.display_name||u.email)}</option>)}</select></label><button type="button" disabled={busy} onClick={()=>{const enrollment=reassignEnrollmentId;const trainer=reassignTrainerId;if(!enrollment||!trainer){setNotice('Selecciona inscripción y entrenador');return;}void run(async()=>{await (api.current as HostedTrainingApi).reassignEnrollment(enrollment,trainer);await refresh();setNotice('Responsable actualizado. El historial de la inscripción se conserva.');setReassignEnrollmentId('');setReassignTrainerId('');});}}>Reasignar entrenador</button></section>}
        <h3>Inscripciones del entorno local</h3>{workspace.enrollments.length===0?<p>Aún no hay inscripciones.</p>:<ul>{workspace.enrollments.map(row=><li key={row.id}>{hostLabel(row.host_id)} · {statusLabels[value(row,'status')]??value(row,'status')} · {value(row,'timezone')}</li>)}</ul>}
      </>}
      {spec && section!=='Agenda' && section!=='Evidencias' && section!=='Biblioteca' && section!=='Quiz final' && section!=='Cierre' && section!=='Actualizaciones' && section!=='Seguimiento' && <div className="td-table-scroll" role="region" aria-label={`${section}: tabla de registros`} tabIndex={0}><table><thead><tr>{spec.fields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.id??index}>{spec.fields.map(([key])=><td key={key}>{key==='status'?(statusLabels[value(row,key)]??value(row,key)):value(row,key)}</td>)}</tr>)}</tbody></table>{rows.length===0&&<p>Sin registros de prueba en esta sección.</p>}</div>}
      {section==='Seguimiento' && workspace && <TrainingPhaseFourTracking workspace={workspace}/>}
      {section==='Agenda' && workspace && <TrainingLocalAgenda api={api.current} workspace={workspace} readonly={readonly} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Evidencias' && workspace && <TrainingLocalEvidence api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Biblioteca' && workspace && <TrainingLocalLibrary api={api.current} workspace={workspace} role={data.actor.role} refresh={refresh} notify={setNotice} busy={busy} run={run}/> }
      {section==='Quiz final' && workspace && <TrainingLocalQuizInvitations api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Cierre' && workspace && <TrainingLocalClosing api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Actualizaciones' && workspace && <TrainingLocalUpdates api={api.current} workspace={workspace} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {hosted&&section==='Programas'&&workspace&&(data.actor.role==='superadmin'||data.actor.role==='subadmin')&&<HostedTrainingAdministration api={api.current as HostedTrainingApi} role={data.actor.role} busy={busy} run={run} refresh={refresh} notify={setNotice}/>}
      {section==='Programas' && workspace && (data.actor.role==='superadmin'||data.actor.role==='subadmin') && <TrainingLocalProgramEditor api={api.current} workspace={workspace} busy={busy} run={run} refresh={refresh} notify={setNotice}/> }
      {section==='Programas' && workspace && !readonly && <form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
        if(hosted&&!enrollConfirmed)throw new Error('Confirma la selección antes de inscribir');
        const targets=[...new Set(selectedHosts)].slice(0,batchLimit);
        const outcomes:{hostId:string;ok:boolean;message:string}[]=[];
        const remaining:string[]=[...selectedHosts.filter(id=>!targets.includes(id))];
        for(const selectedId of targets){
          let hostId=selectedId;
          try{
            if(hosted){
              const official=officialMapped.find(x=>x.official.id===selectedId);
              if(!official)throw new Error('Emisor no encontrado en el padrón oficial');
              if(official.conflict)throw new Error('Conflicto de identidad: requiere revisión');
              if(!/^[0-9]{1,32}$/.test(String(official.official.host_id||'')))throw new Error('ID MICO inválido');
              const sameMico=officialRoster.filter(h=>String(h.host_id)===String(official.official.host_id));
              if(sameMico.length!==1)throw new Error('ID MICO duplicado en el padrón');
              const remote=api.current as HostedTrainingApi;
              const latest=await remote.identities();
              const matches=latest.hosts.filter(h=>String(h.legacy_host_key||'')===selectedId||String(h.mico_id||'')===String(official.official.host_id));
              if(matches.length>1)throw new Error('Varias identidades coincidentes; revisar');
              if(matches.length===1){
                const match=matches[0];
                if((match.legacy_host_key&&String(match.legacy_host_key)!==selectedId)||(match.mico_id&&String(match.mico_id)!==String(official.official.host_id)))throw new Error('Identidad vinculada a otro emisor');
                hostId=String(match.id);
              }else{
                if(data.actor.role!=='superadmin')throw new Error('Un administrador debe vincular esta identidad primero');
                if(!enrollmentOwner)throw new Error('Selecciona el responsable de capacitación');
                await remote.saveIdentity('host',{display_name:official.official.host_name,mico_id:String(official.official.host_id),legacy_host_key:selectedId,recruiter_id:enrollmentOwner,confirmed:true,expected_hash:null});
                const verified=await remote.identities();
                const match=verified.hosts.filter(h=>String(h.legacy_host_key||'')===selectedId&&String(h.mico_id||'')===String(official.official.host_id));
                if(match.length!==1)throw new Error('No se pudo verificar la identidad recién vinculada');
                hostId=String(match[0].id);
              }
            }else if(!workspace.trainees.some(row=>value(row,'host_id')===hostId))throw new Error('Emisor no disponible');
            if(workspace.enrollments.some(row=>row.host_id===hostId&&row.program_version_id===program&&['active','paused','completed'].includes(String(row.status)))){outcomes.push({hostId:selectedId,ok:false,message:'Ya tiene historial en este programa; continúa o revisa la inscripción existente. No se reinició su avance.'});continue;}
            await api.current.enroll(hostId,program,timezone);
            outcomes.push({hostId:selectedId,ok:true,message:'Vinculado e inscrito'});
          }catch(reason){
            if(reason instanceof LocalTrainingError&&[401,403].includes(reason.status)){outcomes.push({hostId:selectedId,ok:false,message:reason.message});remaining.push(selectedId);break;}
            outcomes.push({hostId:selectedId,ok:false,message:reason instanceof Error?reason.message:'No se pudo inscribir'});remaining.push(selectedId);
          }
        }
        setBatchResults(outcomes);setSelectedHosts(remaining);setEnrollConfirmed(false);await refresh();
        if(mounted.current)setNotice(`Lote procesado: ${outcomes.filter(row=>row.ok).length} correctas, ${outcomes.filter(row=>!row.ok).length} fallidas; ${remaining.length} emisores conservados en la selección.`);
      });}}><h3>Inscribir emisores por lotes</h3><label>Máximo por lote<select aria-label="Tamaño del lote" value={batchLimit} onChange={e=>setBatchLimit(Number(e.target.value))} disabled={busy}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><p>Para evitar bloqueos, se procesan hasta {batchLimit} emisores por operación. Los restantes continúan seleccionados para el siguiente lote.</p>
        {hosted&&<><p>Consulta el padrón oficial y sus vinculaciones antes de seleccionar emisores. Selecciona emisores directamente del padrón oficial. Al confirmar, la plataforma vincula las identidades pendientes (con permisos de administrador) y luego solicita su inscripción al servidor.</p><button type="button" disabled={busy||officialLoading||syncRunning} onClick={()=>{setOfficialLoading(true);setOfficialError('');void (async()=>{try{const [roster,identities]=await Promise.all([supabase.from('hosts').select('id,host_id,host_name,reclutador',{count:'exact'}).order('host_name',{ascending:true}).range(0,1999),(api.current as HostedTrainingApi).identities()]);if(roster.error)throw roster.error;setOfficialRoster(roster.data||[]);setOfficialCount(roster.count);setTrainingIdentities(identities.hosts);setTrainingUsers(identities.users);setSelectedHosts([]);}catch{setOfficialError('No se pudo cargar el padrón o las vinculaciones autorizadas.');}finally{setOfficialLoading(false);}})();}}>{officialLoading?'Consultando...':'Cargar emisores oficiales para inscripción'}</button>{officialError&&<p role="alert">{officialError}</p>}{officialRoster.length>0&&<p>{officialRoster.length} emisores oficiales consultados · {officialMapped.filter(x=>x.trainee).length} disponibles para inscribir · {officialMapped.filter(x=>!x.trainee).length} sin identidad habilitada en este catálogo.</p>}</>}
        {hosted&&officialRoster.length>0&&<section className="td-panel"><h4>Preparar identidades para inscripción</h4><p>Los emisores oficiales aparecen en la lista aunque estén pendientes. Para generar las identidades faltantes, un superadministrador debe confirmar un responsable. La operación procesa lotes limitados y muestra el resultado individual; no cambia el reclutador original.</p><p>Identidades vinculadas: {officialMapped.filter(x=>!!x.linked&&!x.conflict).length} / {officialRoster.length}. Pendientes: {officialMapped.filter(x=>!x.linked&&!x.conflict).length}. Conflictos: {officialMapped.filter(x=>x.conflict).length}.</p><label>Lote de sincronización<select value={syncLimit} onChange={e=>setSyncLimit(Number(e.target.value))} disabled={syncRunning}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><button type="button" disabled={busy||syncRunning||data.actor.role!=='superadmin'||!enrollmentOwner||officialCount!==officialRoster.length||!officialMapped.some(x=>!x.linked&&!x.conflict)} onClick={()=>{setSyncRunning(true);setSyncResults([]);void synchronizeOfficialHosts(officialRoster,trainingIdentities,enrollmentOwner,syncLimit).catch(error=>setOfficialError(error instanceof Error?error.message:'Error al sincronizar')).finally(()=>setSyncRunning(false));}}>{syncRunning?'Vinculando emisores…':'Crear identidades pendientes (lote confirmado)'}</button>{data.actor.role!=='superadmin'&&<p>Solicita a un superadministrador que realice la vinculación.</p>}{syncResults.length>0&&<div role="status"><p>{syncResults.filter(x=>x.status==='vinculado').length} vinculados · {syncResults.filter(x=>x.status==='error').length} errores · {syncResults.filter(x=>x.status==='revisión').length} requieren revisión.</p><ul>{syncResults.map(x=><li key={x.id}>{x.name}: {x.status} — {x.detail}</li>)}</ul></div>}</section>}
        {!hosted&&<p role="note">Origen: catálogo local de capacitación.</p>}
        <label>Buscar emisor por nombre o ID de MICO<input aria-label="Buscar emisor registrado" value={hostSearch} onChange={event=>setHostSearch(event.target.value)} placeholder="Nombre o ID" disabled={busy}/></label>
        <label>Filtrar por reclutador<select aria-label="Filtrar por reclutador" value={recruiterFilter} onChange={event=>setRecruiterFilter(event.target.value)} disabled={busy||!recruiters.length}><option value="">Todos los reclutadores disponibles</option>{recruiters.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        {!recruiters.length&&<p>El catálogo de capacitación todavía no incluye el reclutador original. El filtro se activará cuando la integración entregue ese dato verificado.</p>}
        <p>Selecciona uno o varios emisores. Cada inscripción se guarda por separado y conserva su historial individual. Los errores no cancelan las inscripciones correctas.</p>
        {hosted&&data.actor.role==='superadmin'&&<label>Responsable de capacitación para nuevas vinculaciones<select value={enrollmentOwner} onChange={e=>{setEnrollmentOwner(e.target.value);setEnrollConfirmed(false);}}><option value="">Selecciona un responsable</option>{trainingUsers.filter(u=>u.is_active&&u.app_user_id).map(u=><option key={String(u.app_user_id)} value={String(u.app_user_id)}>{String(u.display_name||u.email)}</option>)}</select></label>}
        <fieldset disabled={busy}><legend>Emisores ({selectedHosts.length} seleccionados)</legend>
          <button type="button" disabled={busy} onClick={()=>setSelectedHosts(current=>[...new Set([...current,...(hosted?visibleOfficial.map(x=>x.official.id):visibleTrainees.map(row=>value(row,'host_id'))).filter(id=>id!=='—')])])}>Seleccionar todos los visibles</button>
          <button type="button" disabled={busy} onClick={()=>setSelectedHosts(current=>current.filter(id=>!(hosted?visibleOfficial.some(x=>x.official.id===id):visibleTrainees.some(row=>value(row,'host_id')===id))))}>Quitar visibles</button><button type="button" disabled={busy} onClick={()=>setSelectedHosts([])}>Limpiar toda la selección</button>
          {hosted?visibleOfficial.map(x=><label key={x.official.id} className="td-weekday"><input type="checkbox" disabled={x.conflict} checked={selectedHosts.includes(x.official.id)} onChange={event=>{setEnrollConfirmed(false);setSelectedHosts(current=>event.target.checked?[...current,x.official.id]:current.filter(id=>id!==x.official.id));}}/>{x.official.host_name} · MICO {x.official.host_id} · {x.official.reclutador||'Sin reclutador'} · {x.conflict?'Conflicto':x.linked?'Vinculado':'Pendiente de vincular'} · {x.linked&&workspace.enrollments.some(e=>String(e.host_id)===String(x.linked?.id))?'Con historial de capacitación':'Sin inscripciones registradas'}</label>):visibleTrainees.map(row=>{const id=value(row,'host_id');return <label key={id} className="td-weekday"><input type="checkbox" checked={selectedHosts.includes(id)} onChange={event=>setSelectedHosts(current=>event.target.checked?[...current,id]:current.filter(item=>item!==id))}/ >{value(row,'label')} {enrolledHostIds.has(id)?'· Ya tiene capacitación activa':''}</label>;})}
        </fieldset>
        <p>Un emisor puede participar en diferentes programas. Si ya tiene una inscripción activa, pausada o completada en la misma versión, se conserva su historial y no se crea otra inscripción que reinicie el avance. El cambio de entrenador debe hacerse sobre la inscripción existente.</p>
        <label>Programa publicado<select aria-label="Programa publicado" required value={program} onChange={e=>setProgram(e.target.value)} disabled={busy}><option value="">Selecciona un programa</option>{workspace.program_versions.filter(row=>row.status==='published').map(row=><option key={row.id} value={row.id}>{value(row,'title')} · v{value(row,'version')}</option>)}</select></label>
        <label>Zona horaria<select aria-label="Zona horaria" value={timezone} onChange={e=>setTimezone(e.target.value)} disabled={busy}>{['America/Costa_Rica','America/Bogota','America/Mexico_City','UTC'].map(zone=><option key={zone}>{zone}</option>)}</select></label>
        {hosted&&<label><input type="checkbox" checked={enrollConfirmed} onChange={e=>setEnrollConfirmed(e.target.checked)}/>Confirmo que deseo vincular los pendientes e inscribir los emisores seleccionados en este programa.</label>}
        {hosted&&officialCount!==officialRoster.length&&<p role="alert">Padrón incompleto. No se permite inscribir hasta cargar todos los registros.</p>}
        <button disabled={busy||!selectedHosts.length||!program||(!!hosted&&(!officialRoster.length||officialCount!==officialRoster.length||!enrollConfirmed))}>Inscribir {selectedHosts.length} emisor(es)</button>
        {!!batchResults.length&&<div role="status"><h4>Resultado por emisor</h4><ul>{batchResults.map((row,index)=><li key={row.hostId+'-'+index}>{hosted?officialRoster.find(h=>h.id===row.hostId)?.host_name||row.hostId:hostLabel(row.hostId)}: {row.message}</li>)}</ul></div>}
      </form>}
      {section!=='Resumen' && section!=='Historial' && section!=='Agenda' && section!=='Evidencias' && section!=='Biblioteca' && section!=='Quiz final' && section!=='Cierre' && section!=='Actualizaciones' && <p>Cada inscripción conserva su versión del programa. Publicar una versión nueva permite revisarla después en Actualizaciones.</p>}
    </>}
  </section>;
}
