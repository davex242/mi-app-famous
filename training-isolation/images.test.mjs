import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {imageFixture,imageChunk} from './image-fixtures.mjs';

test('private PNG materials: strict raster validation, revisions, permissions and pinned programs',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),tokens={},users={};let server,topic,image,second;
 const password='Synthetic-only-private-image-password',png=imageFixture(),b64=png.toString('base64');
 try{
  for(const role of ['superadmin','subadmin','edit','readonly']){users[role]=await provisionSyntheticUser(db,role,password,role);tokens[role]=(await service.login({username:role,password})).token;}
  topic=await service.saveTopic(tokens.superadmin,{title:'DEMO imagen de entrenamiento',description:'Tema con recurso privado',category:'DEMO',estimated_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const body=extra=>({topic_id:topic.id,title:'DEMO imagen',image_base64:b64,allow_preview:true,allow_download:true,...extra});
  const call=async(data,role='superadmin',path='/api/materials/image')=>{const r=await fetch(url+path,{method:'POST',headers:{'content-type':'application/json',...(tokens[role]?{authorization:`Bearer ${tokens[role]}`}:{})},body:JSON.stringify(data)});return{status:r.status,body:await r.json()};};
  const rejected=async bytes=>assert.equal((await call(body({image_base64:bytes.toString('base64')}))).status,400);
  await t.test('authentication and admin role precede file decoding; client paths and MIME claims are rejected',async()=>{
   assert.equal((await call(body(),'none')).status,401);for(const role of ['edit','readonly'])assert.equal((await call(body(),role)).status,403);
   for(const extra of [{storage_path:'../../secret'},{mime:'image/png'},{created_by:users.edit.app_user_id},{status:'published'},{allow_preview:'true'}])assert.equal((await call(body(extra))).status,400);
  });
  await t.test('SVG, HTML, JPEG, fake extension data and noncanonical base64 cannot enter private storage',async()=>{
   for(const bytes of [Buffer.from('<svg onload="alert(1)"/>'),Buffer.from('<html>fake PNG</html>'),Buffer.from([255,216,255,217])])await rejected(bytes);
   for(const data of ['data:image/png;base64,'+b64,b64+'\n',b64.slice(0,-1),'AAAA='])assert.equal((await call(body({image_base64:data}))).status,400);
  });
  await t.test('bad CRC, trailing payload, truncated chunks and invalid critical chunks are rejected',async()=>{
   const corrupt=Buffer.from(png);corrupt[20]^=1;await rejected(corrupt);await rejected(Buffer.concat([png,Buffer.from('<script>trailing</script>')]));await rejected(png.subarray(0,png.length-3));
   await rejected(imageFixture({extra:[imageChunk('ABCD',Buffer.from('unknown'))]}));await rejected(imageFixture({extra:[imageChunk('I\u00c4AT',Buffer.from('unknown'))]}));
  });
  await t.test('animated, indexed, grayscale, interlaced and invalid filter/decompressed lengths are rejected',async()=>{
   await rejected(imageFixture({extra:[imageChunk('acTL',Buffer.alloc(8))]}));await rejected(imageFixture({headerEdit:h=>h[12]=1}));
   for(const color of [0,3,4])await rejected(imageFixture({color}));await rejected(imageFixture({filter:5}));await rejected(imageFixture({raw:Buffer.from([0,1,2,3])}));
  });
  await t.test('compressed/decompressed size and dimension limits deny excessive allocations',async()=>{
   assert.equal((await call(body({image_base64:Buffer.alloc(2*1024*1024+1).toString('base64')}))).status,400);
   await rejected(imageFixture({headerEdit:h=>h.writeUInt32BE(2049)}));
   const head=imageFixture({width:1,height:1,ancillary:false}).subarray(0,33),bomb=Buffer.concat([head,imageChunk('IDAT',deflateSync(Buffer.alloc(1024*1024))),imageChunk('IEND',Buffer.alloc(0))]);await rejected(bomb);
   assert.equal((await call(body({title:'x'.repeat(3*1024*1024)}))).status,413);
  });
  await t.test('upload strips metadata, stores private normalized bytes and remains an unpublished draft',async()=>{
   const response=await call(body(),'subadmin');assert.equal(response.status,200);image=response.body;assert.equal(image.kind,'image');assert.equal(image.created_by,users.subadmin.app_user_id);assert.equal(image.status,'draft');
   const saved=JSON.parse((await db.query('select body from training_private.local_material_content where material_id=$1',[image.id])).rows[0].body),bytes=Buffer.from(saved.data,'base64');
   assert.ok(!bytes.includes(Buffer.from('PRIVATE_METADATA_DEMO')));assert.equal(saved.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(saved.width,320);assert.equal(saved.height,180);
   const w=JSON.stringify(await service.workspace(tokens.superadmin));assert.ok(!w.includes(saved.data));assert.ok(!w.includes('PRIVATE_METADATA_DEMO'));
   for(const role of ['edit','readonly'])await assert.rejects(()=>service.previewMaterial(tokens[role],{id:image.id}),e=>e.status===404);
   assert.equal((await fetch(url+'/'+image.storage_path)).status,404);
  });
  await t.test('publication requires exact published topic; readonly preview/download recheck permissions',async()=>{
   await assert.rejects(()=>service.publishMaterial(tokens.superadmin,{id:image.id}),e=>e.status===409);await service.publishTopic(tokens.superadmin,{id:topic.id});await service.publishMaterial(tokens.superadmin,{id:image.id});
   const p=await service.previewMaterial(tokens.readonly,{id:image.id}),d=await service.downloadMaterial(tokens.readonly,{id:image.id});assert.equal(p.type,'image');assert.equal(d.mime,'image/png');assert.equal(d.image_base64,p.image.data);assert.equal(d.sha256,p.image.sha256);assert.match(d.filename,/\.png$/);
  });
  await t.test('new revision preserves original image and independent access permissions',async()=>{
   second=await service.saveImageMaterial(tokens.superadmin,body({source_id:image.id,image_base64:imageFixture({color:2}).toString('base64'),allow_preview:false,allow_download:false}));await service.publishMaterial(tokens.superadmin,{id:second.id});assert.equal(second.revision,2);
   await assert.rejects(()=>service.previewMaterial(tokens.superadmin,{id:second.id}),e=>e.status===403);await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:second.id}),e=>e.status===403);
   assert.equal((await service.previewMaterial(tokens.edit,{id:image.id})).image.width,320);await assert.rejects(()=>service.saveImageMaterial(tokens.superadmin,body({source_id:image.id})),e=>e.status===409);
   assert.equal((await service.materialEditData(tokens.superadmin,{id:second.id})).image.format,'training-private-png-v1');await assert.rejects(()=>service.materialEditData(tokens.edit,{id:second.id}),e=>e.status===403);
  });
  await t.test('program pins published image revision and refuses missing or corrupted private content',async()=>{
   const program=await service.saveProgram(tokens.superadmin,{title:'DEMO imágenes',duration_days:1,changelog:'Recurso fijado',items:[{day:1,topic_id:topic.id,notes:'Consultar imagen',material_ids:[image.id]}]});
   const before=(await db.query('select body from training_private.local_material_content where material_id=$1',[image.id])).rows[0].body;
   await db.query('update training_private.local_material_content set body=$2 where material_id=$1',[image.id,'{}']);await assert.rejects(()=>service.publishProgram(tokens.superadmin,{id:program.id}),e=>e.status===409);await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:image.id}),e=>e.status===409);
   await db.query('update training_private.local_material_content set body=$2 where material_id=$1',[image.id,before]);await service.publishProgram(tokens.superadmin,{id:program.id});assert.equal((await db.query('select material_id from public.training_program_materials')).rows[0].material_id,image.id);
  });
  await t.test('image upload accepts a valid binary file larger than the ordinary 32 KB body limit',async()=>{
   const raw=randomBytes((128*4+1)*128);for(let row=0;row<128;row++)raw[row*(128*4+1)]=0;
   const bytes=imageFixture({width:128,height:128,raw});assert.ok(bytes.length>32768);
   assert.equal((await call(body({image_base64:bytes.toString('base64')}))).status,200);
   assert.equal((await call({description:'x'.repeat(33000)},'superadmin','/api/sessions')).status,413);
  });
  await t.test('normalized image is private under SQL grants; deactivated staff immediately lose access',async()=>{
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select body from training_private.local_material_content');}),e=>e.code==='42501');
   await db.query('update training_private.training_principals set is_active=false where app_user_id=$1',[users.readonly.app_user_id]);await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:image.id}),e=>e.status===401);
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
