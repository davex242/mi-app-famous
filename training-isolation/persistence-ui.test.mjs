import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { rm,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { LOCAL_DATA_ROOT } from './local-storage.mjs';
import { startPersistentSandbox } from './local-runtime.mjs';

test('persistent browser: truthful mode, restart and existing progress',async t=>{
 const store='qa-ui-'+randomUUID(),password='Only-synthetic-persistence-UI-password';let runtime,browser,page,port;
 const errors=[],remote=[];
 try{
  runtime=await startPersistentSandbox(store,password,0);port=runtime.server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-CR',timezoneId:'America/Costa_Rica'});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${port}`;
  await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});
  async function login(){await page.goto(url);await page.locator('#login-form [name="password"]').fill(password);await page.locator('#login-form button').click();await page.locator('#app-view').waitFor({state:'visible'});}
  let enrolledId;
  await t.test('local mode tells the user data survives restart and uses their setup password',async()=>{
   await page.goto(url);assert.match(await page.locator('.sandbox-bar').textContent(),/se conservan al reiniciar/);
   assert.match(await page.locator('.login-card').textContent(),/contraseña definida/);assert.ok(!(await page.locator('.login-card').textContent()).includes('mostrada en la consola'));
   await login();await page.locator('#enroll-form button').click();await page.locator('#notice').filter({hasText:'Datos guardados en esta prueba local.'}).waitFor();
   enrolledId=(await runtime.db.query('select id from public.training_enrollments')).rows[0].id;
  });
  await t.test('same browser can reload after server restart and retrieve the same enrollment',async()=>{
   await runtime.close();runtime=null;runtime=await startPersistentSandbox(store,undefined,port);
   await login();assert.equal((await runtime.db.query('select id from public.training_enrollments')).rows[0].id,enrolledId);
   assert.equal((await runtime.db.query('select count(*)::int n from public.hosts')).rows[0].n,1);
   assert.match(await page.locator('#content').textContent(),/0 de 14 prácticas/);assert.match(await page.locator('footer').textContent(),/Datos guardados localmente/);
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-persistent.png',fullPage:true});}
  });
  await t.test('persistent UI retains server authorization and keeps credentials out of browser storage',async()=>{
   await page.locator('[data-tab="exams"]').click();assert.equal(await page.locator('#exam-publish-form').count(),0);
   assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
   assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  });
 }finally{if(browser)await browser.close();if(runtime)await runtime.close();await rm(join(LOCAL_DATA_ROOT,store),{recursive:true,force:true});await rm(join(LOCAL_DATA_ROOT,'_locks',store),{recursive:true,force:true});}
});
