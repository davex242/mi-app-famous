import assert from 'node:assert/strict';
import {verifyHostedUser,currentHostedActor} from './identity.mjs';
const url='https://aaaaaaaaaaaaaaaaaaaa.supabase.co',uid='00000000-0000-0000-0000-000000000001',sid='00000000-0000-0000-0000-000000000002';let checks=0;
const token=claims=>'x.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid,exp:2000000000,iss:url+'/auth/v1',...claims})).toString('base64url')+'.signature';
const fetcher=async()=>({ok:true,json:async()=>({id:uid,email:'owner@example.invalid',email_confirmed_at:'2026-01-01'})});
const user=await verifyHostedUser(token({}),{url,key:'synthetic',fetcher,now:()=>1000});assert.equal(user.auth_user_id,uid);checks++;
for(const claims of [{sub:sid},{session_id:'forged'},{exp:0},{iss:'https://wrong.invalid/auth/v1'}]){await assert.rejects(verifyHostedUser(token(claims),{url,key:'synthetic',fetcher,now:()=>1000}),e=>e.status===401);checks++;}
await assert.rejects(verifyHostedUser(token({}),{url,key:'synthetic',fetcher:async()=>({ok:false})}),e=>e.status===401);checks++;
await assert.rejects(currentHostedActor({query:async()=>({rows:[]})},user,{ownerEmail:'owner@example.invalid'}),e=>e.status===401);checks++;
const actor={auth_user_id:uid,app_user_id:sid,role:'readonly',is_active:true};const tx={query:async sql=>({rows:sql.includes('auth.sessions')?[{id:sid}]:[actor]})};assert.equal((await currentHostedActor(tx,user,{ownerEmail:'owner@example.invalid'})).role,'readonly');checks++;
actor.is_active=false;await assert.rejects(currentHostedActor(tx,user,{ownerEmail:'owner@example.invalid'}),e=>e.status===403);checks++;
console.log(`${checks} hosted identity verification checks passed.`);
