import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {pdfFixture,reportlabFixture} from './pdf-fixtures.mjs';

test('private PDF catalogue: bounded static documents, exact bytes and guarded downloads',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),tokens={},users={},password='Synthetic-only-PDF-test-password';let server,topic,pdf,second;const bytes=await pdfFixture();
 try{
  for(const role of ['superadmin','subadmin','edit','readonly']){users[role]=await provisionSyntheticUser(db,role,password,role);tokens[role]=(await service.login({username:role,password})).token;}
  topic=await service.saveTopic(tokens.superadmin,{title:'DEMO PDF training',description:'Private guide',category:'DEMO',estimated_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const body=extra=>({topic_id:topic.id,title:'DEMO PDF guide',pdf_base64:bytes.toString('base64'),allow_download:true,...extra});
  const call=async(data,role='superadmin')=>{const r=await fetch(url+'/api/materials/pdf',{method:'POST',headers:{'content-type':'application/json',...(tokens[role]?{authorization:`Bearer ${tokens[role]}`}:{})},body:JSON.stringify(data)});return{status:r.status,body:await r.json()};};
  await t.test('identity/admin role and strict fields cannot be bypassed by an upload',async()=>{
   assert.equal((await call(body(),'none')).status,401);for(const role of ['edit','readonly'])assert.equal((await call(body(),role)).status,403);
   for(const extra of [{allow_preview:true},{mime:'application/pdf'},{storage_path:'../../secret'},{created_by:users.edit.app_user_id},{status:'published'}])assert.equal((await call(body(extra))).status,400);
  });
  await t.test('fake PDF, bad xref, truncation, appended payload and noncanonical base64 are rejected',async()=>{
   const broken=Buffer.from(bytes);broken[0]=0;
   for(const value of [Buffer.from('%PDF-1.7\nfake\nstartxref\n1\n%%EOF'),broken,bytes.subarray(0,-10),Buffer.concat([bytes,Buffer.from('<script>tail</script>')])])assert.equal((await call(body({pdf_base64:value.toString('base64')}))).status,400);
   assert.equal((await call(body({pdf_base64:bytes.toString('base64')+'\n'}))).status,400);
  });
  await t.test('JavaScript, forms, actions, file attachments and encrypted declarations are rejected',async()=>{
   for(const interactive of ['javascript','form','action','attachment','encrypted','orphan-launch'])assert.equal((await call(body({pdf_base64:(await pdfFixture({interactive})).toString('base64')}))).status,400);
  });
  await t.test('page-count and decoded object-stream limits fail without terminating the local server',async()=>{
   for(const config of [{pages:0},{pages:101},{bomb:true}])assert.equal((await call(body({pdf_base64:(await pdfFixture(config)).toString('base64')}))).status,400);
   assert.equal((await fetch(url+'/health')).status,200);
  });
  await t.test('oversized files and requests are denied and the next request remains usable',async()=>{
   assert.equal((await call(body({pdf_base64:Buffer.alloc(2*1024*1024+1).toString('base64')}))).status,400);assert.equal((await call(body({title:'x'.repeat(3*1024*1024)}))).status,413);assert.equal((await fetch(url+'/health')).status,200);
  });
  await t.test('compressed valid PDF becomes a private draft with exact bytes/checksum and no inline preview',async()=>{
   const r=await call(body(),'subadmin');assert.equal(r.status,200);pdf=r.body;assert.equal(pdf.kind,'document');assert.equal(pdf.allow_preview,false);assert.equal(pdf.created_by,users.subadmin.app_user_id);
   const stored=JSON.parse((await db.query('select body from training_private.local_material_content where material_id=$1',[pdf.id])).rows[0].body);assert.equal(stored.pages,2);assert.equal(stored.data,bytes.toString('base64'));assert.equal(stored.sha256,createHash('sha256').update(bytes).digest('hex'));
   assert.ok(!JSON.stringify(await service.workspace(tokens.superadmin)).includes(stored.data));assert.equal((await fetch(url+'/'+pdf.storage_path)).status,404);assert.equal((await fetch(url+'/pdf-validator-worker.mjs')).status,404);
   await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:pdf.id}),e=>e.status===404);await assert.rejects(()=>service.previewMaterial(tokens.superadmin,{id:pdf.id}),e=>e.status===403);
  });
  await t.test('publication requires published topic and readonly can download the exact original PDF',async()=>{
   await assert.rejects(()=>service.publishMaterial(tokens.superadmin,{id:pdf.id}),e=>e.status===409);await service.publishTopic(tokens.superadmin,{id:topic.id});await service.publishMaterial(tokens.superadmin,{id:pdf.id});
   const d=await service.downloadMaterial(tokens.readonly,{id:pdf.id});assert.equal(d.mime,'application/pdf');assert.match(d.filename,/\.pdf$/);assert.deepEqual(Buffer.from(d.pdf_base64,'base64'),bytes);assert.equal(d.sha256,createHash('sha256').update(bytes).digest('hex'));
  });
  await t.test('plain PDF revision preserves the previous file and independently disables download',async()=>{
   second=await service.savePDFMaterial(tokens.superadmin,body({source_id:pdf.id,pdf_base64:(await pdfFixture({compressed:false})).toString('base64'),allow_download:false}));await service.publishMaterial(tokens.superadmin,{id:second.id});assert.equal(second.revision,2);
   await assert.rejects(()=>service.downloadMaterial(tokens.superadmin,{id:second.id}),e=>e.status===403);assert.equal((await service.downloadMaterial(tokens.edit,{id:pdf.id})).pdf_base64,bytes.toString('base64'));
   await assert.rejects(()=>service.savePDFMaterial(tokens.superadmin,body({source_id:pdf.id})),e=>e.status===409);assert.equal((await service.materialEditData(tokens.superadmin,{id:second.id})).pdf.pages,2);await assert.rejects(()=>service.materialEditData(tokens.edit,{id:second.id}),e=>e.status===403);
  });
  await t.test('program publication and download reject corrupted/missing private PDF manifests',async()=>{
   const program=await service.saveProgram(tokens.superadmin,{title:'DEMO PDF program',duration_days:1,changelog:'Pinned PDF',items:[{day:1,topic_id:topic.id,notes:'Read private guide',material_ids:[pdf.id]}]});const original=(await db.query('select body from training_private.local_material_content where material_id=$1',[pdf.id])).rows[0].body;
   await db.query('update training_private.local_material_content set body=$2 where material_id=$1',[pdf.id,'{}']);await assert.rejects(()=>service.publishProgram(tokens.superadmin,{id:program.id}),e=>e.status===409);await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:pdf.id}),e=>e.status===409);
   await db.query('update training_private.local_material_content set body=$2 where material_id=$1',[pdf.id,original]);await service.publishProgram(tokens.superadmin,{id:program.id});
  });
  await t.test('independently written ReportLab PDF interoperates without changing its bytes',async()=>{
   const source=reportlabFixture(),value=await service.savePDFMaterial(tokens.superadmin,body({title:'DEMO ReportLab',pdf_base64:source.toString('base64')}));await service.publishMaterial(tokens.superadmin,{id:value.id});
   assert.deepEqual(Buffer.from((await service.downloadMaterial(tokens.readonly,{id:value.id})).pdf_base64,'base64'),source);
  });
  await t.test('private SQL access is denied and deactivation blocks previously permitted downloads',async()=>{
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select body from training_private.local_material_content');}),e=>e.code==='42501');await db.query('update training_private.training_principals set is_active=false where app_user_id=$1',[users.readonly.app_user_id]);await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:pdf.id}),e=>e.status===401);
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
