import {randomUUID} from 'node:crypto';
import {ApiError} from '../training-isolation/service.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status,message)=>{throw new ApiError(status,message);};
export async function verifyHostedUser(token,{url,key,fetcher=fetch,now=()=>Date.now()}){
 if(typeof token!=='string'||token.length>8192||token.split('.').length!==3)fail(401,'Verified session required');
 let result;try{result=await fetcher(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{fail(503,'Identity provider unavailable');}
 if(!result.ok)fail(401,'Verified session required');
 const user=await result.json();let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{fail(401,'Verified session required');}
 if(!uuid.test(user.id)||user.is_anonymous||claims.sub!==user.id||!uuid.test(claims.session_id)||!Number.isFinite(claims.exp)||claims.exp*1000<=now()||claims.iss!==url+'/auth/v1')fail(401,'Verified session required');
 if(typeof user.email!=='string'||typeof user.email_confirmed_at!=='string')fail(403,'Confirmed email required');
 // Claims are read only after the Auth server validates the signed token.
 // Role and MICO authorization never come from metadata or token role claims.
 return {auth_user_id:user.id,session_id:claims.session_id,email:user.email,email_confirmed:typeof user.email_confirmed_at==='string',mail_confirmation_sent:typeof user.confirmation_sent_at==='string'};
}
export async function currentHostedActor(tx,user,{ownerEmail}){
 const session=(await tx.query('select id from auth.sessions where id=$1 and user_id=$2 for share',[user.session_id,user.auth_user_id])).rows[0];
 if(!session)fail(401,'Session no longer active');
 let principal=(await tx.query('select auth_user_id,app_user_id,role,is_active from training_private.training_principals where auth_user_id=$1 for share',[user.auth_user_id])).rows[0];
 if(!principal&&user.email_confirmed&&user.mail_confirmation_sent&&user.email===ownerEmail){
  // Serialize first owner provisioning; no browser-supplied role or actor is accepted.
  await tx.query("select pg_advisory_xact_lock(hashtext('training-preview-owner-bootstrap'))");
  principal=(await tx.query('select auth_user_id,app_user_id,role,is_active from training_private.training_principals where auth_user_id=$1 for share',[user.auth_user_id])).rows[0];
  if(!principal){
   if((await tx.query("select 1 from training_private.training_principals where role='superadmin'")).rows.length)fail(403,'Administrative account requires review');
   const app_user_id=randomUUID();await tx.query('insert into training_private.training_users(id,display_name) values($1,$2)',[app_user_id,'Administración']);
   principal=(await tx.query("insert into training_private.training_principals(auth_user_id,app_user_id,role,is_active) values($1,$2,'superadmin',true) returning auth_user_id,app_user_id,role,is_active",[user.auth_user_id,app_user_id])).rows[0];
  }
 }
 if(!principal?.is_active)fail(403,'Training account pending administrative authorization');
 return principal;
}
