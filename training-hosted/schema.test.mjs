import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../training-isolation/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite();await db.waitReady;
try{
 await db.exec("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 await db.exec(await readFile(new URL('schema.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('reader-role.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('enrollment-scope.sql',import.meta.url),'utf8'));
 const permission=(await db.query("select has_table_privilege('authenticated','public.training_exam_questions','select') as exposed")).rows[0];assert.equal(permission.exposed,false);
 const tables=(await db.query("select tablename,rowsecurity from pg_tables where schemaname in ('public','training_private')")).rows;
 assert.ok(tables.length>=25&&tables.every(row=>row.rowsecurity));
 assert.equal((await db.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name in ('hosts','app_users')")).rows[0].n,0);
 await db.transaction(async tx=>{await tx.exec('set local role anon');await assert.rejects(tx.query('select * from training_private.training_exam_keys'));});
 console.log('Standalone hosted schema validated: RLS enabled, private keys denied, no legacy tables created.');
}finally{await db.close();}
