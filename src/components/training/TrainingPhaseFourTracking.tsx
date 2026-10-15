import React,{useMemo,useState} from 'react';
import {LocalWorkspace,PublicRow} from './localTrainingApi';
const value=(r:PublicRow,k:string)=>typeof r[k]==='string'?String(r[k]):'';
export default function TrainingPhaseFourTracking({workspace}:{workspace:LocalWorkspace}){
 const [filter,setFilter]=useState('all');
 const alerts=useMemo(()=>{
  const items:{key:string;type:string;name:string;detail:string}[]=[];
  const name=(enrollmentId:unknown)=>{const e=workspace.enrollments.find(r=>r.id===enrollmentId);const h=workspace.trainees.find(r=>r.host_id===e?.host_id);return h?value(h,'label'):'Emisor sin etiqueta';};
  for(const e of workspace.evidence.filter(r=>r.status==='pending'))items.push({key:'e'+e.id,type:'pending',name:name(e.enrollment_id),detail:'Evidencia pendiente: '+value(e,'description')});
  for(const s of workspace.sessions){const a=workspace.attendance.find(r=>r.session_id===s.id);if(a?.status==='absent')items.push({key:'a'+s.id,type:'absence',name:name(s.enrollment_id),detail:'Ausencia registrada · '+value(s,'scheduled_at')});else if(s.status==='completed'&&!a)items.push({key:'s'+s.id,type:'pending',name:name(s.enrollment_id),detail:'Sesión completada sin asistencia'});}
  for(const a of workspace.assessments.filter(r=>r.passed===false))items.push({key:'r'+a.id,type:'low',name:name(a.enrollment_id),detail:'Evaluación no aprobada · '+String(a.score??'—')+'/100'});
  for(const a of workspace.exam_attempts.filter(r=>r.passed===false)){const assignment=workspace.exam_assignments.find(r=>r.id===a.assignment_id);items.push({key:'x'+a.id,type:'low',name:name(assignment?.enrollment_id),detail:'Examen no aprobado'});}
  return items;
 },[workspace]);
 const visible=alerts.filter(a=>filter==='all'||a.type===filter);
 return <section className="td-panel" aria-label="Alertas y seguimiento"><h3>Seguimiento y alertas · Fase 4</h3><p>Alertas calculadas con los registros disponibles; no generan sanciones ni cambian automáticamente la inscripción.</p><p>Pendientes: <strong>{alerts.filter(a=>a.type==='pending').length}</strong> · Ausencias: <strong>{alerts.filter(a=>a.type==='absence').length}</strong> · Resultados insuficientes: <strong>{alerts.filter(a=>a.type==='low').length}</strong></p><label>Filtrar alertas<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas</option><option value="pending">Pendientes</option><option value="absence">Ausencias</option><option value="low">Resultados insuficientes</option></select></label><div className="td-table-scroll"><table><thead><tr><th>Emisor</th><th>Tipo</th><th>Detalle</th></tr></thead><tbody>{visible.map(a=><tr key={a.key}><td>{a.name}</td><td>{a.type==='pending'?'Pendiente':a.type==='absence'?'Ausencia':'Resultado insuficiente'}</td><td>{a.detail}</td></tr>)}</tbody></table></div>{!visible.length&&<p>No hay alertas de este tipo.</p>}<h4>Historial y trazabilidad</h4><p>Últimos 100 eventos disponibles, en modo de solo lectura.</p><div className="td-table-scroll"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Referencia</th></tr></thead><tbody>{[...workspace.events].reverse().slice(0,100).map((e,i)=><tr key={e.id??i}><td>{value(e,'created_at')}</td><td>{value(e,'event_type')}</td><td>{value(e,'entity_id')||value(e,'enrollment_id')}</td></tr>)}</tbody></table></div></section>;
}
