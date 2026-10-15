import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';
import {reportlabFixture,pdfFixture} from './pdf-fixtures.mjs';
import {imageFixture} from './image-fixtures.mjs';

test('private PDF evidence: consent, bounded static files, current scope and administrative checks',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),users={},tokens={},password='Synthetic-PDF-evidence-password',bytes=reportlabFixture();let server,e,s,proof,stored,scenario;
 try{
  for(const [name,role] of [['admin','superadmin'],['sub','subadmin'],['edit','edit'],['other','edit'],['read','readonly']]){users[name]=await provisionSyntheticUser(db,name,password,role);tokens[name]=(await service.login({username:name,password})).token;}
  const demo=await seedDemoProgram(db,users.admin.app_user_id,users.edit.app_user_id);e=await service.enroll(tokens.edit,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'UTC'});s=await service.schedule(tokens.edit,{enrollment_id:e.id,item_id:demo.item_ids[0],scheduled_at:'2026-11-01T01:00:00Z',duration_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const body=extra=>({session_id:s.id,description:'DEMO evidencia documental',pdf_base64:bytes.toString('base64'),consent_confirmed:true,...extra});
  const call=async(data,role='edit',path='/api/evidence')=>{const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(tokens[role]?{authorization:'Bearer '+tokens[role]}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  await t.test('identity, current assignment and role are checked before parsing a PDF',async()=>{
   assert.equal((await call(body(),'none')).status,401);assert.equal((await call(body(),'other')).status,404);assert.equal((await call(body(),'read')).status,403);
   for(const extra of [{status:'approved'},{submitted_by:users.admin.app_user_id},{storage_path:'../../file.pdf'},{mime:'application/pdf'}])assert.equal((await call(body(extra))).status,400);
  });
  await t.test('consent must be explicit and only one attachment is accepted per evidence',async()=>{
   for(const consent_confirmed of [undefined,false,'true'])assert.equal((await call(body({consent_confirmed}))).status,400);
   assert.equal((await call(body({image_base64:imageFixture().toString('base64')}))).status,400);assert.equal((await call(body({description:''}))).status,400);
   assert.equal((await db.query('select count(*)::int n from public.training_evidence')).rows[0].n,0);
  });
  await t.test('fake, truncated, active, encrypted and oversized PDFs create no partial review or file',async()=>{
   for(const bad of [Buffer.from('<html>fake PDF</html>'),bytes.subarray(0,bytes.length-12),Buffer.concat([bytes,Buffer.from('<script>extra</script>')]),await pdfFixture({interactive:'javascript'}),await pdfFixture({interactive:'form'}),await pdfFixture({interactive:'attachment'}),await pdfFixture({interactive:'encrypted'})])assert.equal((await call(body({pdf_base64:bad.toString('base64')}))).status,400);
   assert.equal((await call(body({pdf_base64:Buffer.alloc(2*1024*1024+1).toString('base64')}))).status,400);assert.equal((await call(body({pdf_base64:'x'.repeat(3*1024*1024)}))).status,413);
   assert.equal((await db.query('select count(*)::int n from public.training_approvals')).rows[0].n,0);
  });
  await t.test('independently authored PDF is stored privately with exact bytes and real uploader',async()=>{
   const r=await call(body());assert.equal(r.status,200);proof=r.body;assert.equal(proof.storage_path,`sandbox/evidence/${proof.id}.pdf`);assert.equal(proof.submitted_by,users.edit.app_user_id);
   stored=(await db.query('select body from training_private.local_evidence_content where evidence_id=$1',[proof.id])).rows[0].body;const file=JSON.parse(stored);assert.equal(file.format,'training-private-pdf-v1');assert.deepEqual(Buffer.from(file.data,'base64'),bytes);assert.equal(file.sha256,createHash('sha256').update(bytes).digest('hex'));
   assert.ok(!JSON.stringify(await service.workspace(tokens.admin)).includes(file.data));assert.equal((await fetch(url+'/'+proof.storage_path)).status,404);
   const audit=(await db.query("select details,actor_app_user_id from public.training_events where event_type='evidence_submitted' and entity_id=$1",[proof.id])).rows[0];assert.equal(audit.actor_app_user_id,users.edit.app_user_id);assert.equal(audit.details.attachment.mime,'application/pdf');assert.equal(audit.details.consent_confirmed,true);
  });
  await t.test('PDF is download-only even for admins; file endpoints enforce scope and actual reader audit',async()=>{
   for(const role of ['edit','admin'])await assert.rejects(()=>service.previewEvidenceFile(tokens[role],{evidence_id:proof.id}),x=>x.status===403);
   for(const role of ['other','read'])await assert.rejects(()=>service.downloadEvidenceFile(tokens[role],{evidence_id:proof.id}),x=>x.status===404);
   const d=await service.downloadEvidenceFile(tokens.sub,{evidence_id:proof.id});assert.equal(d.mime,'application/pdf');assert.equal(d.filename,`evidence-${proof.id}.pdf`);assert.deepEqual(Buffer.from(d.pdf_base64,'base64'),bytes);assert.equal(d.image_base64,undefined);
   const audit=(await db.query("select * from public.training_events where event_type='evidence_file_downloaded' and entity_id=$1",[proof.id])).rows[0];assert.equal(audit.actor_app_user_id,users.sub.app_user_id);assert.equal(audit.details.sha256,d.sha256);assert.ok(!JSON.stringify(audit).includes(d.pdf_base64));
  });
  await t.test('checksum, page count and path mismatches block approval and download',async()=>{
   for(const change of [{sha256:'0'.repeat(64)},{pages:999},{format:'training-private-png-v1'}]){
    await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[JSON.stringify({...JSON.parse(stored),...change}),proof.id]);await assert.rejects(()=>service.downloadEvidenceFile(tokens.admin,{evidence_id:proof.id}),x=>x.status===409);await assert.rejects(()=>service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'approved',notes:'DEMO'}),x=>x.status===409);
   }
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[stored,proof.id]);await db.query('update public.training_evidence set storage_path=$1 where id=$2',[`sandbox/evidence/${randomUUID()}.pdf`,proof.id]);await assert.rejects(()=>service.downloadEvidenceFile(tokens.admin,{evidence_id:proof.id}),x=>x.status===409);
   await db.query('update public.training_evidence set storage_path=$1 where id=$2',[`sandbox/evidence/${proof.id}.pdf`,proof.id]);await service.reviewEvidence(tokens.admin,{evidence_id:proof.id,decision:'approved',notes:'DEMO PDF revisado'});
  });
  await t.test('practical validation rechecks an approved PDF and never credits a missing file',async()=>{
   await service.assess(tokens.admin,{session_id:s.id,score:90,passed:true,notes:'DEMO evaluación'});await db.query('delete from training_private.local_evidence_content where evidence_id=$1',[proof.id]);await assert.rejects(()=>service.completeItem(tokens.admin,{session_id:s.id}),x=>x.status===409);assert.equal((await db.query('select count(*)::int n from public.training_completions')).rows[0].n,0);
   await db.query('insert into training_private.local_evidence_content(evidence_id,body) values($1,$2)',[proof.id,stored]);await service.completeItem(tokens.admin,{session_id:s.id});
  });
  await t.test('readonly can download after reassignment; former recruiter and inactive accounts cannot',async()=>{
   await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.read.app_user_id,demo.host_id]);assert.ok((await service.downloadEvidenceFile(tokens.read,{evidence_id:proof.id})).pdf_base64);await assert.rejects(()=>service.downloadEvidenceFile(tokens.edit,{evidence_id:proof.id}),x=>x.status===404);
   await db.query('update training_private.training_principals set is_active=false where auth_user_id=$1',[users.read.auth_user_id]);await assert.rejects(()=>service.downloadEvidenceFile(tokens.read,{evidence_id:proof.id}),x=>x.status===401);await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.edit.app_user_id,demo.host_id]);await db.query("update public.training_enrollments set status='cancelled' where id=$1",[e.id]);
  });
  await t.test('closing and reports freeze PDF metadata, exclude bytes and preserve historical downloads',async()=>{
   scenario=await seedClosingScenario(db,service,{admin:tokens.admin,recruiter:tokens.edit},{validated:2,demo,proofPDFBase64:bytes.toString('base64')});const p=await service.previewClosing(tokens.admin,{enrollment_id:scenario.e.id,attempt_id:scenario.quiz.attempt.attempt_id});assert.equal(p.ready,true);assert.equal(p.checks[0].evidence_attachment.mime,'application/pdf');assert.equal(p.checks[0].evidence_attachment.pages,JSON.parse(stored).pages);
   const key=p.checks[0].evidence_id;await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',['{}',key]);const body={enrollment_id:p.enrollment_id,attempt_id:p.quiz.attempt_id,expected_program_version_id:p.program_version_id,preview_hash:p.preview_hash,notes:'DEMO cierre PDF'};await assert.rejects(()=>service.completeTraining(tokens.admin,body),x=>x.status===409);
   await db.query('update training_private.local_evidence_content set body=$1 where evidence_id=$2',[stored,key]);await service.completeTraining(tokens.admin,body);const record=(await service.workspace(tokens.admin)).closing_records[0];
   const json=JSON.parse((await service.exportClosing(tokens.admin,{record_id:record.id,format:'json'})).content);assert.deepEqual(json.practices[0].evidence_attachment,p.checks[0].evidence_attachment);assert.ok(!JSON.stringify(json).includes(bytes.toString('base64')));assert.match((await service.exportClosing(tokens.admin,{record_id:record.id,format:'html'})).content,/Documento PDF/);
   assert.deepEqual(Buffer.from((await service.downloadEvidenceFile(tokens.edit,{evidence_id:key})).pdf_base64,'base64'),bytes);await assert.rejects(()=>service.submitEvidence(tokens.edit,{session_id:scenario.sessions[0].id,description:'DEMO no edit'}),x=>x.status===409);
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
