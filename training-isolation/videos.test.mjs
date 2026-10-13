import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {videoFixture} from './video-fixtures.mjs';

test('private MP4: bounded progressive tracks, exact bytes, permissions and published references',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),tokens={},users={},password='Synthetic-only-video-password',bytes=videoFixture();let server,topic,video,second;
 try{
  for(const role of ['superadmin','subadmin','edit','readonly']){users[role]=await provisionSyntheticUser(db,role,password,role);tokens[role]=(await service.login({username:role,password})).token;}
  topic=await service.saveTopic(tokens.superadmin,{title:'DEMO video',description:'Private clip',category:'DEMO',estimated_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  const body=extra=>({topic_id:topic.id,title:'DEMO MP4',video_base64:bytes.toString('base64'),allow_preview:true,allow_download:true,...extra});
  const call=async(data,role='superadmin')=>{const r=await fetch(url+'/api/materials/video',{method:'POST',headers:{'content-type':'application/json',...(tokens[role]?{authorization:`Bearer ${tokens[role]}`}:{})},body:JSON.stringify(data)});return{status:r.status,body:await r.json()};};
  const corrupted=(marker,change)=>{const copy=Buffer.from(bytes),index=copy.indexOf(Buffer.from(marker));assert.ok(index>=0);change(copy,index);return copy.toString('base64');};
  await t.test('identity/admin role, authoritative author and strict upload fields are enforced',async()=>{
   assert.equal((await call(body(),'none')).status,401);for(const role of ['edit','readonly'])assert.equal((await call(body(),role)).status,403);
   for(const extra of [{mime:'video/mp4'},{storage_path:'../../secret'},{created_by:users.edit.app_user_id},{duration_seconds:1},{allow_preview:'true'}])assert.equal((await call(body(extra))).status,400);
  });
  await t.test('fake files, truncated boxes, appended payload and noncanonical base64 are rejected',async()=>{
   for(const source of [Buffer.from('<svg onload="alert(1)"/>'),bytes.subarray(0,-1),Buffer.concat([bytes,Buffer.from('payload')])])assert.equal((await call(body({video_base64:source.toString('base64')}))).status,400);
   assert.equal((await call(body({video_base64:bytes.toString('base64')+'\n'}))).status,400);assert.equal((await call(body({video_base64:corrupted('ftyp',(b,i)=>b.writeUInt32BE(7,i-4))}))).status,400);
  });
  await t.test('duration, dimensions, excessive files and request limits are bounded',async()=>{
   assert.equal((await call(body({video_base64:corrupted('mvhd',(b,i)=>b.writeUInt32BE(61000,i+20))}))).status,400);
   assert.equal((await call(body({video_base64:corrupted('mdhd',(b,i)=>b.writeUInt32BE(b.readUInt32BE(i+16)*61,i+20))}))).status,400);
   assert.equal((await call(body({video_base64:corrupted('avc1',(b,i)=>{const entry=b.indexOf(Buffer.from('avc1'),i+4);assert.ok(entry>0);b.writeUInt16BE(2000,entry+28);})}))).status,400);
   assert.equal((await call(body({video_base64:Buffer.alloc(2*1024*1024+1).toString('base64')}))).status,400);assert.equal((await call(body({title:'x'.repeat(3*1024*1024)}))).status,413);assert.equal((await fetch(url+'/health')).status,200);
  });
  await t.test('unsupported codecs, external data and offsets beyond media bytes cannot publish',async()=>{
   for(const data of [corrupted('avc1',(b,i)=>{const entry=b.indexOf(Buffer.from('avc1'),i+4);b.write('hvc1',entry,'ascii');}),corrupted('url ',(b,i)=>b.writeUInt32BE(0,i+4)),corrupted('stco',(b,i)=>b.writeUInt32BE(bytes.length+1,i+12))])assert.equal((await call(body({video_base64:data}))).status,400);
  });
  await t.test('actual H264/AAC clip enters private storage without leaking bytes through workspace or static routes',async()=>{
   assert.ok(bytes.length>32768);const response=await call(body(),'subadmin');assert.equal(response.status,200);video=response.body;assert.equal(video.kind,'video');assert.equal(video.created_by,users.subadmin.app_user_id);assert.equal(video.status,'draft');
   const stored=JSON.parse((await db.query('select body from training_private.local_material_content where material_id=$1',[video.id])).rows[0].body);assert.equal(stored.width,320);assert.equal(stored.height,180);assert.ok(stored.duration_seconds>=2&&stored.duration_seconds<2.1);assert.equal(stored.audio,true);assert.equal(stored.data,bytes.toString('base64'));assert.equal(stored.sha256,createHash('sha256').update(bytes).digest('hex'));
   assert.ok(!JSON.stringify(await service.workspace(tokens.superadmin)).includes(stored.data));assert.equal((await fetch(url+'/'+video.storage_path)).status,404);await assert.rejects(()=>service.previewMaterial(tokens.edit,{id:video.id}),e=>e.status===404);
  });
  await t.test('publication requires exact published topic; readonly preview/download use verified original bytes',async()=>{
   await assert.rejects(()=>service.publishMaterial(tokens.superadmin,{id:video.id}),e=>e.status===409);await service.publishTopic(tokens.superadmin,{id:topic.id});await service.publishMaterial(tokens.superadmin,{id:video.id});
   const p=await service.previewMaterial(tokens.readonly,{id:video.id}),d=await service.downloadMaterial(tokens.readonly,{id:video.id});assert.equal(p.type,'video');assert.equal(p.mime,'video/mp4');assert.equal(d.video_base64,p.video.data);assert.deepEqual(Buffer.from(d.video_base64,'base64'),bytes);assert.match(d.filename,/\.mp4$/);
  });
  await t.test('new revision preserves old clip and independently disables preview and download',async()=>{
   second=await service.saveVideoMaterial(tokens.superadmin,body({source_id:video.id,allow_preview:false,allow_download:false}));await service.publishMaterial(tokens.superadmin,{id:second.id});assert.equal(second.revision,2);
   await assert.rejects(()=>service.previewMaterial(tokens.superadmin,{id:second.id}),e=>e.status===403);await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:second.id}),e=>e.status===403);assert.ok((await service.previewMaterial(tokens.edit,{id:video.id})).video.duration_seconds<2.1);await assert.rejects(()=>service.saveVideoMaterial(tokens.superadmin,body({source_id:video.id})),e=>e.status===409);assert.equal((await service.materialEditData(tokens.superadmin,{id:second.id})).video.format,'training-private-mp4-v1');
  });
  await t.test('program publication and reads reject inconsistent private clip manifests',async()=>{
   const program=await service.saveProgram(tokens.superadmin,{title:'DEMO video program',duration_days:1,changelog:'Exact video revision',items:[{day:1,topic_id:topic.id,notes:'Watch private clip',material_ids:[video.id]}]});const source=(await db.query('select body from training_private.local_material_content where material_id=$1',[video.id])).rows[0].body;
   await db.query('update training_private.local_material_content set body=$2 where material_id=$1',[video.id,JSON.stringify({...JSON.parse(source),duration_seconds:1})]);await assert.rejects(()=>service.publishProgram(tokens.superadmin,{id:program.id}),e=>e.status===409);await assert.rejects(()=>service.downloadMaterial(tokens.readonly,{id:video.id}),e=>e.status===409);
   await db.query('update training_private.local_material_content set body=$2 where material_id=$1',[video.id,source]);await service.publishProgram(tokens.superadmin,{id:program.id});
  });
  await t.test('private SQL content is inaccessible and deactivation revokes preview/download immediately',async()=>{
   await assert.rejects(()=>db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select body from training_private.local_material_content');}),e=>e.code==='42501');await db.query('update training_private.training_principals set is_active=false where app_user_id=$1',[users.readonly.app_user_id]);for(const operation of ['previewMaterial','downloadMaterial'])await assert.rejects(()=>service[operation](tokens.readonly,{id:video.id}),e=>e.status===401);
  });
 }finally{if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
