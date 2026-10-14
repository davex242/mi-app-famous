import React, {useState} from 'react';
import {AgendaParameters,AgendaPreview,LocalTrainingApi,LocalTrainingError,LocalWorkspace,PublicRow} from './localTrainingApi';
const text=(row:PublicRow,key:string)=>typeof row[key]==='string'?row[key] as string:'';
const attendanceLabels:Record<string,string>={present:'Presente',absent:'Ausente',late:'Tarde',excused:'Justificada'};
function localDate(instant:string,zone:string){try{return new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(instant));}catch{return 'Fecha no disponible';}}
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;readonly:boolean;busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalAgenda({api,workspace,readonly,busy,run,refresh,notify}:Props){
  const [enrollmentId,setEnrollmentId]=useState(''),[start,setStart]=useState(''),[time,setTime]=useState('');
  const [weekdays,setWeekdays]=useState([1,2,3,4,5,6,7]);
  const [preview,setPreview]=useState<{result:AgendaPreview;parameters:AgendaParameters;workspace:LocalWorkspace}|null>(null);
  const [sessionId,setSessionId]=useState(''),[attendance,setAttendance]=useState('');
  const [confirmAbsent,setConfirmAbsent]=useState(false),[confirmBatchAbsent,setConfirmBatchAbsent]=useState(false);
  const [batchSessions,setBatchSessions]=useState<string[]>([]),[batchAttendance,setBatchAttendance]=useState(''),[batchResults,setBatchResults]=useState<{id:string;ok:boolean;message:string}[]>([]);
  const [newDate,setNewDate]=useState(''),[newTime,setNewTime]=useState(''),[reason,setReason]=useState('');
  const active=workspace.enrollments.filter(row=>row.status==='active');
  const eligibleSessions=workspace.sessions.filter(row=>active.some(e=>e.id===row.enrollment_id));
  const enrollment=workspace.enrollments.find(row=>row.id===enrollmentId);
  const selected=workspace.sessions.find(row=>row.id===sessionId);
  const selectedEnrollment=workspace.enrollments.find(row=>row.id===selected?.enrollment_id);
  const writable=selectedEnrollment?.status==='active';
  const unresolved=eligibleSessions.filter(row=>!workspace.attendance.some(record=>record.session_id===row.id));
  const validPreview=preview?.workspace===workspace?preview:null;
  const name=(row:PublicRow)=>text(workspace.trainees.find(t=>t.host_id===row.host_id)??{},'label') || 'Emisor DEMO';
  const sessionLabel=(row:PublicRow)=>{const e=workspace.enrollments.find(e=>e.id===row.enrollment_id);return `${e?name(e):'Emisor DEMO'} · ${localDate(text(row,'scheduled_at'),e?text(e,'timezone'):'UTC')}`;};
  return <>
    <div className="td-table-scroll"><table><thead><tr><th>Emisor / fecha local</th><th>Zona horaria</th><th>Sesión</th><th>Asistencia</th></tr></thead><tbody>{workspace.sessions.map(row=>{
      const e=workspace.enrollments.find(e=>e.id===row.enrollment_id),record=workspace.attendance.find(a=>a.session_id===row.id);
      return <tr key={row.id}><td>{sessionLabel(row)}</td><td>{e?text(e,'timezone'):'—'}</td><td>{text(row,'status')}</td><td>{record?attendanceLabels[text(record,'status')]:'Sin registrar'}</td></tr>;
    })}</tbody></table>{!workspace.sessions.length&&<p>Aún no hay sesiones de prueba.</p>}</div>
    {!readonly && <>
      {unresolved.length>0&&<section className="td-panel"><h3>Asistencias pendientes de revisión</h3><p>{unresolved.length} sesiones no tienen asistencia registrada. Antes de marcar ausencia o excluir del programa, el entrenador debe verificar si falta registrar asistencia. Una ausencia no excluye automáticamente ni cancela la inscripción.</p><ul>{unresolved.slice(0,50).map(row=><li key={row.id}>{sessionLabel(row)} · Sin registrar</li>)}</ul>{unresolved.length>50&&<p>Se muestran las primeras 50 sesiones pendientes.</p>}</section>}

      <form className="td-panel" onSubmit={event=>{event.preventDefault();setPreview(null);void run(async()=>{
        const parameters={enrollment_id:enrollmentId,start_date:start,local_time:time,weekdays};
        const result=await api.previewAgenda(parameters);setPreview({result,parameters,workspace});
      });}}><h3>Preparar agenda DEMO</h3>
        <label>Inscripción de agenda<select aria-label="Inscripción de agenda" required value={enrollmentId} disabled={busy} onChange={e=>{setEnrollmentId(e.target.value);setPreview(null);}}><option value="">Selecciona una inscripción activa</option>{active.map(row=><option key={row.id} value={row.id}>{name(row)} · {text(row,'timezone')}</option>)}</select></label>
        {enrollment&&<p>Fecha y hora en {text(enrollment,'timezone')}. La vista previa todavía no guarda sesiones.</p>}
        <label>Fecha inicial<input aria-label="Fecha inicial" type="date" required value={start} disabled={busy} onChange={e=>{setStart(e.target.value);setPreview(null);}}/></label>
        <label>Hora local<input aria-label="Hora local" type="time" required value={time} disabled={busy} onChange={e=>{setTime(e.target.value);setPreview(null);}}/></label>
        <fieldset disabled={busy}><legend>Días de entrenamiento</legend>{['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((label,index)=><label className="td-weekday" key={label}><input type="checkbox" checked={weekdays.includes(index+1)} onChange={e=>{setWeekdays(e.target.checked?[...weekdays,index+1].sort():weekdays.filter(n=>n!==index+1));setPreview(null);}}/>{label}</label>)}</fieldset>
        <button disabled={busy||!enrollment||!weekdays.length}>Ver propuesta de agenda</button>
      </form>
      {validPreview&&<article className="td-panel" aria-label="Propuesta de agenda"><h3>Propuesta · {validPreview.result.sessions.length} sesiones nuevas</h3><p>Zona: {validPreview.result.timezone}. Prácticas ya agendadas o completadas: {validPreview.result.skipped}.</p><ol>{validPreview.result.sessions.map((row,index)=><li key={index}>Día {String(row.day)} · {localDate(text(row,'scheduled_at'),validPreview.result.timezone)} · {String(row.duration_minutes)} minutos</li>)}</ol>
        <button disabled={busy||!validPreview.result.sessions.length} onClick={()=>void run(async()=>{
          const current=validPreview;setPreview(null);await api.generateAgenda(current.parameters,current.result.preview_hash);await refresh();notify('Agenda DEMO guardada.');
        })}>Confirmar creación de sesiones DEMO</button></article>}
      <form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
        const record=workspace.attendance.find(row=>row.session_id===sessionId);
        if(attendance==='absent'&&!confirmAbsent)throw new Error('Confirma que revisaste la asistencia antes de registrar la ausencia.');await api.attendance(sessionId,attendance,record?text(record,'recorded_at'):null);setConfirmAbsent(false);await refresh();notify('Asistencia DEMO guardada.');
      });}}><h3>Registrar asistencia DEMO</h3>
        <label>Sesión de asistencia<select aria-label="Sesión de asistencia" required disabled={busy} value={sessionId} onChange={e=>{setSessionId(e.target.value);setAttendance('');setNewDate('');setNewTime('');setReason('');}}><option value="">Selecciona una sesión</option>{workspace.sessions.filter(row=>workspace.enrollments.some(e=>e.id===row.enrollment_id&&e.status==='active')).map(row=><option key={row.id} value={row.id}>{sessionLabel(row)}</option>)}</select></label>
        <label>Asistencia<select aria-label="Asistencia" required disabled={busy} value={attendance} onChange={e=>setAttendance(e.target.value)}><option value="">Selecciona un estado</option>{Object.entries(attendanceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {attendance==='absent'&&<label><input type="checkbox" checked={confirmAbsent} onChange={e=>setConfirmAbsent(e.target.checked)} disabled={busy}/>Confirmo que revisé el registro y que el emisor no asistió. Quedará pendiente de seguimiento, sin exclusión automática.</label>}
        <button disabled={busy||!writable||!attendance||(attendance==='absent'&&!confirmAbsent)}>Guardar asistencia DEMO</button>
      </form>
      <form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
        if(batchAttendance==='absent'&&!confirmBatchAbsent)throw new Error('Confirma la revisión de las ausencias antes de guardarlas.');const results:{id:string;ok:boolean;message:string}[]=[];
        for(const id of batchSessions.filter(id=>eligibleSessions.some(row=>row.id===id))){
          const record=workspace.attendance.find(row=>row.session_id===id);
          try{await api.attendance(id,batchAttendance,record?text(record,'recorded_at'):null);results.push({id,ok:true,message:'Guardada'});}
          catch(reason){if(reason instanceof LocalTrainingError&&[401,403].includes(reason.status))throw reason;results.push({id,ok:false,message:reason instanceof Error?reason.message:'No se pudo registrar'});}
        }
        setBatchResults(results);setConfirmBatchAbsent(false);await refresh();notify(`Asistencia masiva: ${results.filter(row=>row.ok).length} guardadas, ${results.filter(row=>!row.ok).length} fallidas.`);
      });}}><h3>Registrar asistencia de varios emisores</h3>
        <p>Selecciona las sesiones correspondientes. Cada registro conserva su emisor y sesión; una falla individual no reemplaza los demás resultados.</p>
        <fieldset disabled={busy}><legend>Sesiones seleccionadas: {batchSessions.length}</legend>
          <button type="button" disabled={busy} onClick={()=>setBatchSessions(eligibleSessions.map(row=>row.id!))}>Seleccionar todas</button>
          <button type="button" disabled={busy} onClick={()=>setBatchSessions([])}>Limpiar selección</button>
          {eligibleSessions.map(row=><label key={row.id} className="td-weekday"><input type="checkbox" checked={batchSessions.includes(row.id!)} onChange={event=>setBatchSessions(current=>event.target.checked?[...current,row.id!]:current.filter(id=>id!==row.id))}/>{sessionLabel(row)}</label>)}
        </fieldset>
        <label>Estado de asistencia<select aria-label="Estado de asistencia masiva" required disabled={busy} value={batchAttendance} onChange={e=>setBatchAttendance(e.target.value)}><option value="">Selecciona un estado</option>{Object.entries(attendanceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        {batchAttendance==='absent'&&<label><input type="checkbox" checked={confirmBatchAbsent} onChange={e=>setConfirmBatchAbsent(e.target.checked)} disabled={busy}/>Confirmo que revisé estas ausencias y que los emisores requieren seguimiento. No se excluirán automáticamente.</label>}
        <button disabled={busy||!batchSessions.some(id=>eligibleSessions.some(row=>row.id===id))||!batchAttendance||(batchAttendance==='absent'&&!confirmBatchAbsent)}>Guardar asistencia de {batchSessions.length} sesiones</button>
        {!!batchResults.length&&<div role="status"><h4>Resultados por sesión</h4><ul>{batchResults.map(row=><li key={row.id}>{sessionLabel(workspace.sessions.find(s=>s.id===row.id)??({} as PublicRow))}: {row.message}</li>)}</ul></div>}
      </form>
      {selected&&writable&&selected.status!=='completed'&&<form className="td-panel" onSubmit={event=>{event.preventDefault();void run(async()=>{
        await api.reschedule(sessionId,newDate,newTime,text(selected,'scheduled_at'),reason);await refresh();notify('Sesión DEMO reprogramada.');
      });}}><h3>Reprogramar sesión DEMO</h3><p>{sessionLabel(selected)} · Usa la hora de {text(selectedEnrollment!,'timezone')}.</p>
        <label>Nueva fecha local<input aria-label="Nueva fecha local" type="date" required disabled={busy} value={newDate} onChange={e=>setNewDate(e.target.value)}/></label>
        <label>Nueva hora local<input aria-label="Nueva hora local" type="time" required disabled={busy} value={newTime} onChange={e=>setNewTime(e.target.value)}/></label>
        <label>Motivo de reprogramación<textarea aria-label="Motivo de reprogramación" required maxLength={1000} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <button disabled={busy||!newDate||!newTime||!reason.trim()}>Guardar reprogramación DEMO</button>
      </form>}
    </>}
  </>;
}
