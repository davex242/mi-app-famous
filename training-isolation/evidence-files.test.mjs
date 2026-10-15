import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';
import {normalizePNG} from './private-images.mjs';
import {imageFixture} from './image-fixtures.mjs';

test('private evidence images: scoped immutable proofs, consent, checksums and administrative closing',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),users={},tokens={},password='Synthetic-only-evidence-password';let server,e,s,proof,replacement,stored,scenario;
 try{
  for(const [name,role] of [['admin','superadmin'],['sub','subadmin'],['edit','edit'],['other','edit'],['read','readonly']]){users[name]=await provisionSyntheticUser(db,name,password,role);tokens[name]=(await service.login({username:name,password})).token;}
  const demo=await seedDemoProgram(db,users.admin.app_user_id,users.edit.app_user_id);
  e=await service.enroll(tokens.edit,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'UTC'});
  s=await service.schedule(tokens.edit,{enrollment_id:e.id,item_id:demo.item_ids[0],scheduled_at:'2026-11-01T01:00:00Z',duration_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const body=extra=>({session_id:s.id,description:'DEMO práctica supervisada',image_base64:imageFixture().toString('base64'),consent_confirmed:true,...extra});
  const call=async(path,data,role='edit')=>{const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(tokens[role]?{authorization:'Bearer '+tokens[role]}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  await t.test('identity, role and enrollment scope precede parsing and cannot be forged',async()=>{
   assert.equal((await call('/api/evidence',body(),'none')).status,401);assert.equal((await call('/api/evidence',body(),'read')).status,403);assert.equal((await call('/api/evidence',body(),'other')).status,404);
   for(const extra of [{submitted_by:users.admin.app_user_id},{storage_path:'/tmp/file'},{status:'approved'},{mime:'image/png'},{filename:'secret.png'}])assert.equal((await call('/api/evidence',body(extra))).status,400);
  });
  await t.test('explicit Boolean consent and nonempty descriptions are required for attachments',async()=>{
   for(const consent_confirmed of [undefined,false,'true',1])assert.equal((await call('/api/evidence',body({consent_confirmed}))).status,400);
   assert.equal((await call('/api/evidence',body({description:''}))).status,400);
   assert.equal((await db.query('select count(*)::int n from public.training_evidence')).rows[0].n,0);
   assert.equal((await db.query('select count(*)::int n from training_private.local_evidence_content')).rows[0].n,0);
  });
  await t.test('active payloads, malformed images and large requests produce no partial proof or approval',async()=>{
   for(const bytes of [Buffer.from('<svg onload="alert(1)"/>'),Buffer.from([255,216,255,217]),imageFixture({filter:5}),imageFixture({headerEdit:h=>h.writeUInt32BE(2049)})])assert.equal((await call('/api/evidence',body({image_base64:bytes.toString('base64')}))).status,400);
   assert.equal((await call('/api/evidence',body({image_base64:'x'.repeat(3*1024*1024)}))).status,413);
   assert.equal((await db.query('select count(*)::int n from public.training_approvals')).rows[0].n,0);
  });
  await t.test('successful upload atomically links private normalized bytes to pending review and real actor',async()=>{
   const r=await call('/api/evidence',body());assert.equal(r.status,200);proof=r.body;assert.equal(proof.status,'pending');assert.equal(proof.submitted_by,users.edit.app_user_id);assert.equal(proof.storage_path,`sandbox/evidence/${proof.id}.png`);
   stored=(await db.query('select body from training_private.local_evidence_content where evidence_id=$1',[proof.id])).rows[0].body;
   const image=JSON.parse(stored);assert.ok(!Buffer.from(image.data,'base64').includes(Buffer.from('PRIVATE_METADATA_DEMO')));
   assert.equal((await db.query('select count(*)::int n from public.training_approvals where evidence_id=$1',[proof.id])).rows[0].n,1);
   const audit=(await db.query("select * from public.training_events where event_type='evidence_submitted' and entity_id=$1",[proof.id])).rows[0];assert.equal(audit.actor_app_user_id,users.edit.app_user_id);assert.equal(audit.details.consent_confirmed,true);assert.equal(audit.details.attachment.sha256,image.sha256);
   for(const role of ['admin','edit'])assert.ok(!JSON.stringify(await service.workspace(tokens[role])).includes(image.data));
   assert.equal((await fetch(url+'/'+proof.storage_path)).status,404);assert.equal((await fetch(url+'/evidence-files.mjs')).status,404);
   await db.transaction(async tx=>{await tx.exec('set local role authenticated');await assert.rejects(()=>tx.query('select * from training_private.local_evidence_content'),e=>e.code==='42501');});
  });
  await t.test('file endpoints check current scope, strict IDs and audit actual reader without file bytes',async()=>{
   for(const path of ['/api/evidence/file-preview','/api/evidence/file-download']){
    assert.equal((await call(path,{evidence_id:proof.id},'none')).status,401);for(const role of ['other','read'])assert.equal((await call(path,{evidence_id:proof.id},role)).status,404);
    assert.equal((await call(path,{evidence_id:randomUUID()})).status,404);assert.equal((await call(path,{evidence_id:proof.id,role:'superadmin'})).status,400);
   }
   const p=await service.previewEvidenceFile(tokens.edit,{evidence_id:proof.id}),d=await service.downloadEvidenceFile(tokens.sub,{evidence_id:proof.id});assert.equal(d.image_base64,p.image.data);assert.equal(d.sha256,p.image.sha256);assert.equal(d.filename,`evidence-${proof.id}.png`);
   const events=(await db.query("select * from public.training_events where entity_id=$1 and event_type like 'evidence_file_%'",[proof.id])).rows;
   assert.ok(events.some(ev=>ev.actor_app_user_id===users.edit.app_user_id));assert.ok(events.some(ev=>ev.actor_app_user_id===users.sub.app_user_id));assert.ok(!JSON.stringify(events).includes(p.image.data));
  });
  await t.test('a valid evidence image over 32 KiB uploads while ordinary endpoints remain capped',async()=>{
   const raw=randomBytes((128*4+1)*128);for(let row=0;row<128;row++)raw[row*(128*4+1)]=0;
   const bytes=imageFixture({width:128,height:128,raw});assert.ok(bytes.length>32768);
   const r=await call('/api/evidence',body({description:'DEMO evidencia mayor de 32 KiB',image_base64:bytes.toString('base64')}));assert.equal(r.status,200);
   assert.equal((await service.previewEvidenceFile(tokens.edit,{evidence_id:r.body.id})).image.width,128);
   assert.equal((await call('/api/evidence/file-preview',{evidence_id:proof.id,extra:'x'.repeat(33000)})).status,413);
  });
  await t.test('missing/corrupt content cannot be approved; rejecting it retains the original',async()=>{
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[JSON.stringify({...JSON.parse(stored),sha256:'0'.repeat(64)}),proof.id]);
   await assert.rejects(()=>service.previewEvidenceFile(tokens.admin,{evidence_id:proof.id}),e=>e.status===409);
   await assert.rejects(()=>service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'approved',notes:'DEMO'}),e=>e.status===409);
   assert.equal((await db.query('select status from public.training_evidence where id=$1',[proof.id])).rows[0].status,'pending');
   await service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'rejected',notes:'DEMO solicita otra evidencia'});
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[stored,proof.id]);
   replacement=await service.submitEvidence(tokens.edit,body({description:'DEMO segunda práctica'}));assert.notEqual(replacement.id,proof.id);assert.equal((await service.previewEvidenceFile(tokens.edit,{evidence_id:proof.id})).image.data,JSON.parse(stored).data);
   await assert.rejects(()=>service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'approved',notes:'DEMO'}),e=>e.status===409);
  });
  await t.test('approved attachment is checked again before practical validation',async()=>{
   await service.reviewEvidence(tokens.admin,{evidence_id:replacement.id,decision:'approved',notes:'DEMO archivo verificado'});await service.assess(tokens.admin,{session_id:s.id,score:90,passed:true,notes:'DEMO'});
   const saved=(await db.query('select body from training_private.local_evidence_content where evidence_id=$1',[replacement.id])).rows[0].body;
   await db.query('delete from training_private.local_evidence_content where evidence_id=$1',[replacement.id]);await assert.rejects(()=>service.completeItem(tokens.admin,{session_id:s.id}),e=>e.status===409);
   assert.equal((await db.query('select count(*)::int n from public.training_completions')).rows[0].n,0);
   await db.query('insert into training_private.local_evidence_content(evidence_id,body) values($1,$2)',[replacement.id,saved]);await service.completeItem(tokens.admin,{session_id:s.id});
  });
  await t.test('readonly assignee can read historical proof; former owner loses access immediately',async()=>{
   await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.read.app_user_id,demo.host_id]);
   assert.equal((await service.previewEvidenceFile(tokens.read,{evidence_id:replacement.id})).image.width,320);
   await assert.rejects(()=>service.downloadEvidenceFile(tokens.edit,{evidence_id:replacement.id}),e=>e.status===404);assert.equal((await service.workspace(tokens.edit)).evidence.length,0);
   await db.query("update public.training_enrollments set status='cancelled' where id=$1",[e.id]);assert.ok((await service.downloadEvidenceFile(tokens.read,{evidence_id:replacement.id})).image_base64);
   await assert.rejects(()=>service.submitEvidence(tokens.admin,body()),e=>e.status===409);
   await db.query('update training_private.training_principals set is_active=false where auth_user_id=$1',[users.read.auth_user_id]);await assert.rejects(()=>service.previewEvidenceFile(tokens.read,{evidence_id:replacement.id}),e=>e.status===401);
   await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.edit.app_user_id,demo.host_id]);
  });
  await t.test('closing freezes verified attachment metadata and blocks a changed file after preview',async()=>{
   scenario=await seedClosingScenario(db,service,{admin:tokens.admin,recruiter:tokens.edit},{validated:2,demo,proofImageBase64:imageFixture().toString('base64')});
   const p=await service.previewClosing(tokens.admin,{enrollment_id:scenario.e.id,attempt_id:scenario.quiz.attempt.attempt_id});assert.equal(p.ready,true);assert.equal(p.checks.length,2);for(const check of p.checks){assert.equal(check.evidence_attachment.mime,'image/png');assert.ok(check.evidence_attachment.sha256);assert.ok(!JSON.stringify(check).includes('data'));}
   const key=p.checks[0].evidence_id,saved=(await db.query('select body from training_private.local_evidence_content where evidence_id=$1',[key])).rows[0].body;
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[JSON.stringify({...JSON.parse(saved),width:999}),key]);
   const body={enrollment_id:p.enrollment_id,attempt_id:p.quiz.attempt_id,expected_program_version_id:p.program_version_id,preview_hash:p.preview_hash,notes:'DEMO cierre'};
   await assert.rejects(()=>service.completeTraining(tokens.admin,body),e=>e.status===409);assert.equal((await db.query('select status from public.training_enrollments where id=$1',[scenario.e.id])).rows[0].status,'active');
   const changed=normalizePNG(imageFixture({color:2}).toString('base64'),()=>{throw Error();});await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[JSON.stringify(changed),key]);await assert.rejects(()=>service.completeTraining(tokens.admin,body),e=>e.status===409&&e.message==='Closing requirements changed; review again');
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[saved,key]);await service.completeTraining(tokens.admin,body);
   const record=(await service.workspace(tokens.admin)).closing_records[0];assert.deepEqual(record.details.snapshot.checks[0].evidence_attachment,p.checks[0].evidence_attachment);
   const exported=JSON.parse((await service.exportClosing(tokens.admin,{record_id:record.id,format:'json'})).content);assert.deepEqual(exported.practices[0].evidence_attachment,p.checks[0].evidence_attachment);assert.ok(!JSON.stringify(exported).includes(JSON.parse(saved).data));
   assert.ok((await service.downloadEvidenceFile(tokens.edit,{evidence_id:key})).image_base64);await assert.rejects(()=>service.submitEvidence(tokens.edit,{session_id:scenario.sessions[0].id,description:'DEMO no change'}),e=>e.status===409);
  });
  await t.test('text-only evidence remains compatible and creates no private content',async()=>{
   const active=await service.enroll(tokens.edit,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'UTC'}),session=await service.schedule(tokens.edit,{enrollment_id:active.id,item_id:demo.item_ids[1],scheduled_at:'2026-11-05T01:00:00Z',duration_minutes:10});
   const text=await service.submitEvidence(tokens.edit,{session_id:session.id,description:'DEMO solo texto'});assert.equal(text.storage_path,null);await assert.rejects(()=>service.previewEvidenceFile(tokens.edit,{evidence_id:text.id}),e=>e.status===404);
   await service.reviewEvidence(tokens.admin,{evidence_id:text.id,decision:'approved',notes:'DEMO texto verificado'});
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
