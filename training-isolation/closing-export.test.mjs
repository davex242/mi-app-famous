import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';

test('closing export: frozen report, scoped access, private fields and download audit',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),users={},tokens={};let server,scenario,record,json,html;
 const password='Synthetic-only-closing-export-password';
 const notes='DEMO revisión <img src="https://invalid.test/x" onerror="alert(1)"> & "mejora"\nSegunda línea';
 try{
  for(const [name,role] of [['admin','superadmin'],['sub','subadmin'],['recruiter','edit'],['other','edit'],['read','readonly']]){users[name]=await provisionSyntheticUser(db,name,password,role);tokens[name]=(await service.login({username:name,password})).token;}
  scenario=await seedClosingScenario(db,service,tokens,{validated:2});
  const p=await service.previewClosing(tokens.admin,{enrollment_id:scenario.e.id,attempt_id:scenario.quiz.attempt.attempt_id});
  record=(await service.completeTraining(tokens.admin,{enrollment_id:p.enrollment_id,attempt_id:p.quiz.attempt_id,expected_program_version_id:p.program_version_id,preview_hash:p.preview_hash,notes})).record;
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const call=async(body,token,extra={})=>{const r=await fetch(url+'/api/training/closing-export',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),...extra});return {status:r.status,body:await r.json(),headers:r.headers};};
  const body=format=>({record_id:record.id,format});
  await t.test('missing identity, foreign scope and arbitrary events cannot export',async()=>{
   assert.equal((await call(body('json'))).status,401);assert.equal((await call(body('html'),tokens.other)).status,404);
   const ev=(await db.query("select id from public.training_events where event_type='exam_issued' limit 1")).rows[0];
   for(const id of [randomUUID(),ev.id])assert.equal((await call({record_id:id,format:'json'},tokens.admin)).status,404);
  });
  await t.test('format allowlist and extra client-controlled content are rejected',async()=>{
   for(const data of [{...body('pdf')},{...body('html'),host_id:scenario.e.host_id},{...body('json'),conclusion:'forged'},{}])assert.equal((await call(data,tokens.admin)).status,400);
   assert.equal((await call(body('html'),tokens.admin,{headers:{'content-type':'application/json',authorization:`Bearer ${tokens.admin}`,origin:'https://invalid.test'}})).status,403);
   const r=await fetch(url+'/api/training/closing-export');assert.equal(r.status,405);
  });
  await t.test('JSON contains original administrative results and no bearer credentials or private answers',async()=>{
   const response=await call(body('json'),tokens.recruiter);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');json=response.body;
   const r=JSON.parse(json.content);assert.equal(r.version,1);assert.equal(r.sandbox,true);assert.equal(r.record_id,record.id);assert.equal(r.host_id,scenario.e.host_id);assert.equal(r.closed_by,users.admin.app_user_id);assert.equal(r.program.id,scenario.program.id);assert.equal(r.conclusion,notes);
   assert.equal(r.practices.length,2);assert.equal(r.practices[0].validated_by,users.admin.app_user_id);assert.ok(r.practices[0].validated_at);assert.equal(r.quiz.score_percent,100);assert.equal(r.quiz.pass_percent,80);
   for(const secret of ['request_hash','preview_hash','correct_option','selected_option','invitation_token','token_hash',tokens.admin,tokens.recruiter,scenario.quiz.issued.invitation_token])assert.ok(!json.content.includes(secret));
   assert.equal(json.sha256,createHash('sha256').update(json.content).digest('hex'));assert.equal(json.filename,`training-closing-${record.id}.json`);
  });
  await t.test('HTML report is self-contained, escaped, printable and has no active content',async()=>{
   html=(await call(body('html'),tokens.sub)).body;
   assert.match(html.mime,/text\/html/);assert.match(html.content,/Informe de cierre/);assert.match(html.content,/@media print/);assert.match(html.content,/&lt;img/);assert.match(html.content,/No es una certificación oficial/);
   assert.ok(!/<(?:script|img|iframe|object|a|form)\b/i.test(html.content));assert.match(html.content,/default-src 'none'/);assert.equal(html.sha256,createHash('sha256').update(html.content).digest('hex'));
  });
  await t.test('each successful export audits the real requesting actor without modifying the closure',async()=>{
   const events=(await db.query("select * from public.training_events where event_type='training_closing_exported' order by created_at,id")).rows;
   assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.actor_app_user_id),[users.recruiter.app_user_id,users.sub.app_user_id]);assert.deepEqual(events[0].details,{format:'json',sha256:json.sha256});assert.equal(events[0].entity_id,record.id);
   assert.deepEqual((await service.workspace(tokens.admin)).closing_records[0].details,record.details);
  });
  await t.test('future program revisions and live catalogue changes cannot alter exported bytes',async()=>{
   const next=await service.saveProgram(tokens.admin,{source_id:scenario.program.id,title:'DEMO programa futuro',duration_days:2,changelog:'Nueva versión',items:scenario.items.map(i=>({day:i.day,topic_id:i.topic_id,notes:i.notes,material_ids:[]}))});await service.publishProgram(tokens.admin,{id:next.id});
   const newer=await service.saveTopic(tokens.admin,{source_id:scenario.topics[0].id,title:'DEMO tema futuro',description:'Cambio posterior',category:'DEMO',estimated_minutes:10});await service.publishTopic(tokens.admin,{id:newer.id});
   assert.equal((await service.exportClosing(tokens.admin,body('json'))).content,json.content);assert.equal((await service.exportClosing(tokens.admin,body('html'))).content,html.content);
  });
  await t.test('current reassignment revokes prior recruiter export and permits assigned readonly',async()=>{
   await db.query('update training_private.training_host_assignments set recruiter_id=$1 where host_id=$2',[users.read.app_user_id,scenario.e.host_id]);assert.equal((await call(body('html'),tokens.recruiter)).status,404);
   assert.equal((await service.exportClosing(tokens.read,body('json'))).content,json.content);
  });
  await t.test('deactivation or revoked session blocks export immediately',async()=>{
   await db.query('update training_private.training_principals set is_active=false where app_user_id=$1',[users.read.app_user_id]);assert.equal((await call(body('json'),tokens.read)).status,401);
   await service.logout(tokens.sub);assert.equal((await call(body('html'),tokens.sub)).status,401);
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
