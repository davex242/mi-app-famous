import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';

test('JPEG browser input: explicit conversion, size reduction, orientation and private PNG output',async t=>{
 const db=await createIsolatedDatabase(),service=createTrainingService(db),password='Synthetic-only-JPEG-browser-password';let server,browser,p,token,topic,first;const uploads=[],errors=[],remote=[];
 try{
  await provisionSyntheticUser(db,'demo-superadmin',password,'superadmin');token=(await service.login({username:'demo-superadmin',password})).token;
  topic=await service.saveTopic(token,{title:'DEMO fotografía',description:'Material visual',category:'DEMO',estimated_minutes:10});await service.publishTopic(token,{id:topic.id});
  server=createSandboxHttpServer(service);await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
  p.on('request',r=>{if(r.url().endsWith('/api/materials/image'))uploads.push(r.postDataJSON());});await p.route('**/*',r=>{if(new URL(r.request().url()).origin!==url){remote.push(r.request().url());return r.abort();}return r.continue();});
  await p.goto(url);await p.locator('#login-form [name="username"]').selectOption('demo-superadmin');await p.locator('#login-form [name="password"]').fill(password);await p.locator('#login-form button').click();await p.locator('#app-view').waitFor({state:'visible'});await p.locator('[data-tab="library"]').click();await p.locator('[data-catalogue-mode="materials"]').click();
  async function jpeg(width,height){const b64=await p.evaluate(({width,height})=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle='#228b78';x.fillRect(0,0,width,height);return c.toDataURL('image/jpeg',0.9).split(',')[1];},{width,height});return Buffer.from(b64,'base64');}
  async function upload(bytes,title='DEMO JPEG'){await p.locator('#material-form [name="title"]').fill(title);await p.locator('#material-form [name="kind"]').selectOption('image');await p.locator('#material-form [name="image_file"]').setInputFiles({name:'private-photo.jpg',mimeType:'image/jpeg',buffer:bytes});await p.locator('#material-form button[type="submit"]').click();}
  await t.test('JPEG conversion is disclosed before upload and larger image becomes proportional PNG',async()=>{
   await p.locator('#material-form [name="kind"]').selectOption('image');assert.match(await p.locator('#material-image-field').textContent(),/JPEG se convierte a PNG/);
   await upload(await jpeg(1536,768));await p.locator('#notice').filter({hasText:'JPEG convertido a PNG de 768 × 384 píxeles con reducción proporcional.'}).waitFor();first=(await service.workspace(token)).materials[0];const d=await service.materialEditData(token,{id:first.id});assert.equal(d.image.width,768);assert.equal(d.image.height,384);
   assert.equal(uploads.length,1);assert.equal(Buffer.from(uploads[0].image_base64,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.ok(!JSON.stringify(uploads[0]).includes('private-photo.jpg'));
  });
  await t.test('published image previews expected color and downloads real PNG',async()=>{
   await p.locator(`[data-publish-material="${first.id}"]`).click();await p.locator('#notice').filter({hasText:'Material publicado.'}).waitFor();await p.locator(`[data-preview-material="${first.id}"]`).click();await p.waitForFunction(()=>document.querySelector('#preview-image').naturalWidth===768);
   const pixel=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=768;c.height=384;const x=c.getContext('2d');x.drawImage(document.querySelector('#preview-image'),0,0);return [...x.getImageData(100,100,1,1).data];});for(let i=0;i<3;i++)assert.ok(Math.abs(pixel[i]-[34,139,120][i])<=3);assert.equal(pixel[3],255);await p.locator('[data-close-preview]').click();
   const promise=p.waitForEvent('download');await p.locator(`[data-download-material="${first.id}"]`).click();const download=await promise;assert.match(download.suggestedFilename(),/\.png$/);assert.equal((await readFile(await download.path())).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  });
  await t.test('EXIF orientation is applied and metadata never reaches the stored PNG',async()=>{
   const source=await jpeg(120,80),exif=Buffer.concat([Buffer.from('Exif\0\0'),Buffer.from('49492a0008000000010012010300010000000600000000000000','hex')]);const app1=Buffer.concat([Buffer.from([255,225,0,exif.length+2]),exif]);const bytes=Buffer.concat([source.subarray(0,2),app1,source.subarray(2)]);
   await upload(bytes,'DEMO JPEG orientado');await p.locator('#notice').filter({hasText:'JPEG convertido a PNG de 80 × 120 píxeles.'}).waitFor();const w=await service.workspace(token),second=w.materials.find(m=>m.id!==first.id),d=await service.materialEditData(token,{id:second.id});assert.equal(d.image.width,80);assert.equal(d.image.height,120);assert.ok(!Buffer.from(d.image.data,'base64').includes(Buffer.from('Exif')));
  });
  await t.test('fake JPEG, oversized dimensions and oversized input fail before an API upload',async()=>{
   const count=uploads.length;for(const bytes of [Buffer.from('<svg onload="alert(1)"/>'),await jpeg(2049,2),Buffer.alloc(2*1024*1024+1)]){await upload(bytes,'DEMO rechazado');await p.locator('#notice.error').waitFor();await p.waitForFunction(()=>!document.querySelector('#material-form button[type="submit"]').disabled);assert.equal(uploads.length,count);}assert.equal((await service.workspace(token)).materials.length,2);
  });
  await t.test('mobile conversion notice fits and no external requests, script errors or browser storage are used',async()=>{
   await p.setViewportSize({width:390,height:844});await upload(await jpeg(900,600),'DEMO JPEG móvil');await p.locator('#notice').filter({hasText:'JPEG convertido a PNG de 768 × 512 píxeles'}).waitFor();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(await p.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
   await p.locator('#material-form [name="kind"]').selectOption('image');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:process.env.UI_SCREENSHOT_DIR+'/training-jpeg-mobile.png',fullPage:true});}
  });
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});await db.close();}
});
