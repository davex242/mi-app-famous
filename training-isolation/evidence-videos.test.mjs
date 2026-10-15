import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';
import {videoFixture} from './video-fixtures.mjs';
import {imageFixture} from './image-fixtures.mjs';
import {validateMP4} from './private-videos.mjs';

test('private MP4 evidence: scoped immutable clips, consent, verification and closing',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),users={},tokens={},password='Synthetic-video-evidence-password',bytes=videoFixture();let server,e,s,proof,stored;
 try{
  for(const [name,role] of [['admin','superadmin'],['sub','subadmin'],['edit','edit'],['other','edit'],['read','readonly']]){users[name]=await provisionSyntheticUser(db,name,password,role);tokens[name]=(await service.login({username:name,password})).token;}
  const demo=await seedDemoProgram(db,users.admin.app_user_id,users.edit.app_user_id);e=await service.enroll(tokens.edit,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'UTC'});s=await service.schedule(tokens.edit,{enrollment_id:e.id,item_id:demo.item_ids[0],scheduled_at:'2026-11-01T01:00:00Z',duration_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const body=extra=>({session_id:s.id,description:'DEMO video de práctica',video_base64:bytes.toString('base64'),consent_confirmed:true,...extra});
  const call=async(data,role='edit',path='/api/evidence')=>{const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(tokens[role]?{authorization:'Bearer '+tokens[role]}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  await t.test('authentication, assignment, role and consent precede parsing; only one file is accepted',async()=>{
   assert.equal((await call(body(),'none')).status,401);assert.equal((await call(body(),'other')).status,404);assert.equal((await call(body(),'read')).status,403);
   for(const extra of [{submitted_by:users.admin.app_user_id},{mime:'video/mp4'},{storage_path:'../../movie'},{status:'approved'},{consent_confirmed:'true'},{consent_confirmed:false},{consent_confirmed:undefined},{image_base64:imageFixture().toString('base64')},{pdf_base64:'AAAA'}])assert.equal((await call(body(extra))).status,400);
  });
  await t.test('fake, truncated and oversized clips leave no partial file or approval',async()=>{
   for(const bad of [Buffer.from('<svg onload="alert(1)"/>'),bytes.subarray(0,bytes.length-5),Buffer.concat([bytes,Buffer.from('bad trailing data')]),Buffer.alloc(2*1024*1024+1)])assert.equal((await call(body({video_base64:bad.toString('base64')}))).status,400);
   assert.equal((await call(body({video_base64:'x'.repeat(3*1024*1024)}))).status,413);assert.equal((await db.query('select count(*)::int n from public.training_approvals')).rows[0].n,0);
  });
  await t.test('real H264/AAC clip retains exact private bytes, actor and consent without workspace leaks',async()=>{
   const r=await call(body());assert.equal(r.status,200);proof=r.body;assert.equal(proof.storage_path,`sandbox/evidence/${proof.id}.mp4`);assert.equal(proof.submitted_by,users.edit.app_user_id);
   stored=(await db.query('select body from training_private.local_evidence_content where evidence_id=$1',[proof.id])).rows[0].body;const file=JSON.parse(stored);assert.deepEqual(Buffer.from(file.data,'base64'),bytes);assert.equal(file.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(file.codec,'avc1');assert.equal(file.audio,true);
   assert.ok(!JSON.stringify(await service.workspace(tokens.admin)).includes(file.data));assert.equal((await fetch(url+'/'+proof.storage_path)).status,404);
   const audit=(await db.query("select actor_app_user_id,details from public.training_events where event_type='evidence_submitted' and entity_id=$1",[proof.id])).rows[0];assert.equal(audit.actor_app_user_id,users.edit.app_user_id);assert.equal(audit.details.attachment.mime,'video/mp4');assert.equal(audit.details.consent_confirmed,true);
  });
  await t.test('preview/download use current scope and verified original bytes with real reader audit',async()=>{
   for(const operation of ['previewEvidenceFile','downloadEvidenceFile'])for(const role of ['other','read'])await assert.rejects(()=>service[operation](tokens[role],{evidence_id:proof.id}),x=>x.status===404);
   const p=await service.previewEvidenceFile(tokens.edit,{evidence_id:proof.id}),d=await service.downloadEvidenceFile(tokens.sub,{evidence_id:proof.id});assert.equal(p.type,'video');assert.equal(p.video.data,d.video_base64);assert.equal(d.filename,`evidence-${proof.id}.mp4`);assert.equal(d.mime,'video/mp4');assert.deepEqual(Buffer.from(d.video_base64,'base64'),bytes);assert.equal(d.image_base64,undefined);assert.equal(d.pdf_base64,undefined);
   const events=(await db.query("select * from public.training_events where entity_id=$1 and event_type like 'evidence_file_%'",[proof.id])).rows;assert.ok(events.some(ev=>ev.actor_app_user_id===users.edit.app_user_id));assert.ok(events.some(ev=>ev.actor_app_user_id===users.sub.app_user_id));assert.ok(!JSON.stringify(events).includes(d.video_base64));
  });
  await t.test('checksum, dimensions, duration and codec mismatches cannot be approved or played',async()=>{
   for(const extra of [{sha256:'0'.repeat(64)},{width:999},{duration_seconds:999},{codec:'fake'},{audio:false}]){
    await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[JSON.stringify({...JSON.parse(stored),...extra}),proof.id]);await assert.rejects(()=>service.previewEvidenceFile(tokens.admin,{evidence_id:proof.id}),x=>x.status===409);await assert.rejects(()=>service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'approved',notes:'DEMO'}),x=>x.status===409);
   }
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[stored,proof.id]);await service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'approved',notes:'DEMO video revisado'});
  });
  await t.test('practical validation rechecks the file and grants no credit if it is missing',async()=>{
   await service.assess(tokens.admin,{session_id:s.id,score:90,passed:true,notes:'DEMO evaluación'});await db.query('delete from training_private.local_evidence_content where evidence_id=$1',[proof.id]);await assert.rejects(()=>service.completeItem(tokens.admin,{session_id:s.id}),x=>x.status===409);assert.equal((await db.query('select count(*)::int n from public.training_completions')).rows[0].n,0);
   await db.query('insert into training_private.local_evidence_content(evidence_id,body) values($1,$2)',[proof.id,stored]);await service.completeItem(tokens.admin,{session_id:s.id});
  });
  await t.test('readonly assignee can play clips; former recruiter and inactive account lose access',async()=>{
   await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.read.app_user_id,demo.host_id]);assert.equal((await service.previewEvidenceFile(tokens.read,{evidence_id:proof.id})).type,'video');await assert.rejects(()=>service.downloadEvidenceFile(tokens.edit,{evidence_id:proof.id}),x=>x.status===404);
   await db.query('update training_private.training_principals set is_active=false where auth_user_id=$1',[users.read.auth_user_id]);await assert.rejects(()=>service.previewEvidenceFile(tokens.read,{evidence_id:proof.id}),x=>x.status===401);await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.edit.app_user_id,demo.host_id]);await db.query("update public.training_enrollments set status='cancelled' where id=$1",[e.id]);
  });
  await t.test('closing freezes clip metadata and rejects changed valid bytes after preview',async()=>{
   const scenario=await seedClosingScenario(db,service,{admin:tokens.admin,recruiter:tokens.edit},{validated:2,demo,proofVideoBase64:bytes.toString('base64')});const p=await service.previewClosing(tokens.admin,{enrollment_id:scenario.e.id,attempt_id:scenario.quiz.attempt.attempt_id});assert.equal(p.ready,true);assert.equal(p.checks[0].evidence_attachment.mime,'video/mp4');assert.equal(p.checks[0].evidence_attachment.codec,'avc1');
   const key=p.checks[0].evidence_id,changed=validateMP4(Buffer.concat([bytes,Buffer.from('0000000866726565','hex')]).toString('base64'),()=>{throw Error();});await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[JSON.stringify(changed),key]);const body={enrollment_id:p.enrollment_id,attempt_id:p.quiz.attempt_id,expected_program_version_id:p.program_version_id,preview_hash:p.preview_hash,notes:'DEMO cierre MP4'};await assert.rejects(()=>service.completeTraining(tokens.admin,body),x=>x.status===409&&x.message==='Closing requirements changed; review again');
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[stored,key]);await service.completeTraining(tokens.admin,body);const record=(await service.workspace(tokens.admin)).closing_records[0];const json=JSON.parse((await service.exportClosing(tokens.admin,{record_id:record.id,format:'json'})).content);assert.deepEqual(json.practices[0].evidence_attachment,p.checks[0].evidence_attachment);assert.ok(!JSON.stringify(json).includes(bytes.toString('base64')));assert.match((await service.exportClosing(tokens.admin,{record_id:record.id,format:'html'})).content,/Video MP4/);
   assert.deepEqual(Buffer.from((await service.downloadEvidenceFile(tokens.edit,{evidence_id:key})).video_base64,'base64'),bytes);await assert.rejects(()=>service.submitEvidence(tokens.edit,{session_id:scenario.sessions[0].id,description:'DEMO no edit'}),x=>x.status===409);
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
