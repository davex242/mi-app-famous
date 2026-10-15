import assert from 'node:assert/strict';
import {build} from '../node_modules/esbuild/lib/main.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const directory=await mkdtemp(join(tmpdir(),'training-refresh-')),store=new Map(),calls=[];
const project='https://aaaaaaaaaaaaaaaaaaaa.supabase.co',now=Date.now(),originalNow=Date.now;
let release,refreshStarted;
const pendingRefresh=new Promise(resolve=>refreshStarted=resolve);
globalThis.window={location:{protocol:'https:',origin:'https://preview.example.invalid'}};
globalThis.sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
globalThis.fetch=async(url,options)=>{
 calls.push({url,options});
 if(url.includes('grant_type=refresh_token')){refreshStarted();return new Promise(resolve=>release=()=>resolve({ok:true,json:async()=>({access_token:'revived.training.token',refresh_token:'revived-refresh',expires_in:3600})}));}
 if(url.includes('grant_type=password'))return {ok:true,json:async()=>({access_token:'original.training.token',refresh_token:'original-refresh',expires_in:3600})};
 if(url.includes('/auth/v1/logout'))return {ok:true};
 if(url.endsWith('/health'))return {ok:true,json:async()=>({storage:'hosted-preview',initialized:true})};
 if(new URL(url,'https://preview.example.invalid').searchParams.get('route')==='/api/me')return {ok:true,json:async()=>({sandbox:true,role:'edit'})};
 return {ok:true,json:async()=>({sandbox:true,...Object.fromEntries(['trainees','enrollments','topics','materials','program_versions','program_items','program_materials','sessions','attendance','evidence','assessments','approvals','completions','events','update_history','exams','exam_assignments','exam_attempts','exam_attempt_budgets','closing_records','progress'].map(k=>[k,[]]))})};
};
try{
 const output=join(directory,'api.mjs');await build({entryPoints:[new URL('../src/components/training/HostedTrainingApi.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',outfile:output});
 const {HostedTrainingApi}=await import(pathToFileURL(output));const api=new HostedTrainingApi({enabled:true,url:project,key:'synthetic-public-key'});
 await api.login('FICTITIOUS@example.invalid','FICTITIOUS-password');assert.equal(store.size,1);
 Date.now=()=>now+3601*1000;const resume=api.resume();const rejection=assert.rejects(resume,error=>error.status===401);await pendingRefresh;
 await api.logout();assert.equal(store.size,0);release();await rejection;
 assert.equal(store.size,0);assert.equal(await api.resume(),null);
 assert.ok(!calls.some(c=>c.options.headers?.['X-Training-Authorization']==='Bearer revived.training.token'));
 console.log('Expired-session refresh race passed: logout cannot be reversed by an in-flight refresh response.');
}finally{Date.now=originalNow;await rm(directory,{recursive:true,force:true});}
