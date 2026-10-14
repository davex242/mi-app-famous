import React,{useState} from 'react';
import {ExamQuestion,LocalTrainingApi,LocalWorkspace} from './localTrainingApi';
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalExamEditor({api,workspace,busy,run,refresh,notify}:Props){
  const [source,setSource]=useState(''),[key,setKey]=useState(''),[threshold,setThreshold]=useState(''),[questions,setQuestions]=useState<ExamQuestion[]>([]);
  const [snapshot,setSnapshot]=useState<LocalWorkspace|null>(null),[confirmed,setConfirmed]=useState(false);
  const latest=workspace.exams.filter(row=>!workspace.exams.some(other=>other.exam_key===row.exam_key&&Number(other.version)>Number(row.version)));
  const stale=!!snapshot&&snapshot!==workspace;
  const validThreshold=threshold.trim()!==''&&Number.isFinite(Number(threshold))&&Number(threshold)>0&&Number(threshold)<=100&&Number(Number(threshold).toFixed(2))===Number(threshold);
  const validBank=questions.length===50&&new Set(questions.map(q=>q.prompt.trim())).size===50&&questions.every(q=>q.prompt.trim()&&q.prompt.length<=1000&&q.options.length>=2&&q.options.length<=6&&q.options.every(o=>o.trim()&&o.length<=300)&&new Set(q.options.map(o=>o.trim())).size===q.options.length&&Number.isInteger(q.correct_option)&&q.correct_option>=0&&q.correct_option<q.options.length);
  function edit(index:number,change:Partial<ExamQuestion>){setQuestions(rows=>rows.map((row,i)=>i===index?{...row,...change}:row));setConfirmed(false);}
  function reset(){setSource('');setKey('');setThreshold('');setQuestions([]);setSnapshot(null);setConfirmed(false);}
  return <section className="td-panel" aria-label="Editor administrativo de exámenes"><h3>Editor de exámenes DEMO</h3><p>El borrador vive solo en esta pantalla. Publicar crea una versión inmutable con 50 preguntas; las invitaciones anteriores conservan su examen.</p>
    <button disabled={busy} onClick={()=>void run(async()=>{reset();const data=await api.examTemplate();setQuestions(data.questions);setSnapshot(workspace);notify('Ejemplo DEMO cargado. Revisa las preguntas y define el umbral antes de publicar.');})}>Cargar banco DEMO de 50 preguntas</button>
    <button disabled={busy} onClick={()=>{reset();setQuestions(Array.from({length:50},()=>({prompt:'',options:['',''],correct_option:-1})));setSnapshot(workspace);}}>Crear banco vacío de 50 preguntas</button>
    <label>Examen para crear nueva versión<select aria-label="Examen para crear nueva versión" disabled={busy} value={source} onChange={e=>{const id=e.target.value;reset();setSource(id);if(!id)return;void run(async()=>{const data=await api.editExam(id);setKey(data.exam_key);setThreshold(String(data.pass_percent));setQuestions(data.questions);setSnapshot(workspace);notify('Versión cargada para revisión administrativa. El original no se modifica.');});}}><option value="">Nuevo examen</option>{latest.map(row=><option key={row.id} value={row.id}>{String(row.exam_key)} · v{String(row.version)}</option>)}</select></label>
    <form onSubmit={event=>{event.preventDefault();if(!confirmed||!validBank||!validThreshold||stale)return;setConfirmed(false);void run(async()=>{await api.publishExam({...(source?{source_id:source}:{}),exam_key:key,pass_percent:Number(threshold),questions});reset();await refresh();notify('Nueva versión del examen DEMO publicada. Las invitaciones anteriores siguen conservadas.');});}}>
      <label>Nombre del examen<input aria-label="Nombre del examen" required maxLength={80} disabled={busy||!!source} value={key} onChange={e=>{setKey(e.target.value);setConfirmed(false);}}/></label>
      <label>Umbral de aprobación (%)<input aria-label="Umbral de aprobación (%)" type="number" required min="0.01" max="100" step="0.01" disabled={busy} value={threshold} onChange={e=>{setThreshold(e.target.value);setConfirmed(false);}}/></label>
      <p>{questions.length} / 50 preguntas cargadas. {validBank?'Banco completo y válido.':'Completa preguntas únicas, opciones distintas y una respuesta correcta por pregunta.'}</p>
      {questions.map((question,index)=><details className="td-local-exam-question" key={index}><summary>Pregunta {index+1}{question.prompt?' · '+question.prompt.slice(0,65):' · Sin completar'}</summary>
        <label>Enunciado {index+1}<textarea aria-label={`Enunciado ${index+1}`} required maxLength={1000} disabled={busy} value={question.prompt} onChange={e=>edit(index,{prompt:e.target.value})}/></label>
        {question.options.map((option,optionIndex)=><label key={optionIndex}>Opción {optionIndex+1} de pregunta {index+1}<input aria-label={`Opción ${optionIndex+1} de pregunta ${index+1}`} required maxLength={300} disabled={busy} value={option} onChange={e=>edit(index,{options:question.options.map((o,i)=>i===optionIndex?e.target.value:o)})}/></label>)}
        <label>Respuesta correcta de pregunta {index+1}<select aria-label={`Respuesta correcta de pregunta ${index+1}`} required disabled={busy} value={question.correct_option<0?'':String(question.correct_option)} onChange={e=>edit(index,{correct_option:e.target.value===''?-1:Number(e.target.value)})}><option value="">Selecciona una respuesta correcta</option>{question.options.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>
        <button type="button" disabled={busy||question.options.length>=6} onClick={()=>edit(index,{options:[...question.options,'']})}>Agregar opción a pregunta {index+1}</button>
        <button type="button" disabled={busy||question.options.length<=2} onClick={()=>edit(index,{options:question.options.slice(0,-1),correct_option:question.correct_option===question.options.length-1?-1:question.correct_option})}>Quitar última opción de pregunta {index+1}</button>
      </details>)}
      {stale&&<p>El catálogo cambió. Vuelve a cargar el banco o la versión antes de publicar.</p>}
      <label className="td-weekday"><input aria-label="Confirmo publicación del examen" type="checkbox" disabled={busy||stale||!key.trim()||!validThreshold||!validBank} checked={confirmed&&!stale} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que revisé las 50 preguntas, sus respuestas correctas y el umbral de este examen DEMO.</label>
      <button disabled={busy||stale||!key.trim()||!validThreshold||!validBank||!confirmed}>Publicar examen DEMO</button>
    </form>
  </section>;
}
