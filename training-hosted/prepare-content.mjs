// Generate a private, guarded seed transaction from the reviewed file. No bank in Git.
import {PGlite} from '../training-isolation/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parsePrivateExamFile} from '../src/components/training/privateExamImport.mjs';
import {createTrainingService} from '../training-isolation/service.mjs';
const [bankPath,output,mode='--draft-only']=process.argv.slice(2);if(!['--draft-only','--publish-reviewed'].includes(mode))throw Error('Choose explicit draft or reviewed-publication mode');if(!bankPath||!output)throw Error('Private input and private output paths required');
const bank=parsePrivateExamFile(await readFile(bankPath,'utf8')),db=new PGlite();await db.waitReady;
try{
 await db.exec("create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;");
 await db.exec(await readFile(new URL('schema.sql',import.meta.url),'utf8'));
 const publisher=randomUUID();await db.query('insert into training_private.training_users(id,display_name) values($1,$2)',[publisher,'Preparación del contenido aceptado']);
 const service=createTrainingService(db,{verifiedActor:async()=>({auth_user_id:randomUUID(),app_user_id:publisher,role:'superadmin'})});
 const preview=await service.previewAcceptedCourse('preparation',{}),loaded=await service.loadAcceptedCourse('preparation',{expected_hash:preview.source_hash,confirmed:true});
 const links=(await db.query("select details from public.training_events where event_type='accepted_course_loaded'")).rows[0].details.links;
 if(mode==='--publish-reviewed'){for(const link of links){await service.publishTopic('preparation',{id:link.topic_id});await service.publishMaterial('preparation',{id:link.material_id});}await service.publishProgram('preparation',{id:loaded.program_id});await service.publishExam('preparation',{exam_key:'Evaluación inicial de capacitación',pass_percent:75,questions:bank.questions});}
 const tables=['training_private.training_users','public.training_topics','public.training_materials','public.training_program_versions','public.training_program_items','public.training_program_materials','training_private.local_material_content','public.training_exam_versions','public.training_exam_questions','training_private.training_exam_keys','public.training_events'];
 const quote=value=>value===null?'null':typeof value==='boolean'?(value?'true':'false'):typeof value==='number'?String(value):"'"+(value instanceof Date?value.toISOString():typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")+"'";
 let sql="begin;do $$ begin if exists(select 1 from public.training_program_versions) or exists(select 1 from public.training_exam_versions) then raise exception 'Reviewed course already exists; no overwrite';end if;end $$;\n";
 for(const table of tables){const rows=(await db.query('select * from '+table)).rows;for(const row of rows)sql+='insert into '+table+'('+Object.keys(row).map(key=>'"'+key+'"').join(',')+') values('+Object.values(row).map(quote).join(',')+');\n';}
 sql+='commit;';await writeFile(output,sql,{mode:0o600});console.log(mode==='--draft-only'?'Draft catalogue transaction prepared: 14 topics, 14 guides, no exam or keys.':'Reviewed private publication transaction prepared; separate authorization required.');
}finally{await db.close();}
