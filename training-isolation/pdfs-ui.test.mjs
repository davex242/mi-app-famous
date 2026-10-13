import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {reportlabFixture,pdfFixture} from './pdf-fixtures.mjs';

test('PDF browser: upload, publication, exact download, revision and readonly mobile',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),password='Synthetic-only-PDF-browser-password',bytes=reportlabFixture();let server,browser,admin,recruiter,token,id,second;const pages=[],errors=[],remote=[];
 try{
  for(const role of ['superadmin','edit','readonly'])await provisionSyntheticUser(db,'demo-'+role,password,role);token=(await service.login({username:'demo-superadmin',password})).token;
  const topic=await service.saveTopic(token,{title:'DEMO PDF guía',description:'Documento privado',category:'DEMO',estimated_minutes:10});await service.publishTopic(token,{id:topic.id});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  async function login(role,viewport={width:1440,height:1050}){const p=await browser.newPage({viewport});pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-'+role);await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="library"]').click();await p.locator('[data-catalogue-mode="materials"]').click();return p;}
  await t.test('administrator uploads PDF with clear download-only rules and disabled inline preview',async()=>{
   admin=await login('superadmin');await admin.locator('#material-form [name="title"]').fill('DEMO guía PDF');await admin.locator('#material-form [name="kind"]').selectOption('pdf');assert.match(await admin.locator('#material-pdf-field').textContent(),/sin visor integrado/);assert.equal(await admin.locator('#material-form [name="allow_preview"]').isDisabled(),true);
   await admin.locator('#material-form [name="pdf_file"]').setInputFiles({name:'original-private-guide.pdf',mimeType:'application/pdf',buffer:bytes});await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Borrador PDF creado.'}).waitFor();id=(await service.workspace(token)).materials[0].id;
   await admin.locator(`[data-publish-material="${id}"]`).click();await admin.locator('#notice').filter({hasText:'Material publicado.'}).waitFor();assert.equal(await admin.locator(`[data-preview-material="${id}"]`).isDisabled(),true);
  });
  await t.test('recruiter downloads the exact PDF using a generated filename and has no editor',async()=>{
   recruiter=await login('edit');assert.equal(await recruiter.locator('#material-form').count(),0);assert.match(await recruiter.locator('.catalogue-card').textContent(),/Documento PDF/);const promise=recruiter.waitForEvent('download');await recruiter.locator(`[data-download-material="${id}"]`).click();const d=await promise;assert.equal(d.suggestedFilename(),`training-material-${id}-r1.pdf`);assert.deepEqual(await readFile(await d.path()),bytes);assert.equal(await recruiter.locator('iframe,object,embed').count(),0);
  });
  await t.test('new revision retains the original PDF and can revoke only the new revision download',async()=>{
   await admin.locator(`[data-edit-material="${id}"]`).click();await admin.locator('#material-pdf-field').waitFor({state:'visible'});assert.equal(await admin.locator('#material-form [name="kind"]').inputValue(),'pdf');assert.equal(await admin.locator('#material-form [name="pdf_file"]').getAttribute('required'),null);await admin.locator('#material-form [name="allow_download"]').uncheck();await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Borrador PDF creado.'}).waitFor();second=(await service.workspace(token)).materials.find(m=>m.revision===2).id;
   await admin.locator(`[data-publish-material="${second}"]`).click();await admin.locator('#notice').filter({hasText:'Material publicado.'}).waitFor();await recruiter.locator('#refresh-button').click();await recruiter.locator('#notice').filter({hasText:'Información actualizada.'}).waitFor();assert.equal(await recruiter.locator(`[data-download-material="${second}"]`).isDisabled(),true);await recruiter.locator('#catalogue-history').check();assert.equal(await recruiter.locator(`[data-download-material="${id}"]`).isDisabled(),false);
  });
  await t.test('fake PDF and actual JavaScript PDF fail without adding material records',async()=>{
   for(const buffer of [Buffer.from('<html>fake PDF</html>'),await pdfFixture({interactive:'javascript'})]){await admin.locator('#material-form [name="title"]').fill('DEMO rechazado');await admin.locator('#material-form [name="kind"]').selectOption('pdf');await admin.locator('#material-form [name="pdf_file"]').setInputFiles({name:'fake.pdf',mimeType:'application/pdf',buffer});await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice.error').filter({hasText:'PDF estático'}).waitFor();await admin.waitForFunction(()=>!document.querySelector('#material-form button[type="submit"]').disabled);assert.equal((await service.workspace(token)).materials.length,2);}
  });
  await t.test('switching PDF to text restores editable controls without hidden required file inputs',async()=>{
   await admin.locator('#material-form [name="kind"]').selectOption('document');assert.equal(await admin.locator('#material-form [name="allow_preview"]').isDisabled(),false);assert.equal(await admin.locator('#material-pdf-field').isVisible(),false);
   await admin.locator('#material-form [name="title"]').fill('DEMO texto compatible');await admin.locator('#material-form [name="content"]').fill('DEMO plain text still works');await admin.locator('#material-form [name="allow_preview"]').check();await admin.locator('#material-form button[type="submit"]').click();await admin.locator('#notice').filter({hasText:'Borrador de material creado.'}).waitFor();assert.equal((await service.workspace(token)).materials.length,3);
  });
  await t.test('readonly downloads historical PDF on mobile without overflow, storage or external requests',async()=>{
   const p=await login('readonly',{width:390,height:844});await p.locator('#catalogue-history').check();assert.equal(await p.locator('#material-form').count(),0);const promise=p.waitForEvent('download');await p.locator(`[data-download-material="${id}"]`).click();assert.deepEqual(await readFile(await (await promise).path()),bytes);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-pdf-mobile.png',fullPage:true});}
  });
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
