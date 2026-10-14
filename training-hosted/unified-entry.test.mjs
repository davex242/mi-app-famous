import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {build}=createRequire(join(process.env.APP_NODE_MODULES,'_unified_qa.cjs'))('esbuild');
const directory=await mkdtemp(join(tmpdir(),'training-unified-'));
const prior={window:globalThis.window,storage:globalThis.localStorage,fetch:globalThis.fetch};
const store=new Map(),project='https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
const fixture={enabled:true,legacy:true,training:true,providerLogins:0,providerLogouts:0,legacyUpdates:0,profile:null,context:null};
globalThis.unifiedFixture=fixture;
try {
  const output=join(directory,'entry.mjs');
  await build({stdin:{contents:`export {AuthProvider} from ${JSON.stringify(new URL('../src/context/AuthContext.tsx',import.meta.url).pathname)};export {sharedTrainingApi,logoutSharedTraining} from ${JSON.stringify(new URL('../src/components/training/sharedTrainingSession.ts',import.meta.url).pathname)};`,resolveDir:directory},bundle:true,format:'esm',platform:'node',outfile:output,plugins:[{name:'controlled-providers',setup(builder){
    builder.onResolve({filter:/^(react|@\/lib\/supabase|@\/lib\/activityLogger|@\/components\/training\/hostedTrainingConfig)$/},args=>({path:args.path,namespace:'fixture'}));
    builder.onResolve({filter:/^@\/components\/training\/sharedTrainingSession$/},()=>({path:new URL('../src/components/training/sharedTrainingSession.ts',import.meta.url).pathname}));
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>{
      const common='const f=globalThis.unifiedFixture;';
      const code={
        'react':`export const createContext=()=>({Provider:({value})=>{f.context=value;return null;}});export const useContext=()=>f.context;export const useState=value=>[value,newValue=>{if(newValue&&typeof newValue==='object')f.profile=newValue;}];export const useEffect=effect=>effect();export default {createElement:(component,props,...children)=>component({...props,children})};`,
        '@/lib/supabase':`const chain={select(){return this;},eq(){return this;},update(){f.legacyUpdates++;return this;},async single(){return f.legacy?{data:{id:'legacy-synthetic',email:'owner@example.invalid',name:'Owner',role:'edit',password_hash:'synthetic-password',is_active:true},error:null}:{data:null,error:{}};}};export const supabase={from:()=>chain};`,
        '@/lib/activityLogger':`export default {login:async profile=>{if(profile.password_hash)throw Error('Credential leaked to audit');},logout:async()=>{}};`,
        '@/components/training/hostedTrainingConfig':`export const hostedTrainingConfig=()=>f.enabled?{enabled:true,url:'${project}',key:'synthetic-publishable-key'}:undefined;`
      };
      return {contents:common+code[args.path],loader:'js'};
    });
  }}]});
  globalThis.window={location:{protocol:'https:',origin:'https://preview.example.invalid'}};
  globalThis.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
  globalThis.fetch=async(url,options)=>{
    if(url.startsWith(project)) {
      assert.equal(options.credentials,'omit');
      if(url.includes('/logout')){fixture.providerLogouts++;return {ok:true};}
      fixture.providerLogins++;return {ok:fixture.training,json:async()=>({access_token:'synthetic.training.token'})};
    }
    assert.equal(options.credentials,'same-origin');
    if(url.endsWith('/health'))return {ok:true,json:async()=>({storage:'hosted-preview',initialized:true})};
    assert.equal(options.headers['X-Training-Authorization'],'Bearer synthetic.training.token');
    if(new URL(url,'https://preview.example.invalid').searchParams.get('route')==='/api/me')return {ok:true,json:async()=>({sandbox:true,role:'readonly'})};
    return {ok:true,json:async()=>({sandbox:true,...Object.fromEntries(['trainees','topics','materials','program_versions','program_items','program_materials','enrollments','sessions','attendance','approvals','assessments','completions','evidence','update_history','closing_records','exams','exam_assignments','exam_attempts','exam_attempt_budgets','events','progress'].map(key=>[key,[]]))})};
  };
  const {AuthProvider,sharedTrainingApi}=await import(pathToFileURL(output));
  store.set('hostmanager_user',JSON.stringify({role:'superadmin',password_hash:'synthetic-password'}));
  AuthProvider({children:null});assert.equal(store.size,0);
  fixture.legacy=false;assert.equal((await fixture.context.login('owner@example.invalid','synthetic-password')).success,false);assert.equal(fixture.providerLogins,0);
  fixture.legacy=true;fixture.training=false;assert.equal((await fixture.context.login('owner@example.invalid','synthetic-password')).success,false);assert.equal(fixture.profile,null);assert.equal(fixture.legacyUpdates,0);
  fixture.training=true;assert.equal((await fixture.context.login('owner@example.invalid','synthetic-password')).success,true);assert.equal(fixture.profile.password_hash,'');assert.equal(store.size,0);
  const config={enabled:true,url:project,key:'synthetic-publishable-key'},api=sharedTrainingApi(config,'owner@example.invalid'),before=fixture.providerLogins;
  assert.equal((await api.resume()).actor.role,'readonly');assert.equal(fixture.providerLogins,before);assert.equal(sharedTrainingApi(config,'OWNER@example.invalid'),api);
  await fixture.context.logout();assert.equal(await api.resume(),null);assert.equal(store.size,0);assert.ok(fixture.providerLogouts>0);
  fixture.enabled=false;AuthProvider({children:null});const logins=fixture.providerLogins;assert.equal((await fixture.context.login('owner@example.invalid','synthetic-password')).success,true);assert.equal(fixture.providerLogins,logins);assert.equal(JSON.parse(store.get('hostmanager_user')).password_hash,'');
  console.log('Unified preview entry checks passed: both validations, current training role, session reuse, no password persistence, joint logout and unchanged non-hosted login.');
} finally {
  globalThis.window=prior.window;globalThis.localStorage=prior.storage;globalThis.fetch=prior.fetch;delete globalThis.unifiedFixture;await rm(directory,{recursive:true,force:true});
}
