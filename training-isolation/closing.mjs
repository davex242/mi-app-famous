import { createHash } from 'node:crypto';
import { effectiveItemId,updateHistory,currentProgress } from './updates.mjs';
import {loadEvidenceImage,evidenceMetadata} from './evidence-files.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function scopedClosingRecords(tx,actor,admin) {
  return (await tx.query(`select ev.id,ev.enrollment_id,ev.actor_app_user_id,ev.created_at,ev.details
    from public.training_events ev join public.training_enrollments e on e.id=ev.enrollment_id
    join training_private.training_host_assignments h on h.host_id=e.host_id
    where ev.event_type='training_completed' and ($1::boolean or h.recruiter_id=$2)
    order by ev.created_at,ev.id`,[admin(actor),actor.app_user_id])).rows;
}
export async function scopedExamIssuances(tx,actor,admin) {
  return (await tx.query(`select ev.entity_id as assignment_id,ev.details->>'program_version_id' as program_version_id
    from public.training_events ev join public.training_exam_assignments a on a.id=ev.entity_id
    join training_private.training_host_assignments h on h.host_id=a.host_id
    where ev.event_type='exam_issued' and ev.entity_type='exam_assignment'
      and ($1::boolean or h.recruiter_id=$2)`,[admin(actor),actor.app_user_id])).rows;
}

export function createClosingOperations(run,{fields,text,uuid,fail,requireAdmin,enrollment,audit}) {
  async function inspect(tx,actor,body) {
    const e=await enrollment(tx,actor,uuid(body.enrollment_id),false);
    const program=(await tx.query('select * from public.training_program_versions where id=$1',[e.program_version_id])).rows[0];
    const items=(await tx.query('select * from public.training_program_items where program_version_id=$1 order by day,position',[program.id])).rows;
    const completions=(await tx.query('select * from public.training_completions where enrollment_id=$1 order by item_id',[e.id])).rows;
    const sessions=(await tx.query('select * from public.training_sessions where enrollment_id=$1 order by id',[e.id])).rows;
    const history=await updateHistory(tx,e.id);
    const evidence=(await tx.query("select * from public.training_evidence where enrollment_id=$1 and status='approved' order by id",[e.id])).rows;
    const assessments=(await tx.query('select * from public.training_assessments where enrollment_id=$1 order by assessed_at desc,id desc',[e.id])).rows;
    const checks=[];
    for(const item of items){
      const credit=completions.find(c=>c.item_id===item.id);
      const source=sessions.find(s=>s.status==='completed'&&effectiveItemId(s.item_id,history,items)===item.id&&s.topic_id===item.topic_id);
      const proof=source&&evidence.find(p=>p.session_id===source.id&&p.topic_id===item.topic_id);
      const image=proof?await loadEvidenceImage(tx,proof,fail):null;
      const assessment=assessments.find(a=>a.topic_id===item.topic_id);
      const problems=[];
      if(!credit)problems.push('validation_missing');
      if(!source)problems.push('completed_session_missing');
      if(item.evidence_required&&!proof)problems.push('approved_evidence_missing');
      if(item.assessment_required&&assessment?.passed!==true)problems.push('passing_assessment_missing');
      checks.push({item_id:item.id,topic_id:item.topic_id,day:item.day,ready:!problems.length,problems,
        ...(image?{evidence_attachment:evidenceMetadata(image)}:{}),
        completion:credit||null,session_id:source?.id||null,evidence_id:proof?.id||null,
        assessment:assessment?{id:assessment.id,passed:assessment.passed,score:assessment.score,assessed_by:assessment.assessed_by,assessed_at:assessment.assessed_at}:null});
    }
    let quiz={attempt_id:null,ready:false,problems:['verified_passing_quiz_missing'],score_percent:null,pass_percent:null};
    if(body.attempt_id!==undefined){
    const attempt=(await tx.query(`select t.id,t.assignment_id,t.attempt_number,t.submitted_at,t.score_percent,t.passed,
      a.host_id,a.enrollment_id,a.exam_version_id,v.pass_percent,v.status as exam_status,v.exam_key,v.version
      from public.training_exam_attempts t join public.training_exam_assignments a on a.id=t.assignment_id
      join public.training_exam_versions v on v.id=a.exam_version_id where t.id=$1 and a.enrollment_id=$2 and a.host_id=$3`,[uuid(body.attempt_id),e.id,e.host_id])).rows[0];
    if(!attempt)fail(404,'Record unavailable');
    const issued=(await tx.query("select details->>'program_version_id' as program_version_id from public.training_events where event_type='exam_issued' and entity_type='exam_assignment' and entity_id=$1 and enrollment_id=$2 order by id limit 1",[attempt.assignment_id,e.id])).rows[0];
    const questions=(await tx.query(`select q.id,q.options,k.correct_option from public.training_exam_questions q
      left join training_private.training_exam_keys k on k.question_id=q.id where q.exam_version_id=$1 order by q.position`,[attempt.exam_version_id])).rows;
    const answers=(await tx.query('select question_id,selected_option from training_private.training_exam_answers where attempt_id=$1',[attempt.id])).rows;
    const valid=questions.length===50&&answers.length===50&&questions.every(q=>{
      const answer=answers.find(a=>a.question_id===q.id);
      return answer&&Number.isInteger(q.correct_option)&&q.correct_option>=0&&q.correct_option<q.options.length&&answer.selected_option>=0&&answer.selected_option<q.options.length;
    });
    const recomputed=valid?answers.filter(a=>questions.some(q=>q.id===a.question_id&&q.correct_option===a.selected_option)).length*2:null;
    const quizProblems=[];
    if(issued?.program_version_id!==program.id)quizProblems.push('quiz_program_version_mismatch');
    if(!valid||!attempt.submitted_at||attempt.passed!==true||Number(attempt.score_percent)!==recomputed||recomputed<Number(attempt.pass_percent)||attempt.exam_status!=='published')quizProblems.push('verified_passing_quiz_missing');
    quiz={attempt_id:attempt.id,assignment_id:attempt.assignment_id,exam_version_id:attempt.exam_version_id,
      exam_key:attempt.exam_key,exam_version:attempt.version,program_version_id:issued?.program_version_id||null,
      submitted_at:attempt.submitted_at,score_percent:attempt.score_percent===null?null:Number(attempt.score_percent),
      pass_percent:Number(attempt.pass_percent),ready:!quizProblems.length,problems:quizProblems};
    }
    const problems=[];
    if(e.status!=='active')problems.push('active_enrollment_required');
    if(!items.length||program.status!=='published')problems.push('published_program_required');
    if(checks.some(c=>!c.ready))problems.push('practices_pending');
    if(!quiz.ready)problems.push('quiz_pending');
    const progress=await currentProgress(tx,e);
    const snapshot={enrollment_id:e.id,host_id:e.host_id,program_version_id:program.id,program_title:program.title,program_version:program.version,
      enrollment_status:e.status,progress,checks,quiz,ready:!problems.length,problems};
    return {...snapshot,preview_hash:digest(snapshot)};
  }
  return {
    previewClosing:(token,body)=>run(token,async(tx,actor)=>{fields(body,['enrollment_id','attempt_id']);return {preview:true,...await inspect(tx,actor,body)};}),
    completeTraining:(token,body)=>run(token,async(tx,actor)=>{
      requireAdmin(actor);fields(body,['enrollment_id','attempt_id','expected_program_version_id','preview_hash','notes']);
      uuid(body.enrollment_id);uuid(body.attempt_id);uuid(body.expected_program_version_id);
      const notes=text(body.notes,2000);
      if(typeof body.preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.preview_hash))fail(400,'Preview hash required');
      const e=await enrollment(tx,actor,body.enrollment_id,false);
      const requestHash=digest({enrollment_id:body.enrollment_id,attempt_id:body.attempt_id,expected_program_version_id:body.expected_program_version_id,preview_hash:body.preview_hash,notes});
      if(e.status==='completed'){
        const record=(await tx.query("select id,actor_app_user_id,created_at,details from public.training_events where enrollment_id=$1 and event_type='training_completed' order by id limit 1",[e.id])).rows[0];
        if(record?.details.request_hash===requestHash)return {already_completed:true,record};
        fail(409,'Training is already closed; its record cannot change');
      }
      if(e.program_version_id!==body.expected_program_version_id)fail(409,'Enrollment version changed; preview again');
      const preview=await inspect(tx,actor,body);
      if(preview.preview_hash!==body.preview_hash)fail(409,'Closing requirements changed; review again');
      if(!preview.ready)fail(409,'Training requirements are incomplete');
      await tx.query("update public.training_enrollments set status='completed',completed_at=now() where id=$1",[e.id]);
      await audit(tx,actor,'training_completed','enrollment',e.id,e.id,{request_hash:requestHash,notes,snapshot:preview});
      const record=(await tx.query("select id,actor_app_user_id,created_at,details from public.training_events where enrollment_id=$1 and event_type='training_completed' order by id limit 1",[e.id])).rows[0];
      return {already_completed:false,record};
    }),
  };
}
