import {randomUUID} from 'node:crypto';
// Existing append-only audit records hold requests and decisions; no schema change.
export async function examAttemptBudget(tx,enrollmentId){
 const events=(await tx.query("select * from public.training_events where enrollment_id=$1 and event_type in ('exam_extra_requested','exam_extra_approved','exam_extra_rejected') order by created_at,id",[enrollmentId])).rows;
 const requests=events.filter(row=>row.event_type==='exam_extra_requested');let extra=0;
 const projected=requests.map(request=>{
  const decisions=events.filter(row=>row.entity_id===request.entity_id&&row.event_type!=='exam_extra_requested');
  if(decisions.length>1)throw Error('Inconsistent attempt approval history');
  const decision=decisions[0],quantity=request.details.extra_attempts;
  if(!Number.isInteger(quantity)||quantity<1||quantity>10)throw Error('Inconsistent attempt request');
  if(decision?.event_type==='exam_extra_approved'){if(decision.details.extra_attempts!==quantity||!decision.actor_app_user_id)throw Error('Inconsistent attempt grant');extra+=quantity;}
  return {id:request.entity_id,enrollment_id:enrollmentId,extra_attempts:quantity,reason:request.details.reason,requested_by:request.actor_app_user_id,requested_at:request.created_at,status:decision?(decision.event_type==='exam_extra_approved'?'approved':'rejected'):'pending',review_notes:decision?.details.review_notes??null,reviewed_by:decision?.actor_app_user_id??null,reviewed_at:decision?.created_at??null};
 });
 const used=(await tx.query('select count(*)::integer as used from public.training_exam_attempts t join public.training_exam_assignments a on a.id=t.assignment_id where a.enrollment_id=$1',[enrollmentId])).rows[0].used;
 return {initial:3,approved_extra:extra,total:3+extra,used,remaining:Math.max(0,3+extra-used),requests:projected};
}
export function createAttemptApprovalOperations(run,{fields,text,uuid,fail,requireAdmin,requireWrite,enrollment,audit}){
 return {
  requestExtraAttempts:(token,body)=>run(token,async(tx,actor)=>{
   requireWrite(actor);fields(body,['enrollment_id','extra_attempts','reason']);const e=await enrollment(tx,actor,body.enrollment_id);
   if(!Number.isInteger(body.extra_attempts)||body.extra_attempts<1||body.extra_attempts>10)fail(400,'Request one to ten additional attempts');
   const reason=text(body.reason,2000),budget=await examAttemptBudget(tx,e.id);
   if(budget.requests.some(row=>row.status==='pending'))fail(409,'A request is already pending');
   if(budget.total+body.extra_attempts>100)fail(409,'Attempt allowance limit reached');
   const id=randomUUID();await audit(tx,actor,'exam_extra_requested','exam_attempt_request',id,e.id,{extra_attempts:body.extra_attempts,reason});return {id,status:'pending'};
  }),
  reviewExtraAttempts:(token,body)=>run(token,async(tx,actor)=>{
   requireAdmin(actor);fields(body,['enrollment_id','request_id','decision','review_notes']);const id=uuid(body.request_id);
   if(!['approved','rejected'].includes(body.decision))fail(400,'Explicit decision required');const notes=text(body.review_notes,2000);
   const e=await enrollment(tx,actor,body.enrollment_id),budget=await examAttemptBudget(tx,e.id),current=budget.requests.find(row=>row.id===id);
   if(!current||current.status!=='pending')fail(409,'Request already reviewed');
   await audit(tx,actor,body.decision==='approved'?'exam_extra_approved':'exam_extra_rejected','exam_attempt_request',id,e.id,{extra_attempts:current.extra_attempts,review_notes:notes});return {id,status:body.decision};
  }),
 };
}
