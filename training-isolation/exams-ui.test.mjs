import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService,provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';
import { seedDemoProgram } from './demo-fixtures.mjs';
import { examTemplate } from './exam-template.mjs';

test('quiz browser: administrator publication, recruiter invitation, mobile response and scoped results',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db);let server,browser;
 const password='Synthetic-quiz-browser-password',users={},pages=[],errors=[],remote=[];
 let admin,recruiter,visitor,invitation,assignment;
 try{
  for(const role of ['superadmin','edit','readonly'])users[role]=await provisionSyntheticUser(db,'demo-'+role,password,role);
  const demo=await seedDemoProgram(db,users.superadmin.app_user_id,users.edit.app_user_id);
  const token=(await service.login({username:'demo-edit',password})).token;
  await service.enroll(token,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'America/Costa_Rica'});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  async function page(viewport={width:1440,height:1050}){const c=await browser.newContext({viewport,locale:'es-CR',timezoneId:'America/Costa_Rica'});const p=await c.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});return p;}
  async function login(role,viewport){const p=await page(viewport);await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-'+role);await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="exams"]').click();return p;}
  await t.test('admin loads and reviews 50 DEMO questions; threshold has no invented default',async()=>{
   admin=await login('superadmin');await admin.locator('#exam-editor > summary').click();assert.equal(await admin.locator('#exam-publish-form [name="pass_percent"]').inputValue(),'');
   await admin.locator('[data-exam-template]').click();await admin.locator('#notice').filter({hasText:'Ejemplo DEMO cargado'}).waitFor();
   assert.equal(await admin.locator('.exam-question').count(),50);
   const last=admin.locator('.exam-question').last();await last.locator('summary').click();await last.locator('[name="prompt_49"]').fill(examTemplate()[49].prompt+' <img src=x onerror="window.quizInjected=true">');
   await admin.locator('[name="exam_key"]').fill('Quiz final DEMO');await admin.locator('[name="pass_percent"]').fill('80');
   await admin.locator('#exam-publish-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Examen publicado.'}).waitFor();
   assert.equal((await db.query('select status from public.training_exam_versions')).rows[0].status,'published');
  });
  await t.test('recruiter issues invitation with explicit retries and server-fixed expiry but cannot author exam',async()=>{
   recruiter=await login('edit');assert.equal(await recruiter.locator('#exam-publish-form').count(),0);assert.equal(await recruiter.locator('[name="max_attempts"]').inputValue(),'');
   await recruiter.locator('[name="max_attempts"]').fill('2');
   const expires=await recruiter.evaluate(()=>{const d=new Date(Date.now()+86400000);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;});
   assert.equal(await recruiter.locator('[name="expires_at"]').count(),0);await recruiter.locator('#exam-issue-form button').click();await recruiter.locator('#exam-invitation').waitFor();
   invitation=await recruiter.locator('#exam-invitation input').inputValue();assignment=(await db.query('select * from public.training_exam_assignments')).rows[0];
   assert.ok(invitation.startsWith(url+'/quiz#'));assert.equal(assignment.max_attempts,2);assert.equal(assignment.host_id,demo.host_id);
  });
  await t.test('mobile visitor opens without login; token fragment disappears and empty storage remains',async()=>{
   visitor=await page({width:390,height:844});await visitor.goto(invitation);await visitor.locator('#quiz-start').waitFor();
   assert.equal(visitor.url(),url+'/quiz');assert.equal(await visitor.locator('#login-form').count(),0);
   assert.deepEqual(await visitor.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
   await visitor.locator('#quiz-start').click();await visitor.locator('#quiz-answers').waitFor();assert.equal(await visitor.locator('.quiz-question').count(),50);
   assert.equal(await visitor.locator('.quiz-question img').count(),0);assert.equal(await visitor.evaluate(()=>window.quizInjected),undefined);
   assert.ok(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await visitor.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-quiz-mobile.png'});}
  });
  await t.test('all 50 questions are required before submission; answers count updates',async()=>{
   const radios=visitor.locator('.quiz-question').first().locator('input');await radios.first().check();await visitor.locator('#quiz-answers button').click();
   assert.equal((await db.query('select submitted_at from public.training_exam_attempts')).rows[0].submitted_at,null);
   assert.match(await visitor.locator('#quiz-counter').textContent(),/1 de 50/);
  });
  await t.test('server result displays correctly and passing stops new attempts',async()=>{
   const qs=examTemplate();for(let i=0;i<50;i++)await visitor.locator('.quiz-question').nth(i).locator('input').nth(qs[i].correct_option).check();
   assert.match(await visitor.locator('#quiz-counter').textContent(),/50 de 50/);
   await visitor.locator('#quiz-answers button').click();await visitor.locator('#quiz-message').filter({hasText:'Resultado guardado: 100% · Aprobado'}).waitFor();
   assert.equal(await visitor.locator('#quiz-start').count(),0);assert.equal((await db.query('select score_percent,passed from public.training_exam_attempts')).rows[0].passed,true);
  });
  await t.test('staff results are linked to the correct emisor and screenshot hides invitation secrets',async()=>{
   await admin.locator('#refresh-button').click();await admin.locator('#notice').filter({hasText:'Información actualizada'}).waitFor();
   assert.match(await admin.locator('#content').textContent(),/Emisor DEMO 1/);assert.match(await admin.locator('#content').textContent(),/Intento 1: 100% · Aprobado/);
   assert.equal(await admin.locator('#exam-invitation').count(),0);
   if(process.env.UI_SCREENSHOT_DIR)await admin.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-exams.png',fullPage:true});
  });
  await t.test('revoked invitation cannot load its result and history remains',async()=>{
   await admin.locator(`[data-revoke-exam="${assignment.id}"]`).click();await admin.locator('#notice').filter({hasText:'Enlace revocado'}).waitFor();
   await visitor.goto(invitation);await visitor.locator('#quiz-message.error').filter({hasText:'invitación no está disponible'}).waitFor();assert.equal(await visitor.locator('#quiz-start').count(),0);
   assert.equal((await db.query('select * from public.training_exam_attempts')).rows.length,1);
  });
  await t.test('assigned readonly can see score on mobile, without author/issue/revoke actions',async()=>{
   await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.readonly.app_user_id,demo.host_id]);
   const read=await login('readonly',{width:390,height:844});assert.equal(await read.locator('#exam-publish-form').count(),0);assert.equal(await read.locator('#exam-issue-form').count(),0);assert.equal(await read.locator('[data-revoke-exam]').count(),0);
   assert.match(await read.locator('#content').textContent(),/100% · Aprobado/);assert.ok(await read.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  });
  await t.test('no JavaScript errors, external requests or server keys reach public quiz assets',async()=>{
   assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);assert.ok(!(await (await fetch(url+'/quiz.mjs')).text()).includes('correct_option'));
  });
 }finally{for(const p of pages)await p.context().close();if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
