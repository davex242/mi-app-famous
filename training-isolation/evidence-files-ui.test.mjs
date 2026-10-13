import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {imageFixture} from './image-fixtures.mjs';

test('evidence browser: consent, PNG/JPEG upload, scoped preview/download, review and mobile',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),password='Synthetic-only-evidence-browser-password',users={},pages=[],errors=[],remote=[],uploads=[];let server,browser,recruiter,administrator,readonly,token,first,second;
 try{
  for(const role of ['superadmin','edit','readonly'])users[role]=await provisionSyntheticUser(db,'demo-'+role,password,role);
  token=(await service.login({username:'demo-superadmin',password})).token;
  const editToken=(await service.login({username:'demo-edit',password})).token,demo=await seedDemoProgram(db,users.superadmin.app_user_id,users.edit.app_user_id);
  const e=await service.enroll(editToken,{host_id:demo.host_id,program_version_id:demo.program_version_id,timezone:'UTC'}),session=await service.schedule(editToken,{enrollment_id:e.id,item_id:demo.item_ids[0],scheduled_at:'2026-11-01T01:00:00Z',duration_minutes:10});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  async function login(role,viewport={width:1440,height:1050}){
   const p=await browser.newPage({viewport,locale:'es-CR'});pages.push(p);p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url()===url+'/api/evidence')uploads.push(r.postDataJSON());});
   await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});
   await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-'+role);await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="evidence"]').click();return p;
  }
  await t.test('recruiter must confirm consent before a file can be sent',async()=>{
   recruiter=await login('edit');assert.equal(await recruiter.locator('#evidence-consent-field').isVisible(),false);
   await recruiter.locator('#evidence-form [name="description"]').fill('DEMO práctica <img src=x onerror="window.compromised=true">');
   await recruiter.locator('#evidence-form [name="evidence_file"]').setInputFiles({name:'original-private-name.png',mimeType:'image/png',buffer:imageFixture()});assert.equal(await recruiter.locator('#evidence-consent-field').isVisible(),true);
   assert.equal(await recruiter.locator('#evidence-form').evaluate(f=>f.checkValidity()),false);await recruiter.locator('#evidence-form button[type="submit"]').click();assert.equal(uploads.length,0);
   await recruiter.locator('#evidence-form [name="consent_confirmed"]').check();await recruiter.locator('#evidence-form button[type="submit"]').click();await recruiter.locator('#notice').filter({hasText:'Práctica e imagen enviadas para revisión.'}).waitFor();
   first=(await service.workspace(token)).evidence[0];assert.equal(uploads[0].consent_confirmed,true);assert.ok(!JSON.stringify(uploads[0]).includes('original-private-name'));assert.equal(await recruiter.locator('[data-review]').count(),0);assert.equal(await recruiter.evaluate(()=>window.compromised),undefined);
  });
  await t.test('preview decodes actual pixels without metadata and closing the dialog removes its source',async()=>{
   await recruiter.locator(`[data-preview-evidence="${first.id}"]`).click();await recruiter.waitForFunction(()=>document.querySelector('#evidence-preview-image').naturalWidth===320);
   const pixel=await recruiter.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.drawImage(document.querySelector('#evidence-preview-image'),0,0);return [...x.getImageData(100,80,1,1).data];});assert.deepEqual(pixel,[34,139,120,255]);
   assert.ok(!await recruiter.locator('#evidence-preview-image').getAttribute('src').then(s=>Buffer.from(s.split(',')[1],'base64').includes(Buffer.from('PRIVATE_METADATA_DEMO'))));
   await recruiter.locator('[data-close-evidence]').click();assert.equal(await recruiter.locator('#evidence-preview-image').getAttribute('src'),null);
  });
  await t.test('download is the verified PNG and administrative rejection preserves the first proof',async()=>{
   const pending=recruiter.waitForEvent('download');await recruiter.locator(`[data-download-evidence="${first.id}"]`).click();const d=await pending;assert.equal(d.suggestedFilename(),`evidence-${first.id}.png`);
   assert.deepEqual(await readFile(await d.path()),Buffer.from((await service.downloadEvidenceFile(token,{evidence_id:first.id})).image_base64,'base64'));
   administrator=await login('superadmin');await administrator.locator(`[data-review="${first.id}"] [name="decision"]`).selectOption('rejected');await administrator.locator(`[data-review="${first.id}"] [name="notes"]`).fill('DEMO pide otra evidencia');await administrator.locator(`[data-review="${first.id}"] button`).click();await administrator.locator('#notice').filter({hasText:'Revisión registrada.'}).waitFor();
   await recruiter.locator('#refresh-button').click();await recruiter.locator('#notice').filter({hasText:'Información actualizada.'}).waitFor();assert.equal(await recruiter.locator(`[data-preview-evidence="${first.id}"]`).count(),1);
  });
  await t.test('new JPEG evidence discloses proportional conversion and leaves rejected original unchanged',async()=>{
   const jpeg=await recruiter.evaluate(()=>{const c=document.createElement('canvas');c.width=1536;c.height=768;const x=c.getContext('2d');x.fillStyle='#228b78';x.fillRect(0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.9).split(',')[1];});
   await recruiter.locator('#evidence-form [name="description"]').fill('DEMO práctica corregida');await recruiter.locator('#evidence-form [name="evidence_file"]').setInputFiles({name:'original-name.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')});await recruiter.locator('#evidence-form [name="consent_confirmed"]').check();await recruiter.locator('#evidence-form button[type="submit"]').click();await recruiter.locator('#notice').filter({hasText:'JPEG convertido a PNG de 768 × 384 píxeles con reducción proporcional.'}).waitFor();
   const w=await service.workspace(token);second=w.evidence.find(p=>p.id!==first.id);assert.equal(w.evidence.find(p=>p.id===first.id).status,'rejected');assert.equal((await service.previewEvidenceFile(token,{evidence_id:second.id})).image.width,768);assert.equal(uploads.length,2);assert.equal(Buffer.from(uploads[1].image_base64,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(!JSON.stringify(uploads[1]).includes('original-name'));
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await recruiter.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-evidence-desktop.png',fullPage:true});}
  });
  await t.test('administrator approves the file then evaluates and validates the practical item',async()=>{
   await administrator.locator('#refresh-button').click();await administrator.locator(`[data-review="${second.id}"]`).waitFor();await administrator.locator(`[data-review="${second.id}"] [name="notes"]`).fill('DEMO imagen y práctica revisadas');await administrator.locator(`[data-review="${second.id}"] button`).click();await administrator.locator('#notice').filter({hasText:'Revisión registrada.'}).waitFor();
   await administrator.locator('#assessment-form [name="notes"]').fill('DEMO evaluación');await administrator.locator('#assessment-form button[type="submit"]').click();await administrator.locator('#notice').filter({hasText:'Evaluación registrada.'}).waitFor();await administrator.locator('#complete-button').click();await administrator.locator('#notice').filter({hasText:'Práctica validada.'}).waitFor();assert.equal((await service.workspace(token)).progress[0].completed_items,1);
  });
  await t.test('reassignment denies a former owner; mobile readonly sees files without upload or review controls',async()=>{
   await db.query('update training_private.training_host_assignments set recruiter_id=$1 where host_id=$2',[users.readonly.app_user_id,demo.host_id]);
   await recruiter.locator(`[data-preview-evidence="${second.id}"]`).click();await recruiter.locator('#notice.error').waitFor();assert.equal(await recruiter.locator('#evidence-preview').isVisible(),false);
   readonly=await login('readonly',{width:390,height:844});assert.equal(await readonly.locator('#evidence-form').count(),0);assert.equal(await readonly.locator('[data-review]').count(),0);
   await readonly.locator(`[data-preview-evidence="${second.id}"]`).click();await readonly.waitForFunction(()=>document.querySelector('#evidence-preview-image').naturalWidth===768);assert.ok(await readonly.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await readonly.locator('#evidence-preview-image').evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await readonly.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-evidence-mobile.png',fullPage:true});}
   await readonly.locator('[data-close-evidence]').click();const pending=readonly.waitForEvent('download');await readonly.locator(`[data-download-evidence="${second.id}"]`).click();assert.equal((await pending).suggestedFilename(),`evidence-${second.id}.png`);
  });
  await t.test('refresh and logout clear private preview pixels; no storage, remote requests or script errors',async()=>{
   await readonly.locator(`[data-preview-evidence="${second.id}"]`).click();await readonly.locator('#evidence-preview').waitFor({state:'visible'});
   await readonly.evaluate(()=>document.querySelector('#refresh-button').click());await readonly.locator('#notice').filter({hasText:'Información actualizada.'}).waitFor();assert.equal(await readonly.locator('#evidence-preview-image').getAttribute('src'),null);
   await readonly.locator(`[data-preview-evidence="${second.id}"]`).click();await readonly.locator('#evidence-preview').waitFor({state:'visible'});await readonly.evaluate(()=>document.querySelector('#logout-button').click());await readonly.locator('#login-view').waitFor({state:'visible'});assert.equal(await readonly.locator('#content').textContent(),'');assert.equal(await readonly.locator('#evidence-preview-image').count(),0);
   for(const p of pages)assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);
  });
 }finally{for(const p of pages)await p.close();if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
