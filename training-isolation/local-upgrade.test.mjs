import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rm,lstat,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {initializeSandboxSchema,PRE_EVIDENCE_SCHEMA,sandboxSchemaFingerprint} from './database.mjs';
import {LOCAL_DATA_ROOT,openPersistentSandbox,upgradeLocalSandbox,backupLocalSandbox,restoreLocalSandbox} from './local-storage.mjs';
import {preparePersistentDemo} from './local-runtime.mjs';
import {createTrainingService} from './service.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';
import {imageFixture} from './image-fixtures.mjs';
import {reportlabFixture} from './pdf-fixtures.mjs';
import {videoFixture} from './video-fixtures.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const password='Synthetic-offline-upgrade-password';
async function rows(db){
 const tables=(await db.query(`select schemaname,tablename from pg_tables where schemaname in ('auth','public','training_private') order by schemaname,tablename`)).rows,result={};
 for(const {schemaname:s,tablename:n} of tables){
  if(['local_runtime_metadata','local_evidence_content','local_sessions','training_exam_tokens'].includes(n))continue;
  result[s+'.'+n]=(await db.query(`select * from "${s}"."${n}"`)).rows.map(x=>JSON.stringify(x)).sort();
 }
 return result;
}
test('explicit local upgrade preserves the previous store and creates an independent private copy',async t=>{
 const source='qa-upgrade-'+randomUUID(),target='qa-copy-'+randomUUID(),restored='qa-restore-'+randomUUID(),link='qa-link-'+randomUUID(),failed='qa-failed-'+randomUUID();
 const names=[source,target,restored,link,failed],sourceDir=join(LOCAL_DATA_ROOT,source),lock=join(LOCAL_DATA_ROOT,'_locks',source);
 let db,copy,backup,fixture,token,invitation,before,marker,checkpoint,afterCopy,exports={},downloads={},materials=[];
 try{
  await t.test('preceding-schema fixture includes a completed enrollment, active quiz and private files',async()=>{
   db=new PGlite();await db.waitReady;await initializeSandboxSchema(db);
   await db.exec(`drop table training_private.local_evidence_content;
    create table training_private.local_runtime_metadata(singleton boolean primary key default true check(singleton),instance_id uuid not null,schema_sha256 text not null,fixture jsonb);
    alter table training_private.local_runtime_metadata enable row level security;
    revoke all on training_private.local_runtime_metadata from public,anon,authenticated;`);
   const id=randomUUID();await db.query('insert into training_private.local_runtime_metadata(instance_id,schema_sha256) values($1,$2)',[id,PRE_EVIDENCE_SCHEMA]);
   fixture=await preparePersistentDemo(db,password);const service=createTrainingService(db);
   token=(await service.login({username:'demo-superadmin',password})).token;
   const recruiter=(await service.login({username:'demo-edit',password})).token;
   const scenario=await seedClosingScenario(db,service,{admin:token,recruiter},{validated:2,demo:fixture.demo});
   const p=await service.previewClosing(token,{enrollment_id:scenario.e.id,attempt_id:scenario.quiz.attempt.attempt_id});
   await service.completeTraining(token,{enrollment_id:p.enrollment_id,attempt_id:p.quiz.attempt_id,expected_program_version_id:p.program_version_id,preview_hash:p.preview_hash,notes:'DEMO retained closing'});
   const record=(await service.workspace(token)).closing_records[0];
   for(const format of ['html','json'])exports[format]=await service.exportClosing(token,{record_id:record.id,format});
   const active=await service.enroll(recruiter,{host_id:fixture.demo.host_id,program_version_id:fixture.demo.program_version_id,timezone:'UTC'});
   invitation=await service.issueExam(recruiter,{enrollment_id:active.id,exam_version_id:scenario.quiz.issued.assignment.exam_version_id,max_attempts:2,expires_at:new Date(Date.now()+86400000).toISOString()});
   const topic=await service.saveTopic(token,{title:'DEMO upgrade files',description:'DEMO private files',category:'DEMO',estimated_minutes:5});await service.publishTopic(token,{id:topic.id});
   const payload={title:'DEMO image',topic_id:topic.id,allow_preview:true,allow_download:true};
   materials.push(await service.saveImageMaterial(token,{...payload,image_base64:imageFixture().toString('base64')}));
   materials.push(await service.savePDFMaterial(token,{title:'DEMO PDF',topic_id:topic.id,allow_download:true,pdf_base64:reportlabFixture().toString('base64')}));
   materials.push(await service.saveVideoMaterial(token,{...payload,title:'DEMO video',video_base64:videoFixture().toString('base64')}));
   for(const m of materials){await service.publishMaterial(token,{id:m.id});downloads[m.id]=await service.downloadMaterial(token,{id:m.id});}
   before=await rows(db);
   const manifest={application:'host-training-isolation',format:2,schema_sha256:PRE_EVIDENCE_SCHEMA,instance_id:id,state:'ready',created_at:new Date().toISOString()};
   const dump=Buffer.from(await(await db.dumpDataDir('gzip')).arrayBuffer());
   await mkdir(sourceDir,{recursive:true,mode:0o700});marker=JSON.stringify(manifest);
   checkpoint=JSON.stringify({application:manifest.application,format:2,manifest,dump_sha256:hash(dump),dump_base64:dump.toString('base64')});
   await writeFile(join(sourceDir,'sandbox.json'),marker,{mode:0o600});await writeFile(join(sourceDir,'database.json'),checkpoint,{mode:0o600});
   await db.close();db=null;globalThis.gc?.();
  });
  await t.test('old normal startup, paths, same target and unknown leases are rejected',async()=>{
   await assert.rejects(()=>openPersistentSandbox(source),/incompatible/);
   await assert.rejects(()=>upgradeLocalSandbox(source,source),/different new store/);
   for(const bad of ['../main','postgres://prod/db','/tmp/copy','backups'])await assert.rejects(()=>upgradeLocalSandbox(source,bad),/local store name/);
   await mkdir(lock);await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,nonce:randomUUID()}));
   await assert.rejects(()=>upgradeLocalSandbox(source,target),/locked/);await assert.rejects(()=>lstat(join(LOCAL_DATA_ROOT,target)),{code:'ENOENT'});await rm(lock,{recursive:true});
  });
  await t.test('checksum, outer identity and unknown schemas fail before destination creation',async()=>{
   const e=JSON.parse(checkpoint);
   await writeFile(join(sourceDir,'database.json'),JSON.stringify({...e,dump_sha256:'0'.repeat(64)}));await assert.rejects(()=>upgradeLocalSandbox(source,failed),/checksum/);
   await writeFile(join(sourceDir,'database.json'),JSON.stringify({...e,manifest:{...e.manifest,instance_id:randomUUID()}}));await assert.rejects(()=>upgradeLocalSandbox(source,failed),/identity/);
   await writeFile(join(sourceDir,'database.json'),checkpoint);
   await writeFile(join(sourceDir,'sandbox.json'),JSON.stringify({...e.manifest,schema_sha256:'unknown'}));await assert.rejects(()=>upgradeLocalSandbox(source,failed),/incompatible/);
   await writeFile(join(sourceDir,'sandbox.json'),marker);await assert.rejects(()=>lstat(join(LOCAL_DATA_ROOT,failed)),{code:'ENOENT'});
  });
  await t.test('upgrade preserves source bytes, history and IDs, with no destination overwrite',async()=>{
   assert.deepEqual(await upgradeLocalSandbox(source,target),{store:target,upgraded:true,source_preserved:true});
   assert.equal(await readFile(join(sourceDir,'sandbox.json'),'utf8'),marker);assert.equal(await readFile(join(sourceDir,'database.json'),'utf8'),checkpoint);
   copy=await openPersistentSandbox(target);assert.equal(copy.manifest.schema_sha256,await sandboxSchemaFingerprint());assert.notEqual(copy.manifest.instance_id,JSON.parse(marker).instance_id);
   assert.deepEqual(await rows(copy.db),before);assert.equal((await copy.db.query('select count(*)::int n from training_private.local_evidence_content')).rows[0].n,0);
   assert.equal((await lstat(join(LOCAL_DATA_ROOT,target,'database.json'))).mode&0o777,0o600);await assert.rejects(()=>upgradeLocalSandbox(source,target),/never overwritten/);
  });
  await t.test('copy revokes sessions and invitations while retaining passwords, exports and all file bytes',async()=>{
   const service=createTrainingService(copy.db);await assert.rejects(()=>service.workspace(token),e=>e.status===401);await assert.rejects(()=>service.examStatus(invitation.invitation_token,{}),e=>e.status===404);
   for(const table of ['local_sessions','training_exam_tokens'])assert.equal((await copy.db.query(`select count(*)::int n from training_private.${table} where revoked_at is null`)).rows[0].n,0);
   const fresh=(await service.login({username:'demo-superadmin',password})).token;
   for(const m of materials)assert.deepEqual(await service.downloadMaterial(fresh,{id:m.id}),downloads[m.id]);
   const record=(await service.workspace(fresh)).closing_records[0];for(const format of ['html','json'])assert.deepEqual(await service.exportClosing(fresh,{record_id:record.id,format}),exports[format]);
   assert.equal((await preparePersistentDemo(copy.db)).created,false);
   await copy.db.transaction(async tx=>{await tx.exec('set local role authenticated');await assert.rejects(()=>tx.query('select * from training_private.local_evidence_content'),e=>e.code==='42501');});
   assert.equal(await readFile(join(sourceDir,'database.json'),'utf8'),checkpoint);afterCopy=await rows(copy.db);
  });
  await t.test('upgraded copy reopens and supports current-format backup and restore',async()=>{
   await copy.close();copy=null;globalThis.gc?.();copy=await openPersistentSandbox(target);assert.deepEqual(await rows(copy.db),afterCopy);
   await copy.close();copy=null;globalThis.gc?.();backup=await backupLocalSandbox(target);await restoreLocalSandbox(backup.backup_id,restored);copy=await openPersistentSandbox(restored);
   const service=createTrainingService(copy.db),fresh=(await service.login({username:'demo-superadmin',password})).token;for(const m of materials)assert.deepEqual(await service.downloadMaterial(fresh,{id:m.id}),downloads[m.id]);
   await copy.close();copy=null;globalThis.gc?.();
  });
  await t.test('internal identity mismatch leaves the copy unready and never changes the source',async()=>{
   const e=JSON.parse(checkpoint),fake={...e.manifest,instance_id:randomUUID()};
   const changedMarker=JSON.stringify(fake),changedSnapshot=JSON.stringify({...e,manifest:fake});
   await writeFile(join(sourceDir,'sandbox.json'),changedMarker);await writeFile(join(sourceDir,'database.json'),changedSnapshot);
   await assert.rejects(()=>upgradeLocalSandbox(source,failed),/database identity mismatch/);
   assert.equal(JSON.parse(await readFile(join(LOCAL_DATA_ROOT,failed,'sandbox.json'),'utf8')).state,'initializing');
   await assert.rejects(()=>openPersistentSandbox(failed),/incompatible/);
   await assert.rejects(()=>upgradeLocalSandbox(source,failed),/never overwritten/);
   assert.equal(await readFile(join(sourceDir,'sandbox.json'),'utf8'),changedMarker);assert.equal(await readFile(join(sourceDir,'database.json'),'utf8'),changedSnapshot);
   await writeFile(join(sourceDir,'sandbox.json'),marker);await writeFile(join(sourceDir,'database.json'),checkpoint);globalThis.gc?.();
  });
  await t.test('symlink and current-schema sources are refused',async()=>{
   await symlink(sourceDir,join(LOCAL_DATA_ROOT,link));await assert.rejects(()=>upgradeLocalSandbox(link,failed),/source/);await assert.rejects(()=>upgradeLocalSandbox(target,failed),/incompatible/);
   assert.equal(await readFile(join(sourceDir,'sandbox.json'),'utf8'),marker);assert.equal(await readFile(join(sourceDir,'database.json'),'utf8'),checkpoint);
  });
 }finally{
  if(db)await db.close();if(copy)await copy.close();for(const n of names){await rm(join(LOCAL_DATA_ROOT,n),{recursive:true,force:true});await rm(join(LOCAL_DATA_ROOT,'_locks',n),{recursive:true,force:true});}if(backup)await rm(join(LOCAL_DATA_ROOT,'backups',backup.backup_id+'.json'),{force:true});
 }
});
