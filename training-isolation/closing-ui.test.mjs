import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedClosingScenario} from './closing-fixtures.mjs';

test('closing UI: checklist, administrative confirmation and readonly mobile record',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),users={},tokens={};let browser,server,admin,recruiter,scenario;const pages=[],errors=[],remote=[];
 const password='Synthetic-only-closing-browser-password',notes='DEMO revisión <img src=x onerror="window.closingInjected=true"> '+ 'x'.repeat(600);
 try{
  for(const role of ['superadmin','edit','readonly']){users[role]=await provisionSyntheticUser(db,'demo-'+role,password,role);tokens[role]=(await service.login({username:'demo-'+role,password})).token;}
  scenario=await seedClosingScenario(db,service,{admin:tokens.superadmin,recruiter:tokens.edit});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  async function login(role,viewport={width:1440,height:1050}){
   const context=await browser.newContext({viewport,locale:'es-CR',timezoneId:'America/Costa_Rica'});const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});
   await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-'+role);await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="closing"]').click();return p;
  }
  await t.test('recruiter can review missing requirements but cannot confirm closing',async()=>{
   recruiter=await login('edit');await recruiter.locator('#closing-preview-form button').click();await recruiter.locator('#closing-checklist').waitFor();
   assert.match(await recruiter.locator('#closing-checklist').textContent(),/Requisitos pendientes/);assert.equal(await recruiter.locator('#closing-confirm-form').count(),0);
   assert.equal((await db.query('select status from public.training_enrollments')).rows[0].status,'active');
  });
  await t.test('administrator reviews complete requirements and must provide a conclusion',async()=>{
   await service.completeItem(tokens.superadmin,{session_id:scenario.sessions[1].id});admin=await login('superadmin');await admin.locator('#closing-preview-form button').click();await admin.locator('#closing-confirm-form').waitFor();
   assert.match(await admin.locator('#closing-checklist').textContent(),/Listo para revisión administrativa/);
   await admin.locator('#closing-confirm-form button').click();assert.equal((await db.query('select status from public.training_enrollments')).rows[0].status,'active');
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await admin.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-closing-review.png',fullPage:true});}
  });
  await t.test('confirmation closes through the server and records a safely rendered immutable result',async()=>{
   await admin.locator('#closing-confirm-form [name="notes"]').fill(notes);await admin.locator('#closing-confirm-form button').click();await admin.locator('#notice').filter({hasText:'Entrenamiento cerrado; historial conservado.'}).waitFor();
   assert.equal(await admin.locator('#closing-confirm-form').count(),0);assert.equal(await admin.locator('.closing-record').count(),1);assert.equal(await admin.locator('.closing-record img').count(),0);assert.equal(await admin.evaluate(()=>window.closingInjected),undefined);
   assert.equal((await db.query("select count(*)::int n from public.training_events where event_type='training_completed'")).rows[0].n,1);
  });
  await t.test('recruiter sees completed outcome after refresh and has no closing action',async()=>{
   await recruiter.locator('#refresh-button').click();await recruiter.locator('#notice').filter({hasText:'Información actualizada'}).waitFor();assert.equal(await recruiter.locator('.closing-record').count(),1);assert.equal(await recruiter.locator('#closing-confirm-form').count(),0);
   assert.match(await recruiter.locator('.closing-record').textContent(),/2 de 2 prácticas · Quiz 100%/);
  });
  await t.test('assigned readonly can inspect a mobile record without writes, overflow or external traffic',async()=>{
   await db.query('update training_private.training_host_assignments set recruiter_id=$1 where host_id=$2',[users.readonly.app_user_id,scenario.e.host_id]);
   const p=await login('readonly',{width:390,height:844});assert.equal(await p.locator('.closing-record').count(),1);assert.equal(await p.locator('#closing-confirm-form').count(),0);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal(await p.locator('.closing-record img').count(),0);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  });
 }finally{for(const p of pages)await p.context().close();if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
