import test from 'node:test';
import assert from 'node:assert/strict';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {imageFixture} from './image-fixtures.mjs';
import {examTemplate} from './exam-template.mjs';
import {createSandboxHttpServer} from './server.mjs';

test('FICTITIOUS: 50 hosts, five trainers, three 14-day courses, enrollment isolation and variable grading over HTTP',async t=>{
 const db=await createIsolatedDatabase(),s=createTrainingService(db),server=createSandboxHttpServer(s);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`,password='FICTITIOUS-only-training-test-password';
 const call=async(path,body,token)=>{
  const send=()=>fetch(url+path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});
  let r=await send();
  if(r.status===429){
   assert.equal((await r.json()).error,'Try again later');
   t.diagnostic('Honoring the sandbox 200-request/minute limit before retrying the unprocessed operation.');
   await new Promise(resolve=>setTimeout(resolve,30000));await new Promise(resolve=>setTimeout(resolve,30000));r=await send();
  }
  return {status:r.status,body:await r.json()};
 };
 const ok=async(path,body,token)=>{const r=await call(path,body,token);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 try{
  const admin=await provisionSyntheticUser(db,'FICTITIOUS-admin',password,'superadmin');
  const at=(await s.login({username:'FICTITIOUS-admin',password})).token;
  const trainers=[];
  for(let i=0;i<5;i++){const username=`FICTITIOUS-trainer-${i}`,u=await provisionSyntheticUser(db,username,password,'edit');trainers.push({...u,token:(await s.login({username,password})).token});}
  const programs=[];
  for(let i=0;i<3;i++)programs.push(await seedDemoProgram(db,admin.app_user_id,trainers[i].app_user_id,`FICTITIOUS-course-${i}`));
  const hosts=programs.map(p=>p.host_id);
  for(let i=3;i<50;i++){
   const id=`feed0000-0000-4000-8000-${String(i).padStart(12,'0')}`;
   await db.query('insert into public.hosts(id) values($1)',[id]);
   await db.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)',[id,trainers[i%5].app_user_id,admin.app_user_id]);hosts.push(id);
  }
  const enrollments=[];
  for(let i=0;i<50;i++)enrollments.push(await ok('/api/enrollments',{host_id:hosts[i],program_version_id:programs[i%3].program_version_id,timezone:'America/Costa_Rica'},trainers[i%5].token));
  // The first three demo hosts have the corresponding first three trainers.
  let e={...enrollments[0]};const original=trainers[0],next=trainers[1];
  const second=await ok('/api/enrollments',{host_id:e.host_id,program_version_id:programs[1].program_version_id,timezone:'America/Costa_Rica'},original.token);
  await t.test('duplicate enrollment rejects; trainer cannot transfer; admin transfer preserves original host recruiter',async()=>{
   assert.equal((await call('/api/enrollments',{host_id:e.host_id,program_version_id:programs[0].program_version_id,timezone:'UTC'},original.token)).status,409);
   assert.equal((await call('/api/enrollments/reassign',{enrollment_id:e.id,trainer_id:next.app_user_id},original.token)).status,403);
   const before=await ok('/api/exams/publish',{exam_key:'FICTITIOUS-before-transfer',pass_percent:75,questions:examTemplate()},at);
   const priorInvitation=await ok('/api/exams/issue',{enrollment_id:e.id,exam_version_id:before.id,max_attempts:3},original.token);
   await ok('/api/enrollments/reassign',{enrollment_id:e.id,trainer_id:next.app_user_id},at);
   assert.equal((await db.query('select recruiter_id from training_private.training_host_assignments where host_id=$1',[e.host_id])).rows[0].recruiter_id,original.app_user_id);
   assert.equal((await s.workspace(original.token)).enrollments.some(x=>x.id===e.id),false);
   assert.equal((await s.workspace(original.token)).enrollments.some(x=>x.id===second.id),true);
   assert.equal((await s.workspace(next.token)).enrollments.some(x=>x.id===e.id),true);
   assert.equal((await s.workspace(next.token)).enrollments.some(x=>x.id===second.id),false);
   assert.equal((await s.workspace(original.token)).exam_assignments.some(x=>x.id===priorInvitation.assignment.id),false);
   assert.equal((await s.workspace(next.token)).exam_assignments.some(x=>x.id===priorInvitation.assignment.id),true);
   assert.equal((await call('/api/exams/revoke',{assignment_id:priorInvitation.assignment.id},original.token)).status,404);
   await ok('/api/exams/revoke',{assignment_id:priorInvitation.assignment.id},next.token);
  });
  for(const n of [10,25,50])await t.test(`${n} questions: full HTTP publication, scoring below/above 75%, immutable retry, revocation scope`,async()=>{
   const bank=examTemplate().slice(0,n);
   const v=await ok('/api/exams/publish',{exam_key:`FICTITIOUS-${n}`,pass_percent:75,questions:bank},at);
   assert.equal(v.question_count,n);
   assert.equal((await call('/api/exams/issue',{enrollment_id:e.id,exam_version_id:v.id,max_attempts:3},original.token)).status,404);
   const issued=await ok('/api/exams/issue',{enrollment_id:e.id,exam_version_id:v.id,max_attempts:3},next.token);
   assert.equal((await s.workspace(original.token)).exam_assignments.some(x=>x.id===issued.assignment.id),false);
   assert.equal((await s.workspace(next.token)).exam_assignments.some(x=>x.id===issued.assignment.id),true);
   assert.equal((await call('/api/exams/revoke',{assignment_id:issued.assignment.id},original.token)).status,404);
   assert.equal((await ok('/api/quiz/status',{},issued.invitation_token)).question_count,n);
   const start=await ok('/api/quiz/start',{},issued.invitation_token);
   const correct=Math.ceil(.75*n)-1;
   const answers=start.questions.map((q,i)=>({question_id:q.id,selected_option:i<correct?bank[i].correct_option:(bank[i].correct_option+1)%bank[i].options.length}));
   const result=await ok('/api/quiz/submit',{attempt_id:start.attempt_id,answers},issued.invitation_token);
   assert.equal(result.score_percent,correct*100/n);assert.equal(result.passed,false);
   assert.equal((await ok('/api/quiz/submit',{attempt_id:start.attempt_id,answers},issued.invitation_token)).already_submitted,true);
   const passing=await ok('/api/quiz/start',{},issued.invitation_token);
   const passCount=Math.ceil(.75*n);
   const passed=await ok('/api/quiz/submit',{attempt_id:passing.attempt_id,answers:passing.questions.map((q,i)=>({question_id:q.id,selected_option:i<passCount?bank[i].correct_option:(bank[i].correct_option+1)%bank[i].options.length}))},issued.invitation_token);
   assert.equal(passed.score_percent,passCount*100/n);assert.equal(passed.passed,true);
   await ok('/api/exams/revoke',{assignment_id:issued.assignment.id},next.token);
   assert.equal((await call('/api/quiz/status',{},issued.invitation_token)).status,404);
   // Each size is an independent grading scenario; use a different enrollment's budget next.
   if(n!==50){const fresh=enrollments[n===10?1:2];e.id=fresh.id;await ok('/api/enrollments/reassign',{enrollment_id:e.id,trainer_id:next.app_user_id},at);}
  });
  await t.test('30 attendance operations: 28 successes, two unauthorized errors; retry rejects stale edits',async()=>{
   const sessions=[];
   for(let i=0;i<30;i++){
    const row=enrollments[i];
    sessions.push(await ok('/api/sessions',{enrollment_id:row.id,item_id:programs[i%3].item_ids[0],scheduled_at:'2026-10-15T12:00:00Z',duration_minutes:30},at));
   }
   const results=[];
   for(let i=0;i<30;i++)results.push(await call('/api/attendance',{session_id:sessions[i].id,status:'present',expected_recorded_at:null},i<2?trainers[4].token:at));
   assert.equal(results.filter(r=>r.status===200).length,28);
   assert.equal(results.filter(r=>r.status===404).length,2);
   for(let i=0;i<2;i++)await ok('/api/attendance',{session_id:sessions[i].id,status:'present',expected_recorded_at:null},at);
   assert.equal((await db.query('select count(*)::int n from public.training_attendance')).rows[0].n,30);
   assert.equal((await call('/api/attendance',{session_id:sessions[2].id,status:'absent',expected_recorded_at:null},at)).status,409);
   // Establish a completed synthetic practice as a prerequisite; all quiz actions still use authenticated HTTP.
   await db.query("update public.training_sessions set status='completed' where id=$1",[sessions[0].id]);
   const bank=examTemplate().slice(0,10),sessionId=sessions[0].id;
   const v=await ok('/api/exams/publish',{exam_key:`session-${sessionId}`,pass_percent:75,questions:bank},at);
   assert.equal((await call('/api/exams/issue',{enrollment_id:enrollments[2].id,exam_version_id:v.id,max_attempts:3},at)).status,409);
   const before=(await s.workspace(at)).exam_attempt_budgets.find(b=>b.enrollment_id===enrollments[0].id).used;
   const issued=await ok('/api/exams/issue',{enrollment_id:enrollments[0].id,exam_version_id:v.id,max_attempts:3},at);
   const start=await ok('/api/quiz/start',{},issued.invitation_token);
   await ok('/api/quiz/submit',{attempt_id:start.attempt_id,answers:start.questions.map((q,i)=>({question_id:q.id,selected_option:bank[i].correct_option}))},issued.invitation_token);
   const after=(await s.workspace(at)).exam_attempt_budgets.find(b=>b.enrollment_id===enrollments[0].id).used;
   assert.equal(after,before);
  });
  await t.test('bulk evidence and invitations preserve 28 successes when two entries fail scope',async()=>{
   const version=(await s.workspace(at)).exams.find(x=>x.question_count===25);
   const invitations=[];
   for(let i=0;i<30;i++)invitations.push(await call('/api/exams/issue',{enrollment_id:enrollments[i].id,exam_version_id:version.id,max_attempts:3},i<2?trainers[4].token:at));
   assert.equal(invitations.filter(x=>x.status===200).length,28);assert.equal(invitations.filter(x=>x.status===404).length,2);
   for(let i=0;i<2;i++)await ok('/api/exams/issue',{enrollment_id:enrollments[i].id,exam_version_id:version.id,max_attempts:3},at);
   assert.equal((await call('/api/exams/issue',{enrollment_id:enrollments[2].id,exam_version_id:version.id,max_attempts:3},at)).status,409);
   const image=imageFixture({width:2,height:2}).toString('base64'),proofs=[];
   for(let i=0;i<30;i++){
    const session=await ok('/api/sessions',{enrollment_id:enrollments[i].id,item_id:programs[i%3].item_ids[1],scheduled_at:'2026-10-16T12:00:00Z',duration_minutes:30},at);
    const body={session_id:session.id,description:'FICTITIOUS bulk proof',image_base64:image,consent_confirmed:true};
    const result=await call('/api/evidence',body,i<2?trainers[4].token:at);proofs.push(result);
    if(i<2)await ok('/api/evidence',body,at);
   }
   assert.equal(proofs.filter(x=>x.status===200).length,28);assert.equal(proofs.filter(x=>x.status===404).length,2);
   assert.equal((await db.query("select count(*)::int n from public.training_evidence where description='FICTITIOUS bulk proof'")).rows[0].n,30);
  });
 }finally{await new Promise(r=>server.close(r));await db.close();}
});
