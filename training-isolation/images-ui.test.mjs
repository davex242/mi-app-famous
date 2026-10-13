import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {imageFixture} from './image-fixtures.mjs';

test('private image browser: real upload, pixel preview, download, revision and mobile access',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),password='Synthetic-only-image-browser-password',png=imageFixture();let server,browser,admin,recruiter,topic,id,newId;const pages=[],errors=[],remote=[];
 try{
  for(const role of ['superadmin','edit','readonly'])await provisionSyntheticUser(db,'demo-'+role,password,role);
  const token=(await service.login({username:'demo-superadmin',password})).token;topic=await service.saveTopic(token,{title:'DEMO material visual',description:'Apoyo de entrenamiento',category:'DEMO',estimated_minutes:10});await service.publishTopic(token,{id:topic.id});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  async function login(role,viewport={width:1440,height:1050}){const context=await browser.newContext({viewport,locale:'es-CR'}),p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-'+role);await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="library"]').click();await p.locator('[data-catalogue-mode="materials"]').click();return p;}
  await t.test('administrator uploads a real PNG and publishes its draft through the UI',async()=>{
   admin=await login('superadmin');await admin.locator('#material-form [name="title"]').fill('DEMO recurso visual');await admin.locator('#material-form [name="kind"]').selectOption('image');assert.equal(await admin.locator('#material-text-field').isVisible(),false);
   await admin.locator('#material-form [name="image_file"]').setInputFiles({name:'resource.png',mimeType:'image/png',buffer:png});await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Borrador de imagen creado.'}).waitFor();
   id=(await service.workspace(token)).materials[0].id;await admin.locator(`[data-publish-material="${id}"]`).click();await admin.locator('#notice').filter({hasText:'Material publicado.'}).waitFor();
  });
  await t.test('published preview decodes expected pixels locally and does not render original metadata',async()=>{
   recruiter=await login('edit');assert.equal(await recruiter.locator('#material-form').count(),0);await recruiter.locator(`[data-preview-material="${id}"]`).click();await recruiter.locator('#preview-image').waitFor({state:'visible'});
   await recruiter.waitForFunction(()=>document.querySelector('#preview-image').naturalWidth===320);const pixel=await recruiter.evaluate(()=>{const image=document.querySelector('#preview-image'),canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');c.drawImage(image,0,0);return [...c.getImageData(100,80,1,1).data];});assert.deepEqual(pixel,[34,139,120,255]);
   assert.ok(!await recruiter.locator('body').textContent().then(s=>s.includes('PRIVATE_METADATA_DEMO')));await recruiter.locator('[data-close-preview]').click();assert.equal(await recruiter.locator('#preview-image').getAttribute('src'),null);
  });
  await t.test('download contains the server-normalized PNG and generated filename',async()=>{
   const promise=recruiter.waitForEvent('download');await recruiter.locator(`[data-download-material="${id}"]`).click();const d=await promise,bytes=await readFile(await d.path());assert.equal(d.suggestedFilename(),`training-material-${id}-r1.png`);assert.ok(!bytes.includes(Buffer.from('PRIVATE_METADATA_DEMO')));
   assert.deepEqual(bytes,Buffer.from((await service.downloadMaterial(token,{id})).image_base64,'base64'));
  });
  await t.test('new revision can retain pixels while disabling preview and download independently',async()=>{
   await admin.locator(`[data-edit-material="${id}"]`).click();await admin.locator('#material-image-field').waitFor({state:'visible'});assert.equal(await admin.locator('#material-form [name="image_file"]').getAttribute('required'),null);
   await admin.locator('#material-form [name="allow_preview"]').uncheck();await admin.locator('#material-form [name="allow_download"]').uncheck();await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Borrador de imagen creado.'}).waitFor();newId=(await service.workspace(token)).materials.find(m=>m.revision===2).id;
   await admin.locator(`[data-publish-material="${newId}"]`).click();await admin.locator('#notice').filter({hasText:'Material publicado.'}).waitFor();await recruiter.locator('#refresh-button').click();await recruiter.locator('#notice').filter({hasText:'Información actualizada.'}).waitFor();assert.equal(await recruiter.locator(`[data-preview-material="${newId}"]`).isDisabled(),true);assert.equal(await recruiter.locator(`[data-download-material="${newId}"]`).isDisabled(),true);
   await recruiter.locator('#catalogue-history').check();assert.equal(await recruiter.locator(`[data-preview-material="${id}"]`).isDisabled(),false);
  });
  await t.test('invalid claimed PNG is rejected without creating a material or executing HTML',async()=>{
   await admin.locator('#material-form [name="title"]').fill('DEMO falso');await admin.locator('#material-form [name="kind"]').selectOption('image');await admin.locator('#material-form [name="image_file"]').setInputFiles({name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<svg onload="window.imageInjected=true"/>')});await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice.error').waitFor();assert.equal((await service.workspace(token)).materials.length,2);assert.equal(await admin.evaluate(()=>window.imageInjected),undefined);
  });
  await t.test('readonly preview fits mobile and image/session data never enters browser storage',async()=>{
   const p=await login('readonly',{width:390,height:844});assert.equal(await p.locator('#material-form').count(),0);await p.locator('#catalogue-history').check();await p.locator(`[data-preview-material="${id}"]`).click();await p.locator('#preview-image').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('#preview-image').naturalWidth===320);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await p.locator('#preview-image').evaluate(el=>el.getBoundingClientRect().width<=innerWidth));assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-images-mobile.png',fullPage:true});}
   assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  });
  await t.test('logout removes material data and image sources from the page',async()=>{
   await recruiter.locator(`[data-preview-material="${id}"]`).click();await recruiter.locator('#material-preview').waitFor({state:'visible'});
   await recruiter.locator('[data-close-preview]').click();await recruiter.locator('#logout-button').click();await recruiter.locator('#login-view').waitFor({state:'visible'});
   assert.equal(await recruiter.locator('#content').textContent(),'');assert.equal(await recruiter.locator('#preview-image').count(),0);
  });
 }finally{for(const p of pages)await p.context().close();if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
