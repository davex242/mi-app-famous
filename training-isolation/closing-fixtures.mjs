import {seedDemoProgram} from './demo-fixtures.mjs';
import {examTemplate} from './exam-template.mjs';

// Synthetic QA only: all meaningful training mutations use the real service.
export async function seedClosingScenario(db,service,tokens,{validated=1,demo:existingDemo=null,proofImageBase64=null,proofPDFBase64=null,proofVideoBase64=null}={}) {
  const administrator=await service.me(tokens.admin),recruiter=await service.me(tokens.recruiter);
  const demo=existingDemo||await seedDemoProgram(db,administrator.app_user_id,recruiter.app_user_id);
  const topics=[];
  for(let i=1;i<=2;i++){
    const topic=await service.saveTopic(tokens.admin,{title:`DEMO cierre · práctica ${i}`,description:'Práctica supervisada DEMO',category:'DEMO',estimated_minutes:10});
    await service.publishTopic(tokens.admin,{id:topic.id});topics.push(topic);
  }
  const program=await service.saveProgram(tokens.admin,{title:'DEMO · Entrenamiento supervisado',duration_days:2,changelog:'Programa para revisar cierre',items:topics.map((t,i)=>({day:i+1,topic_id:t.id,notes:`DEMO práctica ${i+1}`,material_ids:[]}))});
  await service.publishProgram(tokens.admin,{id:program.id});
  const e=await service.enroll(tokens.recruiter,{host_id:demo.host_id,program_version_id:program.id,timezone:'America/Costa_Rica'});
  const items=(await db.query('select * from public.training_program_items where program_version_id=$1 order by day',[program.id])).rows;
  const sessions=[];
  for(let i=0;i<items.length;i++){
    const session=await service.schedule(tokens.recruiter,{enrollment_id:e.id,item_id:items[i].id,scheduled_at:`2026-11-0${i+1}T01:00:00Z`,duration_minutes:10});
    const proof=await service.submitEvidence(tokens.recruiter,{session_id:session.id,description:'DEMO evidencia de práctica supervisada',...(proofVideoBase64?{video_base64:proofVideoBase64,consent_confirmed:true}:proofPDFBase64?{pdf_base64:proofPDFBase64,consent_confirmed:true}:proofImageBase64?{image_base64:proofImageBase64,consent_confirmed:true}:{})});
    await service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'approved',notes:'DEMO evidencia verificada'});
    await service.assess(tokens.admin,{session_id:session.id,score:90,passed:true,notes:'DEMO evaluación satisfactoria'});
    if(i<validated)await service.completeItem(tokens.admin,{session_id:session.id});
    sessions.push(session);
  }
  const exam=await service.publishExam(tokens.admin,{exam_key:'DEMO evaluación de cierre',pass_percent:80,questions:examTemplate()});
  async function passQuiz(){
    const issued=await service.issueExam(tokens.recruiter,{enrollment_id:e.id,exam_version_id:exam.id,max_attempts:2,expires_at:new Date(Date.now()+86400000).toISOString()});
    const attempt=await service.startExam(issued.invitation_token,{});
    const result=await service.submitExam(issued.invitation_token,{attempt_id:attempt.attempt_id,answers:attempt.questions.map((q,i)=>({question_id:q.id,selected_option:examTemplate()[i].correct_option}))});
    return {issued,attempt,result};
  }
  const quiz=await passQuiz();
  return {e,program,topics,items,sessions,exam,quiz,passQuiz};
}
