import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {buildLocalReact} from './react-local-build.mjs';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
import {imageFixture} from './image-fixtures.mjs';
import {examTemplate} from './exam-template.mjs';
import {createSandboxHttpServer} from './server.mjs';
const built=await buildLocalReact(),db=await createIsolatedDatabase(),service=createTrainingService(db),users={},password='Synthetic-layout-test-only';
let browser,server,checks=0;const errors=[],remote=[],check=(value,message)=>{assert.ok(value,message);checks++;};
const sections=['Resumen','Programas','Agenda','Evidencias','Biblioteca','Actualizaciones','Quiz final','Cierre','Historial'];
try{
 for(const role of ['superadmin','subadmin','edit','readonly'])users[role]=await provisionSyntheticUser(db,'demo-'+role,password,role);
 const token=(await service.login({username:'demo-superadmin',password})).token;
 const fixtures=[];
 for(const role of ['edit','readonly']){let fixture;if(role==='edit')fixture=await seedDemoProgram(db,users.superadmin.app_user_id,users.edit.app_user_id);else{fixture={...fixtures[0],host_id:randomUUID()};await db.query('insert into public.hosts(id) values($1)',[fixture.host_id]);await db.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)',[fixture.host_id,users.readonly.app_user_id,users.superadmin.app_user_id]);}const enrollment=await service.enroll(token,{host_id:fixture.host_id,program_version_id:fixture.program_version_id,timezone:'America/Costa_Rica'});const session=await service.schedule(token,{enrollment_id:enrollment.id,item_id:fixture.item_ids[0],scheduled_at:'2026-10-20T15:00:00Z',duration_minutes:30});await service.submitEvidence(token,{session_id:session.id,description:'DEMO descripción extensa '+ 'referencia'.repeat(45),image_base64:imageFixture().toString('base64'),consent_confirmed:true});fixtures.push(fixture);}
 const topic=(await db.query('select topic_id from public.training_program_items where id=$1',[fixtures[0].item_ids[0]])).rows[0].topic_id;
 const material=await service.saveImageMaterial(token,{topic_id:topic,title:'DEMO '+ 'referencia'.repeat(10),image_base64:imageFixture({width:640,height:320}).toString('base64'),allow_preview:true,allow_download:true});await service.publishMaterial(token,{id:material.id});await service.publishExam(token,{exam_key:'DEMO-REVISION-VISUAL',pass_percent:80,questions:examTemplate()});
 server=createSandboxHttpServer(service,{reactAssets:built.assets});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});if(process.env.UI_SCREENSHOT_DIR)await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});
 for(const role of ['superadmin','subadmin','edit','readonly']){
  const page=await browser.newPage({viewport:{width:1440,height:1000},locale:'es-CR',timezoneId:'America/Costa_Rica'});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){remote.push(r.request().url());return r.abort();}return r.continue();});await page.goto(base+'/react-training?trainingSandbox=local');await page.getByLabel('Usuario DEMO',{exact:true}).fill('demo-'+role);await page.getByLabel('Contraseña DEMO',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar a prueba local',exact:true}).click();await page.getByRole('navigation').waitFor();
  const admin=['superadmin','subadmin'].includes(role);
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:width>700?1000:844});
   for(const section of sections){
    await page.getByRole('navigation').getByRole('button',{name:section,exact:true}).click();check(await page.getByRole('navigation').locator('.td-active').count()===1,'One visibly active tab');if(section==='Resumen')check(!await page.locator('section.training-demo').innerText().then(value=>fixtures.some(f=>value.includes(f.host_id))),'Overview uses synthetic labels, not internal IDs');if(section==='Programas'){const region=page.getByRole('region',{name:'Programas: tabla de registros',exact:true});await region.focus();check(await region.evaluate(e=>document.activeElement===e),'Table scrolling region receives keyboard focus');check(!await page.getByText('Las demás acciones se conectarán en los siguientes pasos.',{exact:false}).count(),'No obsolete pending-action copy');}check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${role} ${section} ${width}: no page overflow`);
    check(await page.locator('input:not([type=checkbox]),select,textarea').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})),`${role} ${section} ${width}: visible form fields fit`);
    if(section==='Programas')check(await page.getByRole('region',{name:'Editor administrativo de programas',exact:true}).count()===(admin?1:0),'Program authoring admin-only');
    if(section==='Evidencias')check(await page.getByRole('button',{name:'Enviar evidencia a revisión DEMO',exact:true}).count()===(role==='readonly'?0:1),'Readonly has no upload');
    if(section==='Biblioteca')check(await page.getByRole('region',{name:'Editor administrativo de archivos',exact:true}).count()===(admin?1:0),'File authoring admin-only');
    if(section==='Quiz final')check(await page.getByRole('region',{name:'Editor administrativo de exámenes',exact:true}).count()===(admin?1:0),'Exam authoring admin-only');
    if(process.env.UI_SCREENSHOT_DIR&&((role==='superadmin'&&width===1440&&section==='Biblioteca')||(role==='edit'&&width===390&&section==='Evidencias')||(role==='readonly'&&width===390&&section==='Resumen')))await page.screenshot({path:join(process.env.UI_SCREENSHOT_DIR,`${role}-${section==='Biblioteca'?'library':section==='Evidencias'?'evidence':'overview'}-${width}.png`),fullPage:true});
   }
  }
  await page.getByRole('navigation').getByRole('button',{name:'Evidencias',exact:true}).click();await page.locator('.td-local-proof').first().getByRole('button',{name:'Vista previa de evidencia',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Evidencia DEMO',exact:true});await dialog.waitFor();await dialog.locator('img').evaluate(image=>image.decode());check(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth),'Evidence dialog fits 320px');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(true,'Escape closes evidence dialog');
  if(admin){
   await page.getByRole('navigation').getByRole('button',{name:'Programas',exact:true}).click();await page.getByLabel('Programa para crear nueva versión',{exact:true}).selectOption(fixtures[0].program_version_id);check(await page.locator('.td-local-program-item').count()===14,'All pinned practice editors loaded');check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Loaded program editor fits 320px');
   await page.getByRole('navigation').getByRole('button',{name:'Quiz final',exact:true}).click();await page.getByRole('button',{name:'Cargar banco DEMO de 50 preguntas',exact:true}).click();await page.getByRole('status').waitFor();await page.locator('.td-local-exam-question summary').first().click();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expanded exam editor fits 320px');check(await page.getByLabel('Umbral de aprobación (%)',{exact:true}).inputValue()==='','Visual review does not invent a passing threshold');
   if(process.env.UI_SCREENSHOT_DIR&&role==='superadmin'){await page.locator('.td-local-exam-question').first().scrollIntoViewIfNeeded();await page.screenshot({path:join(process.env.UI_SCREENSHOT_DIR,'superadmin-exam-320.png'),fullPage:false});}
  }
  check(await page.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).every(n=>n.getBoundingClientRect().height>=44)),'Visible buttons have at least 44px height');
  check(await page.evaluate(()=>localStorage.length+sessionStorage.length)===0,'No browser persistence');await page.close();
 }
 check(errors.length===0,'No browser script errors');check(remote.length===0,'No external requests');console.log(`${checks} native responsive/role checks passed.`);
}finally{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.close();await built.cleanup();}
