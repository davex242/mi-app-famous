import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,writeFile,mkdir,rm,lstat,symlink,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { openPersistentSandbox,backupLocalSandbox,restoreLocalSandbox,LOCAL_DATA_ROOT } from './local-storage.mjs';
import { preparePersistentDemo,startPersistentSandbox } from './local-runtime.mjs';
import { createTrainingService } from './service.mjs';
import { examTemplate } from './exam-template.mjs';

test('local persistence: restart, isolation, exclusive ownership and backup to a new copy',async t=>{
 const store='qa-'+randomUUID(),copy='qa-'+randomUUID(),foreign='qa-'+randomUUID(),link='qa-'+randomUUID(),badTarget='qa-'+randomUUID();
 const dirs=[store,copy,foreign,link,badTarget],backups=[];let local,service,fixture,tokens={},e,saved,issued,completed,firstLease;
 const password='Only-synthetic-persistent-password';
 t.afterEach(()=>globalThis.gc?.());
 try{
  await t.test('connection URLs and paths cannot be used as stores',async()=>{
   for(const bad of ['postgres://example/db','/tmp/db','../main','file:///tmp/db','backups','a/b','demo?url=production'])await assert.rejects(()=>openPersistentSandbox(bad),/local store name/);
  });
  await t.test('first startup creates a marked independent database and no fixture without a password',async()=>{
   local=await openPersistentSandbox(store);await assert.rejects(()=>preparePersistentDemo(local.db),/TRAINING_DEMO_PASSWORD/);
   firstLease=JSON.parse(await readFile(join(LOCAL_DATA_ROOT,'_locks',store,'owner.json'),'utf8'));
   assert.equal((await local.db.query('select * from public.app_users')).rows.length,0);
   fixture=await preparePersistentDemo(local.db,password);assert.equal(fixture.created,true);assert.equal(fixture.demo.item_ids.length,14);
   assert.equal((await lstat(join(LOCAL_DATA_ROOT,store))).mode&0o777,0o700);
   assert.equal((await lstat(join(LOCAL_DATA_ROOT,store,'sandbox.json'))).mode&0o777,0o600);
   service=createTrainingService(local.db);
   for(const role of ['superadmin','edit','readonly'])tokens[role]=(await service.login({username:'demo-'+role,password})).token;
  });
  await t.test('a second owner and live backups are denied without modifying data',async()=>{
   await assert.rejects(()=>openPersistentSandbox(store),/locked/);
   await assert.rejects(()=>backupLocalSandbox(store),/locked/);
   assert.equal((await local.db.query('select count(*)::int n from public.training_program_items')).rows[0].n,14);
  });
  await t.test('real API mutations include validated practice, published text and a passing quiz',async()=>{
   e=await service.enroll(tokens.edit,{host_id:fixture.demo.host_id,program_version_id:fixture.demo.program_version_id,timezone:'America/Costa_Rica'});
   const session=await service.schedule(tokens.edit,{enrollment_id:e.id,item_id:fixture.demo.item_ids[0],scheduled_at:'2026-11-01T01:00:00Z',duration_minutes:30});
   const evidence=await service.submitEvidence(tokens.edit,{session_id:session.id,description:'DEMO persistent practical evidence'});
   await service.reviewEvidence(tokens.superadmin,{evidence_id:evidence.id,decision:'approved',notes:'DEMO verified'});
   await service.assess(tokens.superadmin,{session_id:session.id,score:90,passed:true,notes:'DEMO practical assessment'});
   await service.completeItem(tokens.superadmin,{session_id:session.id});
   const oldItems=(await local.db.query('select day,topic_id,notes from public.training_program_items where program_version_id=$1 order by day',[fixture.demo.program_version_id])).rows;
   const next=await service.saveProgram(tokens.superadmin,{source_id:fixture.demo.program_version_id,title:'DEMO durable updated program',duration_days:15,changelog:'DEMO extra practice',items:[...oldItems.map(i=>({...i,material_ids:[]})),{day:15,topic_id:oldItems[0].topic_id,notes:'DEMO new requirement',material_ids:[]}]});
   await service.publishProgram(tokens.superadmin,{id:next.id});
   const preview=await service.previewUpdate(tokens.edit,{enrollment_id:e.id,to_version_id:next.id});
   await service.acceptUpdate(tokens.edit,{enrollment_id:e.id,to_version_id:next.id,expected_from_version_id:fixture.demo.program_version_id,preview_hash:preview.preview_hash});
   const topic=await service.saveTopic(tokens.superadmin,{title:'DEMO durable guide',description:'DEMO guide',category:'DEMO',estimated_minutes:10});await service.publishTopic(tokens.superadmin,{id:topic.id});
   saved=await service.saveMaterial(tokens.superadmin,{title:'DEMO durable document',topic_id:topic.id,kind:'document',content:'DEMO content persists after restart',allow_preview:true,allow_download:true});await service.publishMaterial(tokens.superadmin,{id:saved.id});
   const v=await service.publishExam(tokens.superadmin,{exam_key:'DEMO persistent exam',pass_percent:80,questions:examTemplate()});
   issued=await service.issueExam(tokens.edit,{enrollment_id:e.id,exam_version_id:v.id,max_attempts:2,expires_at:new Date(Date.now()+86400000).toISOString()});
   const attempt=await service.startExam(issued.invitation_token,{});
   completed=await service.submitExam(issued.invitation_token,{attempt_id:attempt.attempt_id,answers:attempt.questions.map((q,i)=>({question_id:q.id,selected_option:examTemplate()[i].correct_option}))});
   assert.equal(completed.score_percent,100);
  });
  let original;
  await t.test('closing and reopening preserves identities, reviews, content and quiz results exactly',async()=>{
   original=JSON.stringify(await service.workspace(tokens.superadmin));await local.close();local=null;
   const lock=join(LOCAL_DATA_ROOT,'_locks',store);
   await mkdir(lock);await writeFile(join(lock,'owner.json'),JSON.stringify({...firstLease,nonce:randomUUID()}));
   await assert.rejects(()=>openPersistentSandbox(store),/locked/); // Unknown same-PID leases are never stolen.
   await rm(lock,{recursive:true});await mkdir(lock);await writeFile(join(lock,'owner.json'),JSON.stringify(firstLease));
   // This exact lease was positively closed in this process; recovery is safe.
   local=await openPersistentSandbox(store);service=createTrainingService(local.db);
   assert.equal(JSON.stringify(await service.workspace(tokens.superadmin)),original);
   const w=await service.workspace(tokens.superadmin);assert.equal(w.update_history.length,1);assert.equal(w.progress[0].completed_items,1);assert.equal(w.progress[0].total_items,15);
   assert.equal((await service.previewMaterial(tokens.edit,{id:saved.id})).content,'DEMO content persists after restart');
   assert.equal((await service.examStatus(issued.invitation_token,{})).attempts[0].attempt_id,completed.attempt_id);
   assert.equal((await preparePersistentDemo(local.db,'A different password must not reset users')).created,false);
   assert.equal((await service.login({username:'demo-edit',password})).sandbox,true);
   await assert.rejects(()=>service.login({username:'demo-edit',password:'A different password must not reset users'}),e=>e.status===401);
   assert.equal((await local.db.query('select count(*)::int n from public.hosts')).rows[0].n,1);
  });
  await t.test('RLS restrictions and revocations still apply after restart',async()=>{
   assert.equal((await service.workspace(tokens.readonly)).exam_attempts.length,0);
   await assert.rejects(()=>service.issueExam(tokens.readonly,{}),e=>e.status===403);
   await local.db.transaction(async tx=>{await tx.exec('set local role authenticated');await assert.rejects(()=>tx.query('select * from training_private.local_runtime_metadata'),e=>e.code==='42501');});
   await service.revokeExam(tokens.edit,{assignment_id:issued.assignment.id});
   await local.close();local=await openPersistentSandbox(store);service=createTrainingService(local.db);
   await assert.rejects(()=>service.examStatus(issued.invitation_token,{}),e=>e.status===404);
  });
  await t.test('foreign directories and store symlinks are rejected without bootstrapping',async()=>{
   await mkdir(join(LOCAL_DATA_ROOT,foreign));await writeFile(join(LOCAL_DATA_ROOT,foreign,'keep.txt'),'untouched');
   await assert.rejects(()=>openPersistentSandbox(foreign));assert.deepEqual(await readdir(join(LOCAL_DATA_ROOT,foreign)),['keep.txt']);
   await symlink(join(LOCAL_DATA_ROOT,foreign),join(LOCAL_DATA_ROOT,link));await assert.rejects(()=>openPersistentSandbox(link),/symlink/);
   assert.equal(await readFile(join(LOCAL_DATA_ROOT,foreign,'keep.txt'),'utf8'),'untouched');
  });
  await t.test('unknown schema fingerprints fail closed without resetting the PostgreSQL directory',async()=>{
   await local.close();local=null;const path=join(LOCAL_DATA_ROOT,store,'sandbox.json'),before=await readFile(path,'utf8'),m=JSON.parse(before);
   await writeFile(path,JSON.stringify({...m,schema_sha256:'unrecognized'}));await assert.rejects(()=>openPersistentSandbox(store),/incompatible/);
   await writeFile(path,before);local=await openPersistentSandbox(store);service=createTrainingService(local.db);assert.equal((await service.workspace(tokens.superadmin)).completions.length,2);
  });
  let backup,liveInvitation;
  await t.test('offline backup is private, excludes plaintext credentials and never enters the repository',async()=>{
   const version=(await local.db.query('select id from public.training_exam_versions')).rows[0].id;
   liveInvitation=await service.issueExam(tokens.edit,{enrollment_id:e.id,exam_version_id:version,max_attempts:2,expires_at:new Date(Date.now()+86400000).toISOString()});
   await local.close();local=null;backup=await backupLocalSandbox(store);backups.push(backup.backup_id);
   await assert.rejects(()=>lstat(join(LOCAL_DATA_ROOT,'_locks',store)),e=>e.code==='ENOENT');
   assert.ok(backup.bytes>0);const path=join(LOCAL_DATA_ROOT,'backups',backup.backup_id+'.json');assert.equal((await lstat(path)).mode&0o777,0o600);
   assert.ok(!(await readFile(path,'utf8')).includes(password));assert.match(await readFile(new URL('.gitignore',import.meta.url),'utf8'),/_local-data\//);
  });
  await t.test('restore never overwrites an existing store and checksum errors create no database',async()=>{
   await assert.rejects(()=>restoreLocalSandbox(backup.backup_id,store),/new store/);
   await assert.rejects(()=>lstat(join(LOCAL_DATA_ROOT,'_locks',store)),e=>e.code==='ENOENT');
   const envelope=JSON.parse(await readFile(join(LOCAL_DATA_ROOT,'backups',backup.backup_id+'.json'),'utf8'));envelope.dump_sha256='bad';
   const badId='backup-'+randomUUID();backups.push(badId);await writeFile(join(LOCAL_DATA_ROOT,'backups',badId+'.json'),JSON.stringify(envelope));
   await assert.rejects(()=>restoreLocalSandbox(badId,badTarget),/checksum/);
   await assert.rejects(()=>lstat(join(LOCAL_DATA_ROOT,badTarget)),e=>e.code==='ENOENT');
  });
  await t.test('restored copy keeps results but revokes staff sessions and public invitations',async()=>{
   await restoreLocalSandbox(backup.backup_id,copy);local=await openPersistentSandbox(copy);service=createTrainingService(local.db);
   await assert.rejects(()=>service.me(tokens.superadmin),e=>e.status===401);
   const newToken=(await service.login({username:'demo-superadmin',password})).token,w=await service.workspace(newToken);
   assert.equal(w.enrollments[0].id,e.id);assert.equal(w.completions.length,2);assert.equal(w.update_history.length,1);assert.equal(w.progress[0].completed_items,1);assert.equal(w.exam_attempts[0].id,completed.attempt_id);assert.equal(w.exam_attempts[0].passed,true);
   assert.ok(w.exam_assignments[0].revoked_at);await assert.rejects(()=>service.examStatus(issued.invitation_token,{}),e=>e.status===404);
   await assert.rejects(()=>service.examStatus(liveInvitation.invitation_token,{}),e=>e.status===404);
   await local.close();local=null;
   
   local=await openPersistentSandbox(store);assert.notEqual(local.manifest.instance_id,JSON.parse(await readFile(join(LOCAL_DATA_ROOT,copy,'sandbox.json'),'utf8')).instance_id);
   assert.equal((await local.db.query('select count(*)::int n from public.training_exam_attempts')).rows[0].n,1);
   assert.equal((await createTrainingService(local.db).examStatus(liveInvitation.invitation_token,{})).can_start,true);
   await local.close();local=null;
  });
  await t.test('HTTP runtime reports the real mode and restart does not reseed or print passwords',async()=>{
   const runtime=await startPersistentSandbox(store,undefined,0);
   try{const url=`http://127.0.0.1:${runtime.server.address().port}`;assert.equal((await (await fetch(url+'/health')).json()).storage,'local-persistent');
    const html=await (await fetch(url)).text();assert.match(html,/Los datos se conservan al reiniciar/);assert.ok(!html.includes(password));assert.ok(!html.includes('mostrada en la consola'));assert.match(await (await fetch(url+'/quiz')).text(),/se conservan al reiniciar/);
    assert.equal(runtime.fixture.created,false);
   }finally{await runtime.close();}
  });
  await t.test('failed checkpoint blocks operations; reopening recovers the last acknowledged snapshot',async()=>{
   let failSave=false;
   local=await openPersistentSandbox(copy,{beforeCheckpoint:()=>{if(failSave)throw Error('Synthetic disk failure');}});
   failSave=true;
   await assert.rejects(()=>local.db.transaction(tx=>tx.query("update public.training_topics set description='UNACKNOWLEDGED'")),/snapshot could not be saved/);
   await assert.rejects(()=>local.db.query('select * from public.training_topics'),/unavailable/);
   await local.close();local=null;
   local=await openPersistentSandbox(copy);assert.ok((await local.db.query('select description from public.training_topics')).rows.every(t=>t.description!=='UNACKNOWLEDGED'));
   await local.close();local=null;
  });
 }finally{if(local)await local.close();for(const dir of dirs){await rm(join(LOCAL_DATA_ROOT,dir),{recursive:true,force:true});await rm(join(LOCAL_DATA_ROOT,'_locks',dir),{recursive:true,force:true});}for(const id of backups)await rm(join(LOCAL_DATA_ROOT,'backups',id+'.json'),{force:true});}
});
