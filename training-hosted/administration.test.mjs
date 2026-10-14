import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '../training-isolation/node_modules/@electric-sql/pglite/dist/index.js';
import {hostedAdministration} from './administration.mjs';
const db=new PGlite();await db.waitReady;let checks=0;
try{
 await db.exec("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");await db.exec(await readFile(new URL('schema.sql',import.meta.url),'utf8'));
 const admin=randomUUID(),adminAuth=randomUUID(),target=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[adminAuth,'admin@example.invalid',target,'recruiter@example.invalid']);await db.query("insert into training_private.training_users(id,display_name) values($1,'Admin')",[admin]);await db.query("insert into training_private.training_principals(auth_user_id,app_user_id,role,is_active) values($1,$2,'superadmin',true)",[adminAuth,admin]);const actor={auth_user_id:adminAuth,app_user_id:admin,role:'superadmin'};
 await assert.rejects(hostedAdministration(db,{...actor,role:'edit'},'/api/identity/list',{}),e=>e.status===403);checks++;
 let data=await hostedAdministration(db,actor,'/api/identity/list',{}),review=data.users.find(u=>u.auth_user_id===target);
 const body={auth_user_id:target,display_name:'Recruiter',mico_id:'00123',legacy_user_key:'reviewed-user-key',role:'edit',is_active:true,confirmed:true,expected_hash:review.revision_hash};
 await assert.rejects(hostedAdministration(db,{...actor,role:'subadmin'},'/api/identity/user',body),e=>e.status===403);checks++;
 await hostedAdministration(db,actor,'/api/identity/user',body);data=await hostedAdministration(db,actor,'/api/identity/list',{});const user=data.users.find(u=>u.auth_user_id===target);assert.equal(user.mico_id,'00123');checks++;assert.equal(user.role,'edit');checks++;
 await assert.rejects(hostedAdministration(db,actor,'/api/identity/user',body),e=>e.status===409);checks++;
 const host={display_name:'Emitter',mico_id:'98765',legacy_host_key:'reviewed-host-key',recruiter_id:user.app_user_id,confirmed:true,expected_hash:null};await hostedAdministration(db,actor,'/api/identity/host',host);data=await hostedAdministration(db,actor,'/api/identity/list',{});assert.equal(data.hosts[0].recruiter_id,user.app_user_id);checks++;
 const previous=data.hosts[0];await hostedAdministration(db,actor,'/api/identity/host',{...host,id:previous.id,recruiter_id:admin,expected_hash:previous.revision_hash});await assert.rejects(hostedAdministration(db,actor,'/api/identity/host',{...host,id:previous.id,expected_hash:previous.revision_hash}),e=>e.status===409);checks++;
 assert.equal((await db.query("select count(*)::int n from public.training_events where event_type='identity_host_assigned'")).rows[0].n,2);checks++;
 const own=data.users.find(u=>u.auth_user_id===adminAuth);await assert.rejects(hostedAdministration(db,actor,'/api/identity/user',{...body,auth_user_id:adminAuth,expected_hash:own.revision_hash,is_active:false}),e=>e.status===409);checks++;
 console.log(`${checks} hosted administrative permission, MICO and stale-review checks passed.`);
}finally{await db.close();}
