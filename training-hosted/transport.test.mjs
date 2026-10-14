import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {build}=createRequire(join(process.env.APP_NODE_MODULES,'_transport_test.cjs'))('esbuild');
const directory=await mkdtemp(join(tmpdir(),'training-transport-'));
const prior={window:globalThis.window,fetch:globalThis.fetch};
try {
  const output=join(directory,'api.mjs');
  await build({entryPoints:[new URL('../src/components/training/HostedTrainingApi.ts',import.meta.url).pathname],bundle:true,format:'esm',platform:'node',outfile:output});
  const {HostedTrainingApi,hostedRequestError}=await import(pathToFileURL(output));
  assert.match(hostedRequestError(400,'Evidence file consent required').message,/Confirma/);
  assert.match(hostedRequestError(400,'Static PDF without passwords, forms, actions or attachments required').message,/PDF debe ser estático/);
  assert.ok(!hostedRequestError(400,'private unknown payload').message.includes('private unknown payload'));
  globalThis.window={location:{protocol:'https:',origin:'https://preview.example.invalid'}};
  const calls=[],project='https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(url.startsWith('/api/training')) {
      // Model protection refusing requests that omit its same-origin cookie.
      assert.equal(options.credentials,'same-origin');
      assert.equal(options.redirect,'error');
      if(url.endsWith('/health'))return {ok:true,json:async()=>({storage:'hosted-preview',initialized:true})};
      assert.equal(options.headers['X-Training-Authorization'],'Bearer synthetic.training.token');
      assert.equal(options.headers.Authorization,undefined);
      if(new URL(url,'https://preview.example.invalid').searchParams.get('route')==='/api/me')return {ok:true,json:async()=>({sandbox:true,role:'superadmin'})};
      return {ok:true,json:async()=>({sandbox:true,...Object.fromEntries(['trainees','topics','materials','program_versions','program_items','program_materials','enrollments','sessions','attendance','approvals','assessments','completions','evidence','update_history','closing_records','exams','exam_assignments','exam_attempts','exam_attempt_budgets','events','progress'].map(key=>[key,[]]))})};
    }
    assert.ok(url.startsWith(project+'/auth/v1/'));
    assert.equal(options.credentials,'omit');
    assert.equal(options.headers.apikey,'synthetic-publishable-key');
    return {ok:true,json:async()=>({access_token:'synthetic.training.token'})};
  };
  const api=new HostedTrainingApi({enabled:true,url:project,key:'synthetic-publishable-key'});
  assert.equal((await api.login('owner@example.invalid','synthetic-password')).actor.role,'superadmin');
  await api.register('owner@example.invalid','synthetic-password');
  await api.logout();
  assert.equal(calls.filter(call=>call.url.startsWith('/api/training')).length,3);
  assert.equal(calls.filter(call=>call.url.startsWith(project)).length,3);
  console.log('Protected-preview transport regression passed: same-origin protection cookie, separate bearer, cookie-free provider auth.');
} finally {
  globalThis.window=prior.window;globalThis.fetch=prior.fetch;
  await rm(directory,{recursive:true,force:true});
}
