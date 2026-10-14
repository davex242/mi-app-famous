import {createHash,randomUUID} from 'node:crypto';
import {trainingContentProposal as source} from '../src/components/training/studyCatalogueData.mjs';
const markerId=id=>{const h=createHash('sha256').update('accepted-study-import:'+id).digest('hex').slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
export function createAcceptedCourseOperations(run,{requireAdmin,fields,text,fail,audit}){
 function prepare(){
  if(source.review_status!=='accepted_for_initial_testing'||source.duration_days!==14||source.units.length!==14||source.pass_percent!==75||source.max_attempts!==3||source.invitation_hours!==24||source.extra_attempts_require_preapproval!==true)fail(409,'Accepted course source is unavailable');
  if(new Set(source.units.map(row=>row.key)).size!==14)fail(409,'Study units must be distinct');
  const units=source.units.map((unit,index)=>{
   if(unit.day!==index+1||!Number.isInteger(unit.estimated_minutes)||unit.estimated_minutes<1||unit.estimated_minutes>480||!unit.requires_evidence||!unit.requires_assessment)fail(409,'Invalid accepted study practice');
   for(const key of ['guide','practice','review_criteria'])if(!Array.isArray(unit[key])||!unit[key].length||unit[key].some(value=>typeof value!=='string'||!value.trim()))fail(409,'Incomplete accepted study material');
   const notes=text([`Práctica:`,...unit.practice.map((value,i)=>`${i+1}. ${value}`),'Evidencia: '+unit.evidence,'Criterios de revisión:',...unit.review_criteria.map(value=>'- '+value)].join('\n'),2000);
   const content=text(['CONTENIDO ACEPTADO PARA PRUEBA INICIAL',`Día ${unit.day}: ${unit.title}`,unit.objective,'Guía de estudio:',...unit.guide.map(value=>'- '+value),notes,'Política del quiz: 75 %; 3 intentos iniciales; extras preaprobados; enlaces de 24 horas.','Esta guía no contiene preguntas ni respuestas del banco privado.'].join('\n\n'),20000);
   return {key:text(unit.key,80),day:unit.day,title:text(unit.title,120),description:text(unit.objective,2000),minutes:unit.estimated_minutes,notes,content};
  });
  const data={source_key:text(source.key,80),title:text(source.title,120),duration_days:14,units,policy:{pass_percent:75,initial_attempts:3,extra_attempts_require_preapproval:true,invitation_hours:24}};
  return {...data,source_hash:createHash('sha256').update(JSON.stringify(data)).digest('hex'),program_key:'accepted-study:'+data.source_key};
 }
 async function existing(tx,plan){
  const program=(await tx.query('select id,status from public.training_program_versions where program_key=$1 and version=1',[plan.program_key])).rows[0];
  if(!program)return null;
  const marker=(await tx.query("select details from public.training_events where id=$1 and event_type='accepted_course_loaded'",[markerId(program.id)])).rows[0];
  return {program_id:program.id,program_status:program.status,state:marker?.details.source_hash===plan.source_hash?'already_loaded':'conflict'};
 }
 function summary(plan,prior){return {source_key:plan.source_key,source_hash:plan.source_hash,title:plan.title,duration_days:14,topics:14,materials:14,practices:14,material_kind:'text',allow_preview:true,allow_download:true,policy:plan.policy,state:prior?.state??'ready',program_id:prior?.program_id??null,program_status:prior?.program_status??null};}
 return {
  previewAcceptedCourse:(token,body)=>run(token,async(tx,actor)=>{requireAdmin(actor);fields(body,[]);const plan=prepare();return summary(plan,await existing(tx,plan));}),
  loadAcceptedCourse:(token,body)=>run(token,async(tx,actor)=>{
   requireAdmin(actor);fields(body,['expected_hash','confirmed']);if(body.confirmed!==true)fail(400,'Explicit draft import confirmation required');const plan=prepare();if(body.expected_hash!==plan.source_hash)fail(409,'Accepted course preview changed');
   // The existing unique program-key/version constraint serializes initial imports.
   // A competing transaction either sees the completed import or rolls back safely.
   const program=(await tx.query(`insert into public.training_program_versions(program_key,version,title,duration_days,changelog,created_by)
    values($1,1,$2,14,'Carga inicial del contenido aceptado; todo permanece en borrador',$3)
    on conflict(program_key,version) do nothing returning id,status`,[plan.program_key,plan.title,actor.app_user_id])).rows[0];
   if(!program){const prior=await existing(tx,plan);if(prior?.state!=='already_loaded')fail(409,'Reserved course conflicts with existing content');return {...summary(plan,prior),already_loaded:true};}
   const links=[];
   for(const unit of plan.units){
    const topic=(await tx.query(`insert into public.training_topics(content_key,revision,title,description,category,estimated_minutes,created_by)
     values($1,1,$2,$3,'Formación inicial',$4,$5) returning id`,[randomUUID(),unit.title,unit.description,unit.minutes,actor.app_user_id])).rows[0];
    const materialId=randomUUID();await tx.query(`insert into public.training_materials(id,content_key,revision,topic_id,title,kind,storage_path,allow_preview,allow_download,created_by)
     values($1,$2,1,$3,$4,'document',$5,true,true,$6)`,[materialId,randomUUID(),topic.id,text('Guía · '+unit.title,120),`sandbox/materials/${materialId}.txt`,actor.app_user_id]);
    await tx.query('insert into training_private.local_material_content(material_id,body) values($1,$2)',[materialId,unit.content]);
    const item=(await tx.query(`insert into public.training_program_items(program_version_id,topic_id,day,position,notes,evidence_required,assessment_required)
     values($1,$2,$3,1,$4,true,true) returning id`,[program.id,topic.id,unit.day,unit.notes])).rows[0];
    await tx.query('insert into public.training_program_materials(item_id,material_id) values($1,$2)',[item.id,materialId]);
    links.push({unit_key:unit.key,day:unit.day,topic_id:topic.id,material_id:materialId,item_id:item.id});
    await audit(tx,actor,'topic_created','topics',topic.id);await audit(tx,actor,'material_created','materials',materialId);
   }
   await audit(tx,actor,'program_created','program',program.id);
   await tx.query(`insert into public.training_events(id,actor_app_user_id,event_type,entity_type,entity_id,details)
    values($1,$2,'accepted_course_loaded','program',$3,$4)`,[markerId(program.id),actor.app_user_id,program.id,JSON.stringify({source_key:plan.source_key,source_hash:plan.source_hash,policy:plan.policy,links})]);
   return {...summary(plan,{state:'already_loaded',program_id:program.id,program_status:'draft'}),already_loaded:false};
  }),
 };
}
