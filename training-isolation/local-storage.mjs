import { mkdir,lstat,open,readFile,unlink,rename,chmod,rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { initializeSandboxSchema,sandboxSchemaFingerprint } from './database.mjs';

export const LOCAL_DATA_ROOT=fileURLToPath(new URL('_local-data/',import.meta.url));
const application='host-training-isolation',format=2;
// Only this process's positively closed leases can be reclaimed. Never steal a
// live/unknown lease or infer ownership from a PID that might have been reused.
const releasedLeases=new Map();
const digest=value=>createHash('sha256').update(value).digest('hex');
const name=value=>{if(typeof value!=='string'||!/^[a-z][a-z0-9-]{0,59}$/.test(value)||value==='backups')throw Error('Use a local store name, never a path or connection URL');return value;};
async function directory(path){await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Local storage must be a real directory');await chmod(path,0o700);}
async function json(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink()||s.size>64*1024*1024)throw Error('Invalid local metadata file');return JSON.parse(await readFile(path,'utf8'));}
async function exclusiveWrite(path,value){if(Buffer.byteLength(value)>64*1024*1024)throw Error('Local snapshot exceeds its supported size');const f=await open(path,'wx',0o600);try{await f.writeFile(value);await f.sync();}finally{await f.close();}}
function unpack(e,fingerprint){
  if(e.application!==application||e.format!==format||typeof e.dump_base64!=='string')throw Error('Invalid local snapshot');
  validateManifest(e.manifest,fingerprint);
  const dump=Buffer.from(e.dump_base64,'base64');
  if(dump.toString('base64')!==e.dump_base64||digest(dump)!==e.dump_sha256)throw Error('Backup checksum mismatch; nothing restored');
  return dump;
}
async function envelope(db,manifest){const dump=Buffer.from(await (await db.dumpDataDir('gzip')).arrayBuffer());return {application,format,manifest,dump_sha256:digest(dump),dump_base64:dump.toString('base64'),created_at:new Date().toISOString()};}
function validateManifest(m,fingerprint){if(m.application!==application||m.format!==format||m.schema_sha256!==fingerprint||m.state!=='ready'||typeof m.instance_id!=='string')throw Error('Unrecognized or incompatible local sandbox; no reset or migration performed');}

async function openStore(store,{create=false,restore=null,beforeCheckpoint}={}) {
  name(store);await directory(LOCAL_DATA_ROOT);
  const lockRoot=join(LOCAL_DATA_ROOT,'_locks');await directory(lockRoot);
  const dir=join(LOCAL_DATA_ROOT,store),marker=join(dir,'sandbox.json'),lock=join(lockRoot,store);
  if(!create&&!restore){try{await lstat(dir);}catch(e){if(e.code==='ENOENT')throw Error('Local sandbox does not exist');throw e;}}
  let fresh=false;
  try{await mkdir(dir,{mode:0o700});fresh=true;}catch(e){if(e.code!=='EEXIST')throw e;}
  const stat=await lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Local store symlinks are not allowed');
  if(fresh&&!create&&!restore)throw Error('Local sandbox does not exist');
  if(restore&&!fresh)throw Error('Restore requires a new store; existing data is never overwritten');
  const fingerprint=await sandboxSchemaFingerprint();
  let manifest;
  if(!fresh)manifest=await json(marker); // Never open unmarked PostgreSQL data.
  // Keep no Node file descriptor open across a WASM database lifetime.
  // Atomic directory creation provides the exclusive, cross-process lease.
  try{await mkdir(lock,{mode:0o700});}catch(e){
    if(e.code!=='EEXIST')throw e;
    const ownerPath=join(lock,'owner.json'),guard=join(lockRoot,'_reclaim-'+store);
    const owner=await json(ownerPath).catch(()=>null);
    if(!owner||owner.pid!==process.pid||releasedLeases.get(owner.nonce)!==store)throw Error('Local sandbox is locked; stop its owner before opening it');
    try{await mkdir(guard,{mode:0o700});}catch{throw Error('Local sandbox is locked; stop its owner before opening it');}
    try{
      const current=await json(ownerPath);
      if(current.nonce!==owner.nonce||current.pid!==process.pid||releasedLeases.get(current.nonce)!==store)throw Error('Local sandbox is locked; stop its owner before opening it');
      await unlink(ownerPath);await rmdir(lock);
      await mkdir(lock,{mode:0o700});
    }finally{await rmdir(guard);}
  }
  const nonce=randomUUID();
  const ownerFile=join(lock,'owner.json');
  let db,closed=false;
  async function release(){
    try{if((await json(ownerFile)).nonce===nonce){await unlink(ownerFile);await rmdir(lock);releasedLeases.set(nonce,store);}}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  try{
    await exclusiveWrite(ownerFile,JSON.stringify({pid:process.pid,nonce,created_at:new Date().toISOString()}));
    if(!fresh)validateManifest(manifest,fingerprint);
    else {
      manifest={application,format,schema_sha256:fingerprint,instance_id:randomUUID(),state:'initializing',created_at:new Date().toISOString()};
      await exclusiveWrite(marker,JSON.stringify(manifest));
    }
    const checkpoint=join(dir,'database.json');
    const load=restore?.dump||(!fresh?unpack(await json(checkpoint),fingerprint):null);
    // PGlite remains in memory. Only this module writes durable, atomic snapshots.
    // This avoids exposing filesystem paths to WASM or its restore implementation.
    db=new PGlite({... (load?{loadDataDir:new Blob([load])}:{}),relaxedDurability:false});
    await db.waitReady;
    if(fresh&&!restore){
      await initializeSandboxSchema(db);
      await db.exec(`create table training_private.local_runtime_metadata (
        singleton boolean primary key default true check(singleton),instance_id uuid not null,
        schema_sha256 text not null,fixture jsonb);
        alter table training_private.local_runtime_metadata enable row level security;
        revoke all on training_private.local_runtime_metadata from public,anon,authenticated;`);
      await db.query('insert into training_private.local_runtime_metadata(instance_id,schema_sha256) values($1,$2)',[manifest.instance_id,fingerprint]);
    }else{
      const identity=(await db.query('select * from training_private.local_runtime_metadata where singleton')).rows[0];
      if(!identity||identity.instance_id!==(restore?restore.manifest.instance_id:manifest.instance_id)||identity.schema_sha256!==fingerprint)throw Error('Local database identity mismatch; data preserved');
      if(restore)await db.transaction(async tx=>{
        await tx.query('update training_private.local_runtime_metadata set instance_id=$1 where singleton',[manifest.instance_id]);
        // A restored copy must never reactivate a previously revoked credential.
        await tx.exec('update training_private.local_sessions set revoked_at=now(); update training_private.training_exam_tokens set revoked_at=now();');
      });
    }
    manifest.state='ready';
    async function persist(){
      beforeCheckpoint?.(); // Optional Node-only diagnostic hook; never an HTTP/CLI input.
      const next=join(dir,'checkpoint-'+randomUUID()+'.json');
      try{await exclusiveWrite(next,JSON.stringify(await envelope(db,manifest)));await rename(next,checkpoint);}
      finally{await unlink(next).catch(e=>{if(e.code!=='ENOENT')throw e;});}
    }
    if(fresh){await persist();const next=join(dir,'sandbox.next.json');await exclusiveWrite(next,JSON.stringify(manifest));await rename(next,marker);}
    let tail=Promise.resolve(),broken=false,closing=false;
    function operation(fn,save=false){
      if(closing)return Promise.reject(Error('Local sandbox is closing'));
      const job=tail.then(async()=>{
        if(closed||broken)throw Error('Local sandbox is unavailable; reopen its last saved snapshot');
        const result=await fn();
        if(save)try{await persist();}catch(e){broken=true;throw Error('Local snapshot could not be saved; further operations are blocked');}
        return result;
      });tail=job.catch(()=>{});return job;
    }
    const managed={
      query:(sql,...args)=>operation(()=>db.query(sql,...args),!/^\s*(select|show|explain)\b/i.test(sql)),
      exec:(...args)=>operation(()=>db.exec(...args),true),
      transaction:fn=>operation(()=>db.transaction(fn),true),
      dumpDataDir:(...args)=>operation(()=>db.dumpDataDir(...args)),
    };
    return {db:managed,store,manifest,async close(){if(closed)return;closing=true;await tail;if(closed)return;closed=true;try{await db.close();}finally{await release();}}};
  }catch(e){try{if(db&&!db.closed)await db.close();}finally{await release();}throw e;}
}

// No arbitrary path, DSN, environment URL, or hosted connection is accepted.
export function openPersistentSandbox(store='demo',options={}) {
  if(!options||typeof options!=='object'||Object.keys(options).some(k=>k!=='beforeCheckpoint')||(options.beforeCheckpoint!==undefined&&typeof options.beforeCheckpoint!=='function'))throw Error('Invalid local sandbox options');
  return openStore(store,{create:true,beforeCheckpoint:options.beforeCheckpoint});
}

export async function backupLocalSandbox(store='demo') {
  const local=await openStore(store);
  try{
    const id='backup-'+randomUUID(),dir=join(LOCAL_DATA_ROOT,'backups');await directory(dir);
    const data=await envelope(local.db,local.manifest);
    await exclusiveWrite(join(dir,id+'.json'),JSON.stringify(data));
    return {backup_id:id,bytes:Buffer.from(data.dump_base64,'base64').length};
  }finally{await local.close();}
}

export async function restoreLocalSandbox(backupId,targetStore) {
  name(targetStore);
  if(typeof backupId!=='string'||!/^backup-[0-9a-f-]{36}$/.test(backupId))throw Error('Invalid local backup ID');
  await directory(LOCAL_DATA_ROOT);const dir=join(LOCAL_DATA_ROOT,'backups');
  const stat=await lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid local backup directory');
  const e=await json(join(dir,backupId+'.json'));
  const fingerprint=await sandboxSchemaFingerprint();
  const dump=unpack(e,fingerprint);
  const local=await openStore(targetStore,{restore:{manifest:e.manifest,dump}});
  try{return {store:targetStore,restored:true};}finally{await local.close();}
}
