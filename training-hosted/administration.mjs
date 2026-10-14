import {randomUUID,createHash} from 'node:crypto';
import {ApiError} from '../training-isolation/service.mjs';
const fail=(status,message)=>{throw new ApiError(status,message);};
const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))fail(400,'Invalid ID');return value;};
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail(400,'Invalid text');return value.trim();};
const optional=value=>value===''||value===null?null:text(value,500);
const mico=value=>{if(value===''||value===null)return null;if(typeof value!=='string'||!/^[0-9]{1,32}$/.test(value))fail(400,'Invalid MICO profile ID');return value;};
function fields(body,names){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!names.includes(key)))fail(400,'Invalid fields');}
const revision=(row,kind)=>createHash('sha256').update(JSON.stringify(kind==='user'?[row.app_user_id||null,row.role||null,row.is_active??null,row.display_name||'',row.mico_id||null,row.legacy_user_key||null]:[row.id,row.display_name,row.mico_id||null,row.legacy_host_key||null,row.recruiter_id])).digest('hex');
export async function hostedAdministration(tx,actor,path,body){
 if(!['superadmin','subadmin'].includes(actor.role))fail(403,'Administrative permission required');
 if(path==='/api/identity/list'){fields(body,[]);return {users:(await tx.query("select u.id as auth_user_id,u.email,u.email_confirmed_at is not null as confirmed,p.app_user_id,p.role,p.is_active,a.display_name,a.mico_id,a.legacy_user_key from auth.users u left join training_private.training_principals p on p.auth_user_id=u.id left join training_private.training_users a on a.id=p.app_user_id where u.is_anonymous=false order by u.email")).rows.map(row=>({...row,revision_hash:revision(row,'user')})),hosts:(await tx.query('select h.*,a.recruiter_id from training_private.training_hosts h join training_private.training_host_assignments a on a.host_id=h.id order by h.display_name,h.id')).rows.map(row=>({...row,revision_hash:revision(row,'host')}))};}
 if(body.confirmed!==true)fail(400,'Explicit administrative confirmation required');
 if(path==='/api/identity/user'){
  if(actor.role!=='superadmin')fail(403,'Superadmin permission required');fields(body,['auth_user_id','display_name','mico_id','legacy_user_key','role','is_active','confirmed','expected_hash']);
  const auth=uuid(body.auth_user_id);if(!['superadmin','subadmin','edit','readonly'].includes(body.role)||typeof body.is_active!=='boolean')fail(400,'Invalid role or activity');
  if(auth===actor.auth_user_id&&(body.role!=='superadmin'||!body.is_active))fail(409,'Preserve current administrative access');
  if(!(await tx.query('select id from auth.users where id=$1 and email_confirmed_at is not null and is_anonymous=false for share',[auth])).rows.length)fail(409,'Verified email account required');
  let principal=(await tx.query('select p.app_user_id,p.role,p.is_active,a.display_name,a.mico_id,a.legacy_user_key from training_private.training_principals p join training_private.training_users a on a.id=p.app_user_id where p.auth_user_id=$1 for update of p,a',[auth])).rows[0];
  if(body.expected_hash!==revision(principal||{},'user'))fail(409,'Profile changed; review again');
  const id=principal?.app_user_id||randomUUID(),name=text(body.display_name,120),mico_id=mico(body.mico_id),legacy=optional(body.legacy_user_key);
  await tx.query('insert into training_private.training_users(id,display_name,mico_id,legacy_user_key) values($1,$2,$3,$4) on conflict(id) do update set display_name=excluded.display_name,mico_id=excluded.mico_id,legacy_user_key=excluded.legacy_user_key',[id,name,mico_id,legacy]);
  await tx.query('insert into training_private.training_principals(auth_user_id,app_user_id,role,is_active) values($1,$2,$3,$4) on conflict(auth_user_id) do update set role=excluded.role,is_active=excluded.is_active',[auth,id,body.role,body.is_active]);
  await tx.query("insert into public.training_events(actor_app_user_id,event_type,entity_type,entity_id,details) values($1,'identity_user_reviewed','training_user',$2,$3)",[actor.app_user_id,id,JSON.stringify({role:body.role,is_active:body.is_active})]);return {saved:true};
 }
 if(path==='/api/identity/host'){
  fields(body,['id','display_name','mico_id','legacy_host_key','recruiter_id','confirmed','expected_hash']);const id=body.id?uuid(body.id):randomUUID(),recruiter=uuid(body.recruiter_id);
  if(!(await tx.query('select app_user_id from training_private.training_principals where app_user_id=$1 and is_active for share',[recruiter])).rows.length)fail(409,'Active assigned account required');
  if(body.id){const prior=(await tx.query('select h.*,a.recruiter_id from training_private.training_hosts h join training_private.training_host_assignments a on a.host_id=h.id where h.id=$1 for update of h,a',[id])).rows[0];if(!prior)fail(404,'Training host unavailable');if(body.expected_hash!==revision(prior,'host'))fail(409,'Assignment changed; review again');}else if(body.expected_hash!==null)fail(400,'Invalid new assignment review');
  await tx.query('insert into training_private.training_hosts(id,display_name,mico_id,legacy_host_key) values($1,$2,$3,$4) on conflict(id) do update set display_name=excluded.display_name,mico_id=excluded.mico_id,legacy_host_key=excluded.legacy_host_key',[id,text(body.display_name,120),mico(body.mico_id),optional(body.legacy_host_key)]);
  await tx.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3) on conflict(host_id) do update set recruiter_id=excluded.recruiter_id,assigned_by=excluded.assigned_by,assigned_at=now()',[id,recruiter,actor.app_user_id]);
  await tx.query("insert into public.training_events(actor_app_user_id,event_type,entity_type,entity_id,details) values($1,'identity_host_assigned','training_host',$2,$3)",[actor.app_user_id,id,JSON.stringify({recruiter_id:recruiter})]);return {saved:true};
 }
 fail(404,'Identity route unavailable');
}
