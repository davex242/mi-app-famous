import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';

test('administrative closing: complete requirements, exact quiz version and immutable outcome',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),users={},tokens={};let server,scenario,preview,body,record;
 const password='Synthetic-only-closing-password';
 try{
  for(const [name,role] of [['admin','superadmin'],['sub','subadmin'],['recruiter','edit'],['other','edit'],['read','readonly']]){users[name]=await provisionSyntheticUser(db,name,password,role);tokens[name]=(await service.login({username:name,password})).token;}
  scenario=await seedClosingScenario(db,service,tokens);
  const review=()=>({enrollment_id:scenario.e.id,attempt_id:scenario.quiz.attempt.attempt_id});
  const confirm=p=>({enrollment_id:p.enrollment_id,attempt_id:p.quiz.attempt_id,expected_program_version_id:p.program_version_id,preview_hash:p.preview_hash,notes:'DEMO revisión final y plan de mejora'});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,body,token)=>{const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
  await t.test('absent identity and unrelated recruiter cannot review an enrollment',async()=>{
   assert.equal((await call('/api/training/closing-preview',review())).status,401);
   assert.equal((await call('/api/training/closing-preview',review(),tokens.other)).status,404);
  });
  await t.test('preview reports missing practical validation without writes or answer keys',async()=>{
   const count=(await db.query('select count(*)::int n from public.training_events')).rows[0].n;
   preview=await service.previewClosing(tokens.recruiter,review());assert.equal(preview.ready,false);assert.equal(preview.progress.percent,50);assert.equal(preview.quiz.ready,true);
   assert.ok(preview.checks[1].problems.includes('validation_missing'));assert.equal((await db.query('select count(*)::int n from public.training_events')).rows[0].n,count);
   assert.ok(!JSON.stringify(preview).includes('correct_option'));assert.ok(!JSON.stringify(preview).includes('selected_option'));
  });
  await t.test('review works before any quiz is selected and does not waive it',async()=>{
   const p=await service.previewClosing(tokens.admin,{enrollment_id:scenario.e.id});assert.equal(p.quiz.ready,false);assert.equal(p.quiz.attempt_id,null);assert.equal(p.ready,false);
  });
  await t.test('recruiter and readonly cannot close; incomplete requirements deny even an admin',async()=>{
   body=confirm(preview);assert.equal((await call('/api/training/complete',body,tokens.recruiter)).status,403);
   assert.equal((await call('/api/training/complete',body,tokens.read)).status,403);assert.equal((await call('/api/training/complete',body,tokens.admin)).status,409);
   assert.equal((await db.query('select status from public.training_enrollments where id=$1',[scenario.e.id])).rows[0].status,'active');
  });
  await t.test('100 percent alone cannot bypass a missing completed session',async()=>{
   await db.query('insert into public.training_completions(enrollment_id,item_id,validated_by) values($1,$2,$3)',[scenario.e.id,scenario.items[1].id,users.admin.app_user_id]);
   const p=await service.previewClosing(tokens.admin,review());assert.equal(p.progress.percent,100);assert.equal(p.ready,false);assert.ok(p.checks[1].problems.includes('completed_session_missing'));
   await db.query('delete from public.training_completions where enrollment_id=$1 and item_id=$2',[scenario.e.id,scenario.items[1].id]);
  });
  await t.test('two validated practices plus privately verified quiz become eligible',async()=>{
   await service.completeItem(tokens.sub,{session_id:scenario.sessions[1].id});preview=await service.previewClosing(tokens.admin,review());assert.equal(preview.ready,true);assert.equal(preview.progress.percent,100);body=confirm(preview);
  });
  await t.test('a later failing assessment blocks closing even when progress remains 100 percent',async()=>{
   await service.assess(tokens.admin,{session_id:scenario.sessions[1].id,score:20,passed:false,notes:'DEMO mejora requerida'});
   const p=await service.previewClosing(tokens.admin,review());assert.equal(p.progress.percent,100);assert.equal(p.ready,false);assert.ok(p.checks[1].problems.includes('passing_assessment_missing'));
   assert.equal((await call('/api/training/complete',confirm(p),tokens.admin)).status,409);
   await service.assess(tokens.admin,{session_id:scenario.sessions[1].id,score:90,passed:true,notes:'DEMO mejora revisada'});preview=await service.previewClosing(tokens.admin,review());body=confirm(preview);
  });
  await t.test('a declared passing score without all private answers cannot authorize closing',async()=>{
   const answer=(await db.query('select * from training_private.training_exam_answers where attempt_id=$1 limit 1',[scenario.quiz.attempt.attempt_id])).rows[0];
   await db.query('delete from training_private.training_exam_answers where attempt_id=$1 and question_id=$2',[answer.attempt_id,answer.question_id]);
   const p=await service.previewClosing(tokens.admin,review());assert.equal(p.quiz.score_percent,100);assert.equal(p.quiz.ready,false);assert.ok(p.quiz.problems.includes('verified_passing_quiz_missing'));
   await db.query('insert into training_private.training_exam_answers(attempt_id,question_id,selected_option) values($1,$2,$3)',[answer.attempt_id,answer.question_id,answer.selected_option]);
  });
  await t.test('forged status, score, actor and missing preview are rejected',async()=>{
   for(const extra of [{status:'completed'},{score_percent:100},{actor_app_user_id:users.other.app_user_id},{preview_hash:'wrong'}])assert.equal((await call('/api/training/complete',{...body,...extra},tokens.admin)).status,400);
   assert.equal((await call('/api/training/closing-preview',{...review(),attempt_id:randomUUID()},tokens.admin)).status,404);
  });
  await t.test('legacy quizzes without a recorded program version do not silently authorize closure',async()=>{
   await db.query("update public.training_events set details=details-'program_version_id' where event_type='exam_issued' and entity_id=$1",[scenario.quiz.issued.assignment.id]);
   const p=await service.previewClosing(tokens.admin,review());assert.equal(p.quiz.ready,false);assert.ok(p.quiz.problems.includes('quiz_program_version_mismatch'));
   await db.query("update public.training_events set details=details||jsonb_build_object('program_version_id',$1::text) where event_type='exam_issued' and entity_id=$2",[scenario.program.id,scenario.quiz.issued.assignment.id]);
  });
  await t.test('a new passing assessment still invalidates a previously reviewed snapshot',async()=>{
   await service.assess(tokens.sub,{session_id:scenario.sessions[1].id,score:95,passed:true,notes:'DEMO nueva revisión'});
   assert.equal((await call('/api/training/complete',body,tokens.admin)).status,409);preview=await service.previewClosing(tokens.admin,review());assert.equal(preview.ready,true);body=confirm(preview);
  });
  await t.test('paused enrollment cannot close',async()=>{
   await db.query("update public.training_enrollments set status='paused' where id=$1",[scenario.e.id]);
   const p=await service.previewClosing(tokens.admin,review());assert.equal(p.ready,false);assert.ok(p.problems.includes('active_enrollment_required'));
   assert.equal((await call('/api/training/complete',confirm(p),tokens.admin)).status,409);await db.query("update public.training_enrollments set status='active' where id=$1",[scenario.e.id]);
  });
  await t.test('equivalent program update preserves practice credit but requires a quiz for the new version',async()=>{
   const next=await service.saveProgram(tokens.admin,{source_id:scenario.program.id,title:'DEMO cierre actualizado',duration_days:2,changelog:'DEMO misma práctica',items:scenario.items.map(i=>({day:i.day,topic_id:i.topic_id,notes:i.notes,material_ids:[]}))});await service.publishProgram(tokens.admin,{id:next.id});
   const update=await service.previewUpdate(tokens.recruiter,{enrollment_id:scenario.e.id,to_version_id:next.id});await service.acceptUpdate(tokens.recruiter,{enrollment_id:scenario.e.id,to_version_id:next.id,expected_from_version_id:scenario.program.id,preview_hash:update.preview_hash});
   const p=await service.previewClosing(tokens.admin,review());assert.equal(p.progress.percent,100);assert.ok(p.checks.every(c=>c.ready));assert.equal(p.quiz.ready,false);
   assert.equal((await call('/api/training/complete',body,tokens.admin)).status,409);
   scenario.program=next;scenario.quiz=await scenario.passQuiz();preview=await service.previewClosing(tokens.admin,review());assert.equal(preview.ready,true);body=confirm(preview);
  });
  await t.test('revoking an invitation does not erase a verified historical passing result',async()=>{
   await service.revokeExam(tokens.admin,{assignment_id:scenario.quiz.issued.assignment.id});preview=await service.previewClosing(tokens.admin,review());assert.equal(preview.quiz.ready,true);body=confirm(preview);
  });
  await t.test('concurrent administrative confirmation closes once and records its verified actor',async()=>{
   const results=await Promise.all([service.completeTraining(tokens.sub,body),service.completeTraining(tokens.admin,body)]);
   assert.equal(results.filter(r=>!r.already_completed).length,1);assert.equal(results[0].record.id,results[1].record.id);record=results[0].record;
   const rows=(await db.query("select * from public.training_events where event_type='training_completed'")).rows;assert.equal(rows.length,1);assert.ok([users.admin.app_user_id,users.sub.app_user_id].includes(rows[0].actor_app_user_id));
   const e=(await db.query('select * from public.training_enrollments where id=$1',[scenario.e.id])).rows[0];assert.equal(e.status,'completed');assert.ok(e.completed_at);assert.equal(record.details.snapshot.progress.percent,100);
  });
  await t.test('idempotent replay accepts reordered fields, but the stored conclusion cannot change',async()=>{
   const reordered=Object.fromEntries(Object.entries(body).reverse());assert.equal((await service.completeTraining(tokens.admin,reordered)).already_completed,true);
   assert.equal((await call('/api/training/complete',{...body,notes:'Altered conclusion'},tokens.admin)).status,409);
  });
  await t.test('closed enrollment rejects new practice writes, updates and public quiz access',async()=>{
   await assert.rejects(()=>service.submitEvidence(tokens.recruiter,{session_id:scenario.sessions[0].id,description:'Cannot change completed training'}),e=>e.status===409);
   await assert.rejects(()=>service.examStatus(scenario.quiz.issued.invitation_token,{}),e=>e.status===404);
   await assert.rejects(()=>service.previewUpdate(tokens.recruiter,{enrollment_id:scenario.e.id,to_version_id:scenario.program.id}),e=>e.status===409);
  });
  await t.test('assigned staff can read the immutable record; unrelated staff cannot',async()=>{
   assert.equal((await service.workspace(tokens.recruiter)).closing_records[0].id,record.id);assert.equal((await service.workspace(tokens.other)).closing_records.length,0);
   await db.query('update training_private.training_host_assignments set recruiter_id=$1 where host_id=$2',[users.read.app_user_id,scenario.e.host_id]);
   assert.equal((await service.workspace(tokens.recruiter)).closing_records.length,0);assert.equal((await service.workspace(tokens.read)).closing_records[0].id,record.id);
  });
  await t.test('future program versions and new enrollments do not rewrite the old closing snapshot',async()=>{
   const before=JSON.stringify((await service.workspace(tokens.admin)).closing_records);
   const newer=await service.saveProgram(tokens.admin,{source_id:scenario.program.id,title:'DEMO versión futura',duration_days:3,changelog:'DEMO requisito nuevo',items:[...scenario.items.map(i=>({day:i.day,topic_id:i.topic_id,notes:i.notes,material_ids:[]})),{day:3,topic_id:scenario.items[0].topic_id,notes:'DEMO nueva práctica',material_ids:[]}]});await service.publishProgram(tokens.admin,{id:newer.id});
   const e=await service.enroll(tokens.admin,{host_id:scenario.e.host_id,program_version_id:newer.id,timezone:'America/Costa_Rica'});
   assert.equal(JSON.stringify((await service.workspace(tokens.admin)).closing_records),before);
   assert.equal((await call('/api/training/closing-preview',{enrollment_id:e.id,attempt_id:scenario.quiz.attempt.attempt_id},tokens.admin)).status,404);
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
