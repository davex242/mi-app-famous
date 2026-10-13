import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService,provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';
import { seedDemoProgram } from './demo-fixtures.mjs';
import { examTemplate } from './exam-template.mjs';

test('final quiz: immutable versions, scoped invitations, private correction and terminal attempts',async t=>{
 const db=await createIsolatedDatabase(),s=createTrainingService(db),server=createSandboxHttpServer(s);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const users={},tokens={},password='Only-synthetic-exam-password';
 const req=async(path,body,token)=>{const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 let v,e,issued,started,answers;
 const expiry=()=>new Date(Date.now()+86400000).toISOString();
 const publish=extra=>({exam_key:'Training DEMO',pass_percent:80,questions:examTemplate(),...extra});
 const issue=extra=>({enrollment_id:e.id,exam_version_id:v.id,max_attempts:2,expires_at:expiry(),...extra});
 try{
  for(const role of ['superadmin','subadmin','edit','readonly']){users[role]=await provisionSyntheticUser(db,role,password,role);tokens[role]=(await s.login({username:role,password})).token;}
  const other=await provisionSyntheticUser(db,'other',password,'edit');tokens.other=(await s.login({username:'other',password})).token;
  const demo=await seedDemoProgram(db,users.superadmin.app_user_id,users.edit.app_user_id);
  e=await s.enroll(tokens.edit,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'America/Costa_Rica'});
  await t.test('only administrators can obtain the editable DEMO template or publish',async()=>{
   assert.equal((await req('/api/exams/template',{},tokens.edit)).status,403);
   assert.equal((await req('/api/exams/template',{})).status,401);
   assert.equal((await req('/api/exams/template',{},tokens.subadmin)).body.questions.length,50);
   assert.equal((await req('/api/exams/publish',publish(),tokens.edit)).status,403);
  });
  await t.test('49 and 51 questions reject atomically',async()=>{
   for(const questions of [examTemplate().slice(0,49),[...examTemplate(),examTemplate()[0]]])assert.equal((await req('/api/exams/publish',publish({questions}),tokens.superadmin)).status,400);
   assert.equal((await db.query('select * from public.training_exam_versions')).rows.length,0);
  });
  await t.test('approval threshold is required, bounded and not client-defaulted',async()=>{
   for(const pass_percent of [undefined,0,-1,101,'80',80.001])assert.equal((await req('/api/exams/publish',publish({pass_percent}),tokens.superadmin)).status,400);
  });
  await t.test('malformed, duplicate and out-of-range keys reject',async()=>{
   for(const modify of [qs=>qs[0].correct_option=9,qs=>qs[0].options=['same','same'],qs=>qs[1].prompt=qs[0].prompt,qs=>qs[0].score=100]){
    const qs=examTemplate();modify(qs);assert.equal((await req('/api/exams/publish',publish({questions:qs}),tokens.superadmin)).status,400);
   }
   assert.equal((await db.query('select * from training_private.training_exam_keys')).rows.length,0);
  });
  await t.test('valid publication fixes exactly 50 questions and stores keys separately',async()=>{
   const r=await req('/api/exams/publish',publish(),tokens.subadmin);assert.equal(r.status,200);v=r.body;
   assert.equal(v.status,'published');assert.equal((await db.query('select * from public.training_exam_questions')).rows.length,50);
   assert.equal((await db.query('select * from training_private.training_exam_keys')).rows.length,50);
  });
  await t.test('new immutable version requires latest source and preserves previous content',async()=>{
   assert.equal((await req('/api/exams/publish',publish(),tokens.superadmin)).status,409);
   const qs=examTemplate();qs[0].prompt='DEMO versión nueva: ¿cómo preparas un live?';
   const r=await req('/api/exams/publish',publish({questions:qs,source_id:v.id,pass_percent:90}),tokens.superadmin);assert.equal(r.status,200);assert.equal(r.body.version,2);
   assert.equal((await db.query('select prompt from public.training_exam_questions where exam_version_id=$1 order by position',[v.id])).rows[0].prompt,examTemplate()[0].prompt);
   assert.equal((await req('/api/exams/publish',publish({source_id:v.id}),tokens.superadmin)).status,409);
  });
  await t.test('invitation scope, explicit retries and expiry are server-validated',async()=>{
   assert.equal((await req('/api/exams/issue',issue(),tokens.other)).status,404);
   assert.equal((await req('/api/exams/issue',issue(),tokens.readonly)).status,403);
   for(const extra of [{max_attempts:undefined},{max_attempts:0},{max_attempts:11},{expires_at:'2020-01-01T00:00:00Z'},{expires_at:new Date(Date.now()+31*86400000).toISOString()},{host_id:demo.host_id},{score_percent:100}])assert.equal((await req('/api/exams/issue',issue(extra),tokens.edit)).status,400);
  });
  await t.test('assigned recruiter issues opaque invitation; only hash is stored',async()=>{
   const r=await req('/api/exams/issue',issue(),tokens.edit);assert.equal(r.status,200);issued=r.body;
   assert.equal(issued.assignment.host_id,demo.host_id);assert.equal(issued.assignment.issued_by,users.edit.app_user_id);
   const stored=(await db.query('select token_hash from training_private.training_exam_tokens')).rows[0];assert.notEqual(stored.token_hash,issued.invitation_token);
   assert.equal((await req('/api/exams/issue',issue(),tokens.edit)).status,409);
  });
  await t.test('unknown invitations return uniform errors without data',async()=>{
   for(const token of [undefined,'A'.repeat(43)]){const r=await req('/api/quiz/status',{},token);assert.equal(r.status,404);assert.equal(r.body.error,'Invitation unavailable');}
  });
  await t.test('start is idempotent even for concurrent requests and contains no key',async()=>{
   const rs=await Promise.all([req('/api/quiz/start',{},issued.invitation_token),req('/api/quiz/start',{},issued.invitation_token)]);
   assert.ok(rs.every(r=>r.status===200));started=rs[0].body;assert.equal(rs[1].body.attempt_id,started.attempt_id);
   assert.equal(started.questions.length,50);assert.ok(!JSON.stringify(started).includes('correct_option'));assert.ok(!JSON.stringify(started).includes('host_id'));
   answers=started.questions.map((q,i)=>({question_id:q.id,selected_option:examTemplate()[i].correct_option}));
  });
  await t.test('submission rejects forged score, missing, duplicate, unrelated and invalid answers',async()=>{
   const body={attempt_id:started.attempt_id,answers};
   assert.equal((await req('/api/quiz/submit',{...body,passed:true},issued.invitation_token)).status,400);
   for(const bad of [answers.slice(1),answers.map((a,i)=>i===1?answers[0]:a),answers.map((a,i)=>i===0?{...a,selected_option:99}:a),answers.map((a,i)=>i===0?{...a,question_id:v.id}:a)])assert.equal((await req('/api/quiz/submit',{...body,answers:bad},issued.invitation_token)).status,400);
   assert.equal((await db.query('select * from training_private.training_exam_answers')).rows.length,0);
  });
  let firstAnswers;
  await t.test('private correction computes failing score and preserves historical attempt',async()=>{
   firstAnswers=answers.map((a,i)=>i<39?a:{...a,selected_option:(a.selected_option+1)%3});
   const r=await req('/api/quiz/submit',{attempt_id:started.attempt_id,answers:firstAnswers},issued.invitation_token);assert.equal(r.status,200);assert.equal(r.body.score_percent,78);assert.equal(r.body.passed,false);
   assert.ok(!JSON.stringify(r.body).includes('correct_option'));
   const again=await req('/api/quiz/submit',{attempt_id:started.attempt_id,answers:[...firstAnswers].reverse()},issued.invitation_token);assert.equal(again.body.already_submitted,true);
   assert.equal((await req('/api/quiz/submit',{attempt_id:started.attempt_id,answers},issued.invitation_token)).status,409);
  });
  await t.test('second attempt meets exact threshold; concurrent submit is idempotent',async()=>{
   const next=(await req('/api/quiz/start',{},issued.invitation_token)).body;
   assert.equal(next.attempt_number,2);assert.notEqual(next.attempt_id,started.attempt_id);
   const second=answers.map((a,i)=>i<40?a:{...a,selected_option:(a.selected_option+1)%3});
   const rs=await Promise.all([req('/api/quiz/submit',{attempt_id:next.attempt_id,answers:second},issued.invitation_token),req('/api/quiz/submit',{attempt_id:next.attempt_id,answers:second},issued.invitation_token)]);
   assert.ok(rs.every(r=>r.status===200&&r.body.score_percent===80&&r.body.passed));assert.ok(rs.some(r=>r.body.already_submitted));
   assert.equal((await req('/api/quiz/start',{},issued.invitation_token)).status,409);
   const status=(await req('/api/quiz/status',{},issued.invitation_token)).body;assert.equal(status.can_start,false);assert.equal(status.attempts.length,2);
  });
  await t.test('authorized staff see linked scores, never private answers or tokens',async()=>{
   const w=await s.workspace(tokens.edit);assert.equal(w.exam_assignments.length,1);assert.equal(w.exam_assignments[0].host_id,demo.host_id);assert.equal(w.exam_attempts.length,2);assert.equal(w.exam_attempts[1].passed,true);
   assert.ok(!JSON.stringify(w).includes('correct_option'));assert.ok(!JSON.stringify(w).includes('token_hash'));assert.ok(!JSON.stringify(w).includes(issued.invitation_token));
   assert.equal((await s.workspace(tokens.other)).exam_attempts.length,0);
   assert.equal((await db.query('select status from public.training_enrollments where id=$1',[e.id])).rows[0].status,'active');
  });
  await t.test('revocation immediately blocks result access and is audited idempotently',async()=>{
   assert.equal((await req('/api/exams/revoke',{assignment_id:issued.assignment.id},tokens.other)).status,404);
   for(let i=0;i<2;i++)assert.equal((await req('/api/exams/revoke',{assignment_id:issued.assignment.id},tokens.edit)).status,200);
   assert.equal((await req('/api/quiz/status',{},issued.invitation_token)).status,404);
   const events=(await db.query("select * from public.training_events where event_type='exam_revoked'")).rows;assert.equal(events.length,1);assert.equal(events[0].actor_app_user_id,users.edit.app_user_id);
  });
  await t.test('expiry after start blocks submit without storing answers',async()=>{
   issued=(await req('/api/exams/issue',issue({max_attempts:1}),tokens.superadmin)).body;
   started=(await req('/api/quiz/start',{},issued.invitation_token)).body;
   await db.query("update public.training_exam_assignments set expires_at=now()-interval '1 second' where id=$1",[issued.assignment.id]);
   assert.equal((await req('/api/quiz/submit',{attempt_id:started.attempt_id,answers},issued.invitation_token)).status,404);
   assert.equal((await db.query('select * from training_private.training_exam_answers where attempt_id=$1',[started.attempt_id])).rows.length,0);
  });
  await t.test('one failing attempt exhausts limit; old attempt cannot cross invitation',async()=>{
   issued=(await req('/api/exams/issue',issue({max_attempts:1}),tokens.superadmin)).body;
   assert.equal((await req('/api/quiz/submit',{attempt_id:started.attempt_id,answers},issued.invitation_token)).status,404);
   started=(await req('/api/quiz/start',{},issued.invitation_token)).body;
   const wrong=answers.map(a=>({...a,selected_option:(a.selected_option+1)%3}));
   assert.equal((await req('/api/quiz/submit',{attempt_id:started.attempt_id,answers:wrong},issued.invitation_token)).body.score_percent,0);
   assert.equal((await req('/api/quiz/start',{},issued.invitation_token)).status,409);
  });
  await t.test('paused enrollment disables an existing invitation',async()=>{
   issued=(await req('/api/exams/issue',issue(),tokens.superadmin)).body;
   await db.query("update public.training_enrollments set status='paused' where id=$1",[e.id]);
   assert.equal((await req('/api/quiz/status',{},issued.invitation_token)).status,404);
   assert.equal((await req('/api/exams/issue',issue(),tokens.superadmin)).status,409);
  });
  await t.test('public submissions audit bearer access without pretending an admin acted',async()=>{
   const rows=(await db.query("select * from public.training_events where event_type='exam_submitted'")).rows;assert.equal(rows.length,3);
   assert.ok(rows.every(r=>r.actor_app_user_id===null&&r.details.identity==='invitation bearer'));
  });
  await t.test('quiz assets do not expose server modules or keys and use no-referrer',async()=>{
   for(const path of ['/quiz','/quiz.mjs','/exams-ui.mjs']){const r=await fetch(url+path);assert.equal(r.status,200);assert.equal(r.headers.get('referrer-policy'),'no-referrer');}
   for(const path of ['/exams.mjs','/exam-template.mjs'])assert.equal((await fetch(url+path)).status,404);
  });
 }finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
