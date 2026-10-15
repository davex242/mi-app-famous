import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {reportlabFixture} from './pdf-fixtures.mjs';
import {imageFixture} from './image-fixtures.mjs';

test('PDF evidence browser: explicit metadata disclosure, exact download, review and readonly mobile',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),password='Synthetic-PDF-evidence-browser-password',users={},pages=[],errors=[],remote=[],uploads=[],bytes=reportlabFixture();let server,browser,recruiter,administrator,readonly,token,first,second;
 try{
  for(const role of ['superadmin','edit','readonly'])users[role]=await provisionSyntheticUser(db,'demo-'+role,password,role);
  token=(await service.login({username:'demo-superadmin',password})).token;const editor=(await service.login({username:'demo-edit',password})).token,demo=await seedDemoProgram(db,users.superadmin.app_user_id,users.edit.app_user_id);
  const e=await service.enroll(editor,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'UTC'});await service.schedule(editor,{enrollment_id:e.id,item_id:demo.item_ids[0],scheduled_at:'2026-11-01T01:00:00Z',duration_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  async function login(role,viewport={width:1440,height:1050}){
   const p=await browser.newPage({viewport,locale:'es-CR',timezoneId:'America/Costa_Rica'});pages.push(p);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url()===url+'/api/evidence')uploads.push(r.postDataJSON());});await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});
   await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-'+role);await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="evidence"]').click();return p;
  }
  async function upload(p,buffer=bytes,description='DEMO PDF de práctica'){
   await p.locator('#evidence-form [name="evidence_kind"]').selectOption('pdf');await p.locator('#evidence-form [name="description"]').fill(description);await p.locator('#evidence-form [name="evidence_file"]').setInputFiles({name:'original-private-document.pdf',mimeType:'application/pdf',buffer});await p.locator('#evidence-form [name="consent_confirmed"]').check();await p.locator('#evidence-form button[type="submit"]').click();
  }
  await t.test('choosing PDF clears a previous image and consent; disclosure and consent precede upload',async()=>{
   recruiter=await login('edit');await recruiter.locator('#evidence-form [name="evidence_file"]').setInputFiles({name:'image.png',mimeType:'image/png',buffer:imageFixture()});await recruiter.locator('#evidence-form [name="consent_confirmed"]').check();await recruiter.locator('#evidence-form [name="evidence_kind"]').selectOption('pdf');
   assert.equal(await recruiter.locator('#evidence-form [name="evidence_file"]').evaluate(el=>el.files.length),0);assert.equal(await recruiter.locator('#evidence-form [name="consent_confirmed"]').isChecked(),false);assert.equal(await recruiter.locator('#evidence-image-help').isVisible(),false);assert.match(await recruiter.locator('#evidence-pdf-help').textContent(),/incluidos sus metadatos/);
   await recruiter.locator('#evidence-form [name="description"]').fill('DEMO PDF de práctica');await recruiter.locator('#evidence-form [name="evidence_file"]').setInputFiles({name:'original-private-document.pdf',mimeType:'application/pdf',buffer:bytes});assert.equal(await recruiter.locator('#evidence-form').evaluate(f=>f.checkValidity()),false);await recruiter.locator('#evidence-form button[type="submit"]').click();assert.equal(uploads.length,0);
   await recruiter.locator('#evidence-form [name="consent_confirmed"]').check();await recruiter.locator('#evidence-form button[type="submit"]').click();await recruiter.locator('#notice').filter({hasText:'Práctica y PDF enviados para revisión.'}).waitFor();first=(await service.workspace(token)).evidence[0];assert.equal(uploads[0].pdf_base64,bytes.toString('base64'));assert.equal(uploads[0].image_base64,undefined);assert.ok(!JSON.stringify(uploads[0]).includes('original-private-document'));
  });
  await t.test('PDF has no inline preview and downloaded bytes/checksum exactly match the original',async()=>{
   assert.equal(await recruiter.locator(`[data-preview-evidence="${first.id}"]`).isDisabled(),true);assert.equal(await recruiter.locator('iframe,object,embed').count(),0);
   const pending=recruiter.waitForEvent('download');await recruiter.locator(`[data-download-evidence="${first.id}"]`).click();const d=await pending;assert.equal(d.suggestedFilename(),`evidence-${first.id}.pdf`);const downloaded=await readFile(await d.path());assert.deepEqual(downloaded,bytes);assert.equal(createHash('sha256').update(downloaded).digest('hex'),(await service.downloadEvidenceFile(token,{evidence_id:first.id})).sha256);
  });
  await t.test('fake PDF is rejected by the server and oversized input fails before an upload',async()=>{
   await upload(recruiter,Buffer.from('<html>fake PDF</html>'));await recruiter.locator('#notice.error').waitFor();assert.equal((await service.workspace(token)).evidence.length,1);const count=uploads.length;
   await upload(recruiter,Buffer.alloc(2*1024*1024+1));await recruiter.locator('#notice.error').filter({hasText:'2 MiB'}).waitFor();await recruiter.waitForFunction(()=>!document.querySelector('#evidence-form button[type="submit"]').disabled);assert.equal(uploads.length,count);
  });
  await t.test('rejection and resubmission keep the old PDF; approval and assessment validate the new practice',async()=>{
   administrator=await login('superadmin');await administrator.locator(`[data-review="${first.id}"] [name="decision"]`).selectOption('rejected');await administrator.locator(`[data-review="${first.id}"] [name="notes"]`).fill('DEMO pide corrección');await administrator.locator(`[data-review="${first.id}"] button`).click();await administrator.locator('#notice').filter({hasText:'Revisión registrada.'}).waitFor();
   await recruiter.locator('#refresh-button').click();await recruiter.locator('#notice').filter({hasText:'Información actualizada.'}).waitFor();await upload(recruiter,bytes,'DEMO PDF corregido');await recruiter.locator('#notice').filter({hasText:'Práctica y PDF enviados para revisión.'}).waitFor();second=(await service.workspace(token)).evidence.find(p=>p.id!==first.id);assert.notEqual(second.id,first.id);assert.deepEqual(Buffer.from((await service.downloadEvidenceFile(token,{evidence_id:first.id})).pdf_base64,'base64'),bytes);
   await administrator.locator('#refresh-button').click();await administrator.locator(`[data-review="${second.id}"]`).waitFor();await administrator.locator(`[data-review="${second.id}"] [name="notes"]`).fill('DEMO PDF revisado');await administrator.locator(`[data-review="${second.id}"] button`).click();await administrator.locator('#notice').filter({hasText:'Revisión registrada.'}).waitFor();await administrator.locator('#assessment-form [name="notes"]').fill('DEMO evaluación');await administrator.locator('#assessment-form button[type="submit"]').click();await administrator.locator('#notice').filter({hasText:'Evaluación registrada.'}).waitFor();await administrator.locator('#complete-button').click();await administrator.locator('#notice').filter({hasText:'Práctica validada.'}).waitFor();
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await administrator.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-evidence-pdf-desktop.png',fullPage:true});}
  });
  await t.test('readonly mobile can download assigned PDFs and previous recruiter immediately loses access',async()=>{
   await db.query('update public.training_enrollments set recruiter_id=$1 where host_id=$2',[users.readonly.app_user_id,demo.host_id]);await recruiter.locator(`[data-download-evidence="${second.id}"]`).click();await recruiter.locator('#notice.error').waitFor();
   readonly=await login('readonly',{width:390,height:844});assert.equal(await readonly.locator('#evidence-form').count(),0);assert.equal(await readonly.locator('[data-review]').count(),0);assert.equal(await readonly.locator(`[data-preview-evidence="${second.id}"]`).isDisabled(),true);assert.ok(await readonly.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const pending=readonly.waitForEvent('download');await readonly.locator(`[data-download-evidence="${second.id}"]`).click();assert.deepEqual(await readFile(await(await pending).path()),bytes);
   if(process.env.UI_SCREENSHOT_DIR){await readonly.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-evidence-pdf-mobile.png',fullPage:true});}
  });
  await t.test('logout clears evidence data and no active PDF viewer, script errors, external traffic or storage appear',async()=>{
   await readonly.locator('#logout-button').click();await readonly.locator('#login-view').waitFor({state:'visible'});assert.equal(await readonly.locator('#content').textContent(),'');for(const p of pages){assert.equal(await p.locator('iframe,object,embed').count(),0);assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);}assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  });
 }finally{for(const p of pages)await p.close();if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
