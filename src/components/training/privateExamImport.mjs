import {trainingContentProposal} from './studyCatalogueData.mjs';
export const PRIVATE_EXAM_MAX_BYTES=1024*1024;
const failure=message=>{throw new Error(message);};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fields=(value,allowed)=>{if(!object(value)||Object.keys(value).some(key=>!allowed.includes(key)))failure('El archivo tiene una estructura no admitida.');};
const text=(value,limit)=>{if(typeof value!=='string'||!value.trim()||value.length>limit)failure('Hay un texto vacío o demasiado largo.');return value.trim();};
const normalize=value=>value.trim().replace(/\s+/g,' ').toLowerCase();
// Pure browser-side validation: never fetch, persist, evaluate or include real keys in source.
export function parsePrivateExamFile(raw){
  if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>PRIVATE_EXAM_MAX_BYTES)failure('El archivo supera el límite de 1 MiB.');
  let data;try{data=JSON.parse(raw);}catch{failure('El archivo no es un JSON válido.');}
  fields(data,['key','status','review_status','pass_percent','max_attempts','expires_at','extra_attempts_require_preapproval','invitation_hours','questions']);
  if(data.status!=='draft'||data.review_status!=='accepted_for_initial_testing'||data.expires_at!==null)failure('Se requiere un borrador aceptado para pruebas iniciales, sin fecha de vencimiento propia.');
  if(data.pass_percent!==75||data.max_attempts!==3||data.extra_attempts_require_preapproval!==true||data.invitation_hours!==24)failure('El banco debe conservar 75%, 3 intentos, extras preaprobados y 24 horas por invitación.');
  const key=text(data.key,80);
  if(!Array.isArray(data.questions)||data.questions.length!==25)failure('El banco debe contener exactamente 25 preguntas.');
  const ids=new Set(),prompts=new Set(),units=new Set(),knownUnits=new Set(trainingContentProposal.units.map(unit=>unit.key));
  const questions=[],rationales=[];
  for(const row of data.questions){
    fields(row,['id','unit_key','prompt','options','correct_option','review_rationale','review_status']);
    const id=text(row.id,80),unit=text(row.unit_key,80),prompt=text(row.prompt,1000);
    if(ids.has(id)||prompts.has(normalize(prompt)))failure('Hay identificadores o preguntas duplicados.');
    ids.add(id);prompts.add(normalize(prompt));
    if(!knownUnits.has(unit))failure('Una pregunta referencia una unidad de estudio desconocida.');units.add(unit);
    if(row.review_status!=='accepted_for_initial_testing')failure('Todas las preguntas deben estar aceptadas para pruebas iniciales.');
    if(!Array.isArray(row.options)||row.options.length<2||row.options.length>6)failure('Cada pregunta debe tener entre 2 y 6 opciones.');
    const options=row.options.map(value=>text(value,300));
    if(new Set(options.map(normalize)).size!==options.length)failure('Las opciones de una pregunta deben ser distintas.');
    if(!Number.isInteger(row.correct_option)||row.correct_option<0||row.correct_option>=options.length)failure('Hay una respuesta correcta inválida.');
    questions.push({prompt,options,correct_option:row.correct_option});
    rationales.push(text(row.review_rationale,2000));
  }
  if(units.size!==knownUnits.size)failure('El banco debe cubrir las 14 unidades de estudio.');
  return {key,pass_percent:75,questions,rationales,unit_count:units.size};
}
