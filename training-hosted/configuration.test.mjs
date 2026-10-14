import assert from 'node:assert/strict';
import {hostedServerConfig, previewProxyConfig} from './configuration.mjs';
const project='https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
const env={SUPABASE_URL:project,TRAINING_EXPECTED_SUPABASE_URL:project,TRAINING_OWNER_EMAIL:'owner@example.invalid',VERCEL_ENV:'preview',TRAINING_PREVIEW_ENABLED:'true',TRAINING_PREVIEW_BRANCH:'training-test',VERCEL_GIT_COMMIT_REF:'training-test',TRAINING_SUPABASE_URL:project};
const read=values=>name=>values[name];
assert.deepEqual(hostedServerConfig(read(env)),{project,ownerEmail:'owner@example.invalid'});
assert.equal(previewProxyConfig(read(env)).backend,project+'/functions/v1/training-preview');
for(const key of ['SUPABASE_URL','TRAINING_EXPECTED_SUPABASE_URL','TRAINING_OWNER_EMAIL']) {
  assert.throws(()=>hostedServerConfig(read({...env,[key]:undefined})));
}
assert.throws(()=>hostedServerConfig(read({...env,SUPABASE_URL:'https://bbbbbbbbbbbbbbbbbbbb.supabase.co'})));
for(const change of [{VERCEL_ENV:'production'},{TRAINING_PREVIEW_BRANCH:undefined},{VERCEL_GIT_COMMIT_REF:'other'},{TRAINING_PREVIEW_BRANCH:'main',VERCEL_GIT_COMMIT_REF:'main'},{TRAINING_SUPABASE_URL:undefined},{TRAINING_SUPABASE_URL:'https://supabase.co.evil.invalid'},{TRAINING_SUPABASE_URL:project+'/unexpected'},{TRAINING_PREVIEW_ENABLED:'false'}]) {
  assert.equal(previewProxyConfig(read({...env,...change})),null);
}
console.log('14 configuration checks passed: explicit owner/project, fail-closed preview and fixed backend origin.');
