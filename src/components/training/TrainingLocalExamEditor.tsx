import React,{useEffect,useRef,useState} from 'react';
import {ExamQuestion,LocalTrainingApi,LocalWorkspace} from './localTrainingApi';
import {parsePrivateExamFile,PRIVATE_EXAM_MAX_BYTES,PrivateExamDraft} from './privateExamImport.mjs';
type Props={api:LocalTrainingApi;workspace:LocalWorkspace;busy:boolean;run:(operation:()=>Promise<void>)=>Promise<void>;refresh:()=>Promise<void>;notify:(message:string)=>void};
export default function TrainingLocalExamEditor({api,workspace,busy,run,refresh,notify}:Props){
  const [source,setSource]=useState(''),[key,setKey]=useState(''),[threshold,setThreshold]=useState(''),[questions,setQuestions]=useState<ExamQuestion[]>([]);
  const [snapshot,setSnapshot]=useState<LocalWorkspace|null>(null),[confirmed,setConfirmed]=useState(false);
  const [preview,setPreview]=useState<PrivateExamDraft|null>(null),[privateBank,setPrivateBank]=useState(false),[rationales,setRationales]=useState<string[]>([]),[importError,setImportError]=useState('');
  const generation=useRef(0),currentWorkspace=useRef(workspace),alive=useRef(true);
  currentWorkspace.current=workspace;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{generation.current++;setPreview(null);setImportError('');},[workspace]);
  const latest=workspace.exams.filter(row=>!workspace.exams.some(other=>other.exam_key===row.exam_key&&Number(other.version)>Number(row.version)));
  const stale=!!snapshot&&snapshot!==workspace;
  const validThreshold=threshold.trim()!==''&&Number.isFinite(Number(threshold))&&Number(threshold)>0&&Number(threshold)<=100&&Number(Number(threshold).toFixed(2))===Number(threshold);
  const validBank=questions.length===50&&new Set(questions.map(q=>q.prompt.trim())).size===50&&questions.every(q=>q.prompt.trim()&&q.prompt.length<=1000&&q.options.length>=2&&q.options.length<=6&&q.options.every(o=>o.trim()&&o.length<=300)&&new Set(q.options.map(o=>o.trim())).size===q.options.length&&Number.isInteger(q.correct_option)&&q.correct_option>=0&&q.correct_option<q.options.length);
  function edit(index:number,change:Partial<ExamQuestion>){setQuestions(rows=>rows.map((row,i)=>i===index?{...row,...change}:row));setConfirmed(false);setRationales(rows=>rows.map((row,i)=>i===index?'':row));}
  function reset(){generation.current++;setPreview(null);setPrivateBank(false);setRationales([]);setImportError('');setSource('');setKey('');setThreshold('');setQuestions([]);setSnapshot(null);setConfirmed(false);}
  async function previewFile(file:File){
    const request=++generation.current,initialWorkspace=workspace;setPreview(null);setImportError('');setConfirmed(false);
    try{
      if(file.size>PRIVATE_EXAM_MAX_BYTES)throw new Error('El archivo supera el límite de 1 MiB.');
      const raw=await file.text();
      if(!alive.current||generation.current!==request||currentWorkspace.current!==initialWorkspace)return;
      setPreview(parsePrivateExamFile(raw));
    }catch(error){if(alive.current&&generation.current===request&&currentWorkspace.current===initialWorkspace)setImportError(error instanceof Error?error.message:'No se pudo leer el archivo.');}
  }
  return <section className="td-panel" aria-label="Editor administrativo de exámenes"><h3>Editor de exámenes DEMO</h3><p>El borrador vive solo en esta pantalla. Publicar crea una versión inmutable con 50 preguntas; las invitaciones anteriores conservan su examen.</p>
    <div className="td-panel" aria-label="Importar banco privado">
      <label>Archivo JSON del banco privado<input aria-label="Archivo JSON del banco privado" type="file" accept=".json,application/json" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void previewFile(file);}}/></label>
      <p>Máximo 1 MiB. Validar no envía el archivo al servidor. Solo se conserva en esta pantalla; publicar requiere una confirmación aparte.</p>
      {importError&&<p role="alert">{importError}</p>}
      {preview&&<div><p>Archivo validado: 50 preguntas · {preview.unit_count} unidades · 75% · 3 intentos · extras preaprobados · invitación de 24 horas.</p><p>Cargar reemplaza el borrador de esta pantalla; no publica un examen.</p>
        <button type="button" disabled={busy} onClick={()=>{const draft=preview;reset();setKey(draft.key);setThreshold('75');setQuestions(draft.questions);setRationales(draft.rationales);setPrivateBank(true);setSnapshot(workspace);notify('Banco privado cargado para revisión local. Todavía no está publicado.');}}>Cargar archivo validado en el editor</button>
        <button type="button" disabled={busy} onClick={()=>{generation.current++;setPreview(null);}}>Cancelar carga privada</button>
      </div>}
      <button type="button" disabled={busy} onClick={reset}>Descartar borrador de esta pantalla</button>
    </div>
    <button disabled={busy} onClick={()=>void run(async()=>{reset();const data=await api.examTemplate();setQuestions(data.questions);setSnapshot(workspace);notify('Ejemplo DEMO cargado. Revisa las preguntas y define el umbral antes de publicar.');})}>Cargar banco DEMO de 50 preguntas</button>
    <button disabled={busy} onClick={()=>{reset();setQuestions(Array.from({length:50},()=>({prompt:'',options:['',''],correct_option:-1})));setSnapshot(workspace);}}>Crear banco vacío de 50 preguntas</button>
    <label>Examen para crear nueva versión<select aria-label="Examen para crear nueva versión" disabled={busy} value={source} onChange={e=>{const id=e.target.value;reset();setSource(id);if(!id)return;void run(async()=>{const data=await api.editExam(id);setKey(data.exam_key);setThreshold(String(data.pass_percent));setQuestions(data.questions);setSnapshot(workspace);notify('Versión cargada para revisión administrativa. El original no se modifica.');});}}><option value="">Nuevo examen</option>{latest.map(row=><option key={row.id} value={row.id}>{String(row.exam_key)} · v{String(row.version)}</option>)}</select></label>
    <form onSubmit={event=>{event.preventDefault();if(!confirmed||!validBank||!validThreshold||stale)return;setConfirmed(false);void run(async()=>{await api.publishExam({...(source?{source_id:source}:{}),exam_key:key,pass_percent:Number(threshold),questions});reset();await refresh();notify('Nueva versión del examen DEMO publicada. Las invitaciones anteriores siguen conservadas.');});}}>
      <label>Nombre del examen<input aria-label="Nombre del examen" required maxLength={80} disabled={busy||!!source} value={key} onChange={e=>{setKey(e.target.value);setConfirmed(false);}}/></label>
      <label>Umbral de aprobación (%)<input aria-label="Umbral de aprobación (%)" type="number" required min="0.01" max="100" step="0.01" disabled={busy||privateBank} value={threshold} onChange={e=>{setThreshold(e.target.value);setConfirmed(false);}}/></label>
      {privateBank&&<p>Banco privado para pruebas iniciales: el umbral confirmado es 75%. La publicación guarda preguntas y respuestas en la base local; los motivos de revisión solo viven en esta pantalla.</p>}
      <p>{questions.length} / 50 preguntas cargadas. {validBank?'Banco completo y válido.':'Completa preguntas únicas, opciones distintas y una respuesta correcta por pregunta.'}</p>
      {questions.map((question,index)=><details className="td-local-exam-question" key={index}><summary>Pregunta {index+1}{question.prompt?' · '+question.prompt.slice(0,65):' · Sin completar'}</summary>
        {rationales[index]&&<p aria-label={`Motivo de revisión ${index+1}`}>{rationales[index]}</p>}
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
