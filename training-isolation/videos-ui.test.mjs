import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {videoFixture} from './video-fixtures.mjs';

test('private video browser: manual playback, exact download, revision, mobile and source cleanup',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),password='Synthetic-only-video-browser-password',bytes=videoFixture();let server,browser,admin,recruiter,token,id,second;const errors=[],remote=[];
 try{
  for(const role of ['superadmin','edit','readonly'])await provisionSyntheticUser(db,'demo-'+role,password,role);token=(await service.login({username:'demo-superadmin',password})).token;
  const topic=await service.saveTopic(token,{title:'DEMO video tutorial',description:'Small private clip',category:'DEMO',estimated_minutes:10});await service.publishTopic(token,{id:topic.id});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  async function login(role,viewport={width:1440,height:1050}){const p=await browser.newPage({viewport});p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-'+role);await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="library"]').click();await p.locator('[data-catalogue-mode="materials"]').click();return p;}
  async function preview(p){await p.locator(`[data-preview-material="${id}"]`).click();await p.locator('#preview-video').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('#preview-video').readyState>=2);}
  await t.test('administrator uploads and publishes a real MP4 through the UI',async()=>{
   admin=await login('superadmin');await admin.locator('#material-form [name="title"]').fill('DEMO clip privado');await admin.locator('#material-form [name="kind"]').selectOption('video');assert.match(await admin.locator('#material-video-field').textContent(),/60 segundos/);await admin.locator('#material-form [name="video_file"]').setInputFiles({name:'private-original.mp4',mimeType:'video/mp4',buffer:bytes});await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Borrador de video creado.'}).waitFor();id=(await service.workspace(token)).materials[0].id;
   await admin.locator(`[data-publish-material="${id}"]`).click();await admin.locator('#notice').filter({hasText:'Material publicado.'}).waitFor();
  });
  await t.test('recruiter previews locally without autoplay and decodes actual frames after manual play',async()=>{
   recruiter=await login('edit');assert.equal(await recruiter.locator('#material-form').count(),0);await preview(recruiter);assert.equal(await recruiter.locator('#preview-video').evaluate(v=>v.paused),true);assert.equal(await recruiter.locator('#preview-video').getAttribute('autoplay'),null);
   const meta=await recruiter.locator('#preview-video').evaluate(async v=>{v.muted=true;await v.play();return {width:v.videoWidth,height:v.videoHeight,duration:v.duration};});assert.equal(meta.width,320);assert.equal(meta.height,180);assert.ok(meta.duration>=2&&meta.duration<2.1);await recruiter.waitForFunction(()=>document.querySelector('#preview-video').currentTime>0.1);
   const pixelCount=await recruiter.locator('#preview-video').evaluate(v=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.drawImage(v,0,0);return new Set(x.getImageData(0,0,320,180).data).size;});assert.ok(pixelCount>20);
   await recruiter.locator('[data-close-preview]').click();assert.equal(await recruiter.locator('#preview-video').getAttribute('src'),null);assert.equal(await recruiter.locator('#preview-video').evaluate(v=>v.paused),true);
  });
  await t.test('MP4 download uses server filename and retains every original byte',async()=>{
   const promise=recruiter.waitForEvent('download');await recruiter.locator(`[data-download-material="${id}"]`).click();const download=await promise;assert.equal(download.suggestedFilename(),`training-material-${id}-r1.mp4`);assert.deepEqual(await readFile(await download.path()),bytes);
  });
  await t.test('new revision can retain the original and disable its own preview/download',async()=>{
   await admin.locator(`[data-edit-material="${id}"]`).click();await admin.locator('#material-video-field').waitFor({state:'visible'});assert.equal(await admin.locator('#material-form [name="video_file"]').getAttribute('required'),null);await admin.locator('#material-form [name="allow_preview"]').uncheck();await admin.locator('#material-form [name="allow_download"]').uncheck();await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Borrador de video creado.'}).waitFor();second=(await service.workspace(token)).materials.find(m=>m.revision===2).id;
   await admin.locator(`[data-publish-material="${second}"]`).click();await admin.locator('#notice').filter({hasText:'Material publicado.'}).waitFor();await recruiter.locator('#refresh-button').click();await recruiter.locator('#notice').filter({hasText:'Información actualizada.'}).waitFor();assert.equal(await recruiter.locator(`[data-preview-material="${second}"]`).isDisabled(),true);assert.equal(await recruiter.locator(`[data-download-material="${second}"]`).isDisabled(),true);await recruiter.locator('#catalogue-history').check();assert.equal(await recruiter.locator(`[data-preview-material="${id}"]`).isDisabled(),false);
  });
  await t.test('readonly plays historical clip on mobile without overflow or browser storage',async()=>{
   const p=await login('readonly',{width:390,height:844});await p.locator('#catalogue-history').check();await preview(p);await p.locator('#preview-video').evaluate(async v=>{v.muted=true;await v.play();});await p.waitForFunction(()=>document.querySelector('#preview-video').currentTime>0.2);await p.locator('#preview-video').evaluate(v=>v.pause());assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-video-mobile.png',fullPage:true});}await p.locator('[data-close-preview]').click();
  });
  await t.test('refresh and logout remove media source; invalid uploads never create records or scripts',async()=>{
   await preview(recruiter);const previous=await recruiter.locator('#preview-video').elementHandle();await previous.evaluate(async v=>{v.muted=true;await v.play();});await recruiter.locator('#refresh-button').evaluate(button=>button.click());await recruiter.waitForFunction(element=>!element.isConnected,previous);await recruiter.locator('#notice').filter({hasText:'Información actualizada.'}).waitFor();assert.deepEqual(await previous.evaluate(v=>({paused:v.paused,src:v.getAttribute('src')})),{paused:true,src:null});await previous.dispose();assert.equal(await recruiter.locator('#preview-video').getAttribute('src'),null);
   await preview(recruiter);const exiting=await recruiter.locator('#preview-video').elementHandle();await exiting.evaluate(async v=>{v.muted=true;await v.play();});await recruiter.locator('#logout-button').evaluate(button=>button.click());await recruiter.locator('#login-view').waitFor({state:'visible'});assert.deepEqual(await exiting.evaluate(v=>({paused:v.paused,src:v.getAttribute('src')})),{paused:true,src:null});await exiting.dispose();assert.equal(await recruiter.locator('#preview-video').count(),0);
   await admin.locator('#material-form [name="title"]').fill('DEMO falso');await admin.locator('#material-form [name="kind"]').selectOption('video');await admin.locator('#material-form [name="video_file"]').setInputFiles({name:'fake.mp4',mimeType:'video/mp4',buffer:Buffer.from('<svg onload="alert(1)"/>')});await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice.error').waitFor();assert.equal((await service.workspace(token)).materials.length,2);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  });
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
