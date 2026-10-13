import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createIsolatedDatabase} from './database.mjs';

test('legacy metadata inventory stays read-only and does not select user/host contents',async t=>{
 const db=await createIsolatedDatabase(),sql=await readFile(new URL('../docs/training-stage-2/legacy-inspection.readonly.sql',import.meta.url),'utf8');
 try{
  // Synthetic extra columns model sensitive row values without relying on the
  // legacy schema or connecting to the app's configured remote service.
  await db.exec("alter table public.app_users add column password_hash text; alter table public.hosts add column host_name text;");
  await db.query('insert into public.app_users(id,password_hash) values($1,$2)',['11111111-1111-1111-1111-111111111111','PRIVATE_CANARY_QA_USER_VALUE']);
  await db.query('insert into public.hosts(id,host_name) values($1,$2)',['22222222-2222-2222-2222-222222222222','PRIVATE_CANARY_QA_HOST_VALUE']);
  await t.test('inventory compiles and returns column/constraint/policy/grant metadata without row values',async()=>{
   const results=await db.exec(sql),serialized=JSON.stringify(results);assert.ok(serialized.includes('password_hash'));assert.ok(serialized.includes('host_name'));assert.ok(serialized.includes('constraint_definition'));assert.ok(!serialized.includes('PRIVATE_CANARY_QA_'));
   assert.equal((await db.query('select count(*)::int n from public.app_users')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from public.hosts')).rows[0].n,1);assert.equal((await db.query('show transaction_read_only')).rows[0].transaction_read_only,'off');
  });
  await t.test('the read-only transaction mode rejects writes rather than trusting a comment',async()=>{
   await db.exec('begin transaction read only');await assert.rejects(()=>db.query('delete from public.app_users'),x=>x.code==='25006');await db.exec('rollback');assert.equal((await db.query('select count(*)::int n from public.app_users')).rows[0].n,1);
  });
 }finally{await db.close();}
});
