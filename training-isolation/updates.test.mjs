import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService,provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';

test('optional updates: exact equivalence, preserved history and stale previews',async t=>{
  const db=await createIsolatedDatabase(), service=createTrainingService(db), server=createSandboxHttpServer(service);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`,users={},tokens={};
  let topic,material,v1,v2,v3,e,oldItems,sessions,preview,request;
  async function call(path,body,role='admin'){
    const response=await fetch(url+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(tokens[role]?{authorization:`Bearer ${tokens[role]}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  }
  const program=(source_id,items)=>({...(source_id?{source_id}:{}),title:'DEMO Versioned training',duration_days:14,changelog:'DEMO optional update',items});
  const item=(day,notes,material_ids=[])=>({day,topic_id:topic.id,notes,material_ids});
  async function register(version){
    const host=randomUUID();await db.query('insert into public.hosts(id) values($1)',[host]);
    await db.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)',[host,users.a.app_user_id,users.admin.app_user_id]);
    return (await call('/api/enrollments',{host_id:host,program_version_id:version.id,timezone:'America/Costa_Rica'},'a')).body;
  }
  try{
    for(const [name,role] of [['admin','superadmin'],['sub','subadmin'],['a','edit'],['b','edit'],['read','readonly']]){
      users[name]=await provisionSyntheticUser(db,name,'Update-test-password-ONLY',role);
      tokens[name]=(await call('/api/login',{username:name,password:'Update-test-password-ONLY'},'missing')).body.token;
    }
    topic=(await call('/api/topics',{title:'DEMO Skill',description:'',category:'Training',estimated_minutes:30})).body;
    await call('/api/topics/publish',{id:topic.id});
    material=(await call('/api/materials',{topic_id:topic.id,title:'DEMO Guide',kind:'document',content:'Text',allow_preview:true,allow_download:true})).body;
    await call('/api/materials/publish',{id:material.id});
    v1=(await call('/api/programs',program(null,[item(1,'A',[material.id]),item(2,'B')]))).body;
    await call('/api/programs/publish',{id:v1.id});e=await register(v1);
    oldItems=(await db.query('select * from public.training_program_items where program_version_id=$1 order by day',[v1.id])).rows;
    sessions=(await call('/api/agenda/generate',{enrollment_id:e.id,start_date:'2026-10-20',local_time:'19:00'},'a')).body.sessions;
    const evidence=(await call('/api/evidence',{session_id:sessions[0].id,description:'DEMO practical proof'},'a')).body;
    await call('/api/evidence/review',{evidence_id:evidence.id,decision:'approved',notes:'Validated'},'admin');
    await call('/api/assessments',{session_id:sessions[0].id,score:90,passed:true,notes:'Skill assessed'},'sub');
    await call('/api/items/complete',{session_id:sessions[0].id},'sub');
    v2=(await call('/api/programs',program(v1.id,[item(3,'A',[material.id]),item(4,'B'),item(5,'New requirement')]))).body;
    await call('/api/programs/publish',{id:v2.id});
    await t.test('publication never changes existing enrollments automatically',async()=>{
      assert.equal((await db.query('select program_version_id from public.training_enrollments where id=$1',[e.id])).rows[0].program_version_id,v1.id);
    });
    await t.test('readonly, unrelated recruiter and absent session cannot preview or accept',async()=>{
      const body={enrollment_id:e.id,to_version_id:v2.id};
      assert.equal((await call('/api/program-updates/preview',body,'read')).status,403);
      assert.equal((await call('/api/program-updates/preview',body,'b')).status,404);
      assert.equal((await call('/api/program-updates/preview',body,'missing')).status,401);
    });
    await t.test('preview shows preserved credit, new requirements and revised percentage without writes',async()=>{
      const result=await call('/api/program-updates/preview',{enrollment_id:e.id,to_version_id:v2.id},'a');
      assert.equal(result.status,200);preview=result.body;
      assert.equal(preview.preserved_completed_items,1);assert.equal(preview.preserved_session_items,2);
      assert.equal(preview.new_required_items,1);assert.equal(preview.previous_progress.percent,50);assert.equal(preview.updated_percent,33.33);
      assert.equal((await db.query('select * from public.training_update_history')).rows.length,0);
      request={enrollment_id:e.id,to_version_id:v2.id,expected_from_version_id:v1.id,preview_hash:preview.preview_hash};
    });
    await t.test('forged mappings, scores and missing previews are rejected',async()=>{
      assert.equal((await call('/api/program-updates/accept',{...request,equivalence_map:{}} ,'a')).status,400);
      assert.equal((await call('/api/program-updates/accept',{...request,progress_percent:100},'a')).status,400);
      assert.equal((await call('/api/program-updates/accept',{...request,preview_hash:'bad'},'a')).status,400);
    });
    await t.test('acceptance preserves original sessions, evidence, attendance keys and validators',async()=>{
      const before=(await db.query('select * from public.training_sessions where enrollment_id=$1 order by id',[e.id])).rows;
      const result=await call('/api/program-updates/accept',request,'a');assert.equal(result.status,200);
      assert.equal(result.body.progress.completed_items,1);assert.equal(result.body.progress.percent,33.33);
      assert.deepEqual((await db.query('select * from public.training_sessions where enrollment_id=$1 order by id',[e.id])).rows,before);
      assert.equal((await db.query('select * from public.training_evidence')).rows.length,1);
      const credits=(await db.query('select * from public.training_completions where enrollment_id=$1',[e.id])).rows;
      assert.equal(credits.length,2);assert.ok(credits.every(c=>c.validated_by===users.sub.app_user_id));
      assert.equal((await db.query('select count(distinct validated_at)::integer as n from public.training_completions where enrollment_id=$1',[e.id])).rows[0].n,1);
      const history=(await db.query('select * from public.training_update_history')).rows[0];
      assert.equal(history.previous_progress_percent,'50.00');assert.equal(history.accepted_by,users.a.app_user_id);
    });
    await t.test('repeated acceptance is idempotent and does not duplicate history or audit',async()=>{
      assert.equal((await call('/api/program-updates/accept',request,'a')).body.already_accepted,true);
      assert.equal((await db.query('select * from public.training_update_history')).rows.length,1);
      assert.equal((await db.query("select * from public.training_events where event_type='program_update_accepted'")).rows.length,1);
    });
    await t.test('agenda only proposes genuinely new items and manual scheduling cannot duplicate retained sessions',async()=>{
      const result=await call('/api/agenda/preview',{enrollment_id:e.id,start_date:'2026-11-01',local_time:'19:00'},'a');
      assert.equal(result.status,200);assert.equal(result.body.sessions.length,1);assert.equal(result.body.skipped,2);
      const mapped=(await db.query('select equivalence_map from public.training_update_history')).rows[0].equivalence_map.pairs.find(p=>p.old_item_id===oldItems[1].id);
      assert.equal((await call('/api/sessions',{enrollment_id:e.id,item_id:mapped.new_item_id,scheduled_at:'2026-12-01T01:00:00Z',duration_minutes:30},'a')).status,409);
    });
    await t.test('validating a retained session later advances the current version once',async()=>{
      const proof=(await call('/api/evidence',{session_id:sessions[1].id,description:'Second proof'},'a')).body;
      await call('/api/evidence/review',{evidence_id:proof.id,decision:'approved',notes:'Validated'},'admin');
      await call('/api/assessments',{session_id:sessions[1].id,score:95,passed:true,notes:'Checked'},'sub');
      assert.equal((await call('/api/items/complete',{session_id:sessions[1].id},'sub')).status,200);
      assert.equal((await call('/api/items/complete',{session_id:sessions[1].id},'sub')).body.already_completed,true);
      const workspace=(await call('/api/workspace',undefined,'a')).body;
      assert.equal(workspace.progress[0].completed_items,2);assert.equal(workspace.progress[0].percent,66.67);
    });
    await t.test('changed instructions invalidate equivalence while preserving historical records',async()=>{
      v3=(await call('/api/programs',program(v2.id,[item(3,'A changed',[material.id]),item(4,'B'),item(5,'New requirement')]))).body;
      await call('/api/programs/publish',{id:v3.id});
      const result=await call('/api/program-updates/preview',{enrollment_id:e.id,to_version_id:v3.id},'a');
      assert.equal(result.body.preserved_completed_items,1);assert.equal(result.body.new_required_items,1);assert.equal(result.body.historical_only_items,1);
    });
    await t.test('stale preview is rejected if a session changes before acceptance',async()=>{
      const p=(await call('/api/program-updates/preview',{enrollment_id:e.id,to_version_id:v3.id},'a')).body;
      await db.query('update public.training_sessions set duration_minutes=31 where id=$1',[sessions[1].id]);
      assert.equal((await call('/api/program-updates/accept',{enrollment_id:e.id,to_version_id:v3.id,expected_from_version_id:v2.id,preview_hash:p.preview_hash},'a')).status,409);
      assert.equal((await db.query('select program_version_id from public.training_enrollments where id=$1',[e.id])).rows[0].program_version_id,v2.id);
    });
    await t.test('successive updates retain transitive sessions and carry only exact credit',async()=>{
      const p=(await call('/api/program-updates/preview',{enrollment_id:e.id,to_version_id:v3.id},'a')).body;
      assert.equal((await call('/api/program-updates/accept',{enrollment_id:e.id,to_version_id:v3.id,expected_from_version_id:v2.id,preview_hash:p.preview_hash},'sub')).status,200);
      const workspace=(await call('/api/workspace',undefined,'a')).body;
      assert.equal(workspace.progress[0].completed_items,1);assert.equal(workspace.update_history.length,2);
      assert.equal(workspace.sessions.find(s=>s.id===sessions[0].id).current_item_id,null);
      assert.ok(workspace.sessions.find(s=>s.id===sessions[1].id).current_item_id);
      assert.equal((await call('/api/agenda/preview',{enrollment_id:e.id,start_date:'2026-12-01',local_time:'19:00'},'a')).body.skipped,1);
    });
    await t.test('different program, unpublished version and downgrade cannot be selected',async()=>{
      const other=(await call('/api/programs',program(null,[item(1,'Other')]))).body;await call('/api/programs/publish',{id:other.id});
      const draft=(await call('/api/programs',program(v3.id,[item(1,'Draft')]))).body;
      for(const target of [other.id,draft.id,v1.id]) assert.equal((await call('/api/program-updates/preview',{enrollment_id:e.id,to_version_id:target},'a')).status,409);
    });
    await t.test('completed enrollments cannot update',async()=>{
      const fresh=await register(v1);
      await db.query("update public.training_enrollments set status='completed',completed_at=now() where id=$1",[fresh.id]);
      assert.equal((await call('/api/program-updates/preview',{enrollment_id:fresh.id,to_version_id:v2.id},'a')).status,409);
    });
    await t.test('changed material revisions do not inherit old credit even if topic and notes match',async()=>{
      const changed=(await call('/api/materials',{source_id:material.id,topic_id:topic.id,title:'DEMO Guide revised',kind:'document',content:'Changed requirements',allow_preview:true,allow_download:true})).body;
      await call('/api/materials/publish',{id:changed.id});
      const base=(await call('/api/programs',program(null,[item(1,'Same',[material.id])]))).body;await call('/api/programs/publish',{id:base.id});
      const target=(await call('/api/programs',program(base.id,[item(1,'Same',[changed.id])]))).body;await call('/api/programs/publish',{id:target.id});
      const fresh=await register(base),source=(await db.query('select id from public.training_program_items where program_version_id=$1',[base.id])).rows[0];
      await db.query('insert into public.training_completions(enrollment_id,item_id,validated_by) values($1,$2,$3)',[fresh.id,source.id,users.admin.app_user_id]);
      const result=(await call('/api/program-updates/preview',{enrollment_id:fresh.id,to_version_id:target.id},'a')).body;
      assert.equal(result.preserved_completed_items,0);assert.equal(result.new_required_items,1);assert.equal(result.previous_progress.percent,100);
      assert.equal((await call('/api/materials/download',{id:material.id},'a')).body.content,'Text');
    });
    await t.test('ambiguous repeated practices moved to different days are not silently credited',async()=>{
      const base=(await call('/api/programs',program(null,[item(1,''),item(2,'')]))).body;await call('/api/programs/publish',{id:base.id});
      const target=(await call('/api/programs',program(base.id,[item(3,''),item(4,'')]))).body;await call('/api/programs/publish',{id:target.id});
      const fresh=await register(base),sources=(await db.query('select id from public.training_program_items where program_version_id=$1',[base.id])).rows;
      for(const source of sources)await db.query('insert into public.training_completions(enrollment_id,item_id,validated_by) values($1,$2,$3)',[fresh.id,source.id,users.admin.app_user_id]);
      const p=(await call('/api/program-updates/preview',{enrollment_id:fresh.id,to_version_id:target.id},'a')).body;
      assert.equal(p.preserved_completed_items,0);assert.equal(p.new_required_items,2);
      await db.query("update public.training_enrollments set status='paused' where id=$1",[fresh.id]);
      const paused=(await call('/api/program-updates/preview',{enrollment_id:fresh.id,to_version_id:target.id},'a')).body;
      assert.equal((await call('/api/program-updates/accept',{enrollment_id:fresh.id,to_version_id:target.id,expected_from_version_id:base.id,preview_hash:paused.preview_hash},'sub')).status,200);
      assert.equal((await db.query('select status from public.training_enrollments where id=$1',[fresh.id])).rows[0].status,'paused');
    });
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await db.close();}
});
