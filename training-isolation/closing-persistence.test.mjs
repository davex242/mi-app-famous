import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {rm} from 'node:fs/promises';
import {openPersistentSandbox,LOCAL_DATA_ROOT} from './local-storage.mjs';
import {preparePersistentDemo} from './local-runtime.mjs';
import {createTrainingService} from './service.mjs';
import {reportlabFixture} from './pdf-fixtures.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';

test('closing record survives local restart without reopening the completed enrollment',async t=>{
 const store='qa-closing-'+randomUUID(),password='Only-synthetic-closing-persistence';let local,service,scenario,before,exportBefore;
 try{
  local=await openPersistentSandbox(store);const fixture=await preparePersistentDemo(local.db,password);service=createTrainingService(local.db);
  const tokens={admin:(await service.login({username:'demo-superadmin',password})).token,recruiter:(await service.login({username:'demo-edit',password})).token};
  await t.test('administrative confirmation saves an immutable outcome after the real practical and quiz flow',async()=>{
   scenario=await seedClosingScenario(local.db,service,tokens,{validated:2,demo:fixture.demo,proofPDFBase64:reportlabFixture().toString('base64')});
   const p=await service.previewClosing(tokens.admin,{enrollment_id:scenario.e.id,attempt_id:scenario.quiz.attempt.attempt_id});assert.equal(p.ready,true);
   await service.completeTraining(tokens.admin,{enrollment_id:p.enrollment_id,attempt_id:p.quiz.attempt_id,expected_program_version_id:p.program_version_id,preview_hash:p.preview_hash,notes:'DEMO revisión y plan de mejora conservados'});
   before=JSON.stringify((await service.workspace(tokens.admin)).closing_records);
   exportBefore={};for(const format of ['html','json'])exportBefore[format]=await service.exportClosing(tokens.admin,{record_id:(await service.workspace(tokens.admin)).closing_records[0].id,format});
  });
  await t.test('restart retains status, actor, program version, validations, score and conclusion',async()=>{
   await local.close();local=null;globalThis.gc?.();local=await openPersistentSandbox(store);service=createTrainingService(local.db);
   const token=(await service.login({username:'demo-superadmin',password})).token,w=await service.workspace(token);
   assert.equal(JSON.stringify(w.closing_records),before);assert.equal(w.enrollments[0].status,'completed');assert.ok(w.enrollments[0].completed_at);
   assert.equal(w.closing_records[0].details.snapshot.progress.percent,100);assert.equal(w.closing_records[0].details.snapshot.quiz.score_percent,100);
   const proof=w.closing_records[0].details.snapshot.checks[0];assert.equal(proof.evidence_attachment.mime,'application/pdf');assert.equal(proof.evidence_attachment.sha256,(await service.downloadEvidenceFile(token,{evidence_id:proof.evidence_id})).sha256);
   await assert.rejects(()=>service.examStatus(scenario.quiz.issued.invitation_token,{}),e=>e.status===404);
   for(const format of ['html','json'])assert.deepEqual(await service.exportClosing(token,{record_id:w.closing_records[0].id,format}),exportBefore[format]);
  });
 }finally{if(local)await local.close();await rm(join(LOCAL_DATA_ROOT,store),{recursive:true,force:true});await rm(join(LOCAL_DATA_ROOT,'_locks',store),{recursive:true,force:true});}
});
