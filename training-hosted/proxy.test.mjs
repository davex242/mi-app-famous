import assert from 'node:assert/strict';
import handler from '../api/training/gateway.js';
const saved={...process.env};
const original={env:process.env.VERCEL_ENV,branch:process.env.VERCEL_GIT_COMMIT_REF,enabled:process.env.TRAINING_PREVIEW_ENABLED,fetch:globalThis.fetch};let requests=0,checks=0;
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(value=''){this.body=value;}};}
try{
 process.env.TRAINING_PREVIEW_BRANCH='test-training-branch';process.env.TRAINING_SUPABASE_URL='https://aaaaaaaaaaaaaaaaaaaa.supabase.co';process.env.VERCEL_ENV='production';process.env.VERCEL_GIT_COMMIT_REF='main';process.env.TRAINING_PREVIEW_ENABLED='true';let r=res();await handler({url:'/api/training/health',method:'GET',headers:{}},r);assert.equal(r.statusCode,404);checks++;
 process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='test-training-branch';globalThis.fetch=async url=>{assert.equal(url,'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/functions/v1/training-preview/health');requests++;return {status:200,text:async()=>'{"initialized":true}'};};
 r=res();await handler({url:'/api/training/health',method:'GET',headers:{host:'preview.example.invalid'}},r);assert.equal(r.statusCode,200);assert.equal(requests,1);checks++;
 r=res();await handler({url:'/api/training/gateway?route=%2Fapi%2Fworkspace',method:'GET',headers:{}},r);assert.equal(r.statusCode,401);assert.equal(requests,1);checks++;
 r=res();await handler({url:'/api/training/health',method:'GET',headers:{origin:'https://foreign.invalid',host:'preview.example.invalid'}},r);assert.equal(r.statusCode,403);checks++;
 r=res();await handler({url:'/api/training/../secret',method:'GET',headers:{}},r);assert.equal(r.statusCode,404);checks++;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/functions/v1/training-preview/api/me');assert.equal(options.headers.Authorization,'Bearer synthetic-training-token');assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers['X-Training-Authorization'],undefined);requests++;return {status:200,text:async()=>'{"sandbox":true,"role":"superadmin"}'};};
 r=res();await handler({url:'/api/training/gateway?route=%2Fapi%2Fme',method:'GET',headers:{host:'preview.example.invalid','x-training-authorization':'Bearer synthetic-training-token',authorization:'Bearer platform-token',cookie:'synthetic-protection-cookie'}},r);assert.equal(r.statusCode,200);checks++;
 r=res();await handler({url:'/api/training/gateway?route=%2Fapi%2Fme',method:'GET',headers:{authorization:'Bearer platform-token'}},r);assert.equal(r.statusCode,401);checks++;
 r=res();await handler({url:'/api/training/gateway?route=https%3A%2F%2Fforeign.invalid%2Fapi%2Fme',method:'GET',headers:{}},r);assert.equal(r.statusCode,404);checks++;
 r=res();await handler({url:'/api/training/gateway?route=%2Fapi%2F..%2Fsecret',method:'GET',headers:{}},r);assert.equal(r.statusCode,404);checks++;
 console.log(`${checks} preview proxy guards passed.`);
}finally{for(const key of ['TRAINING_PREVIEW_BRANCH','TRAINING_SUPABASE_URL']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}for(const [key,value] of [['VERCEL_ENV',original.env],['VERCEL_GIT_COMMIT_REF',original.branch],['TRAINING_PREVIEW_ENABLED',original.enabled]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}globalThis.fetch=original.fetch;}
