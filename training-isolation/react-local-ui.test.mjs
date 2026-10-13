import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {buildLocalReact} from './react-local-build.mjs';
import {createIsolatedDatabase} from './database.mjs';
import {createTrainingService,provisionSyntheticUser} from './service.mjs';
import {createSandboxHttpServer} from './server.mjs';
import {seedDemoProgram} from './demo-fixtures.mjs';
const built=await buildLocalReact(),db=await createIsolatedDatabase(),service=createTrainingService(db);
const password='synthetic-test-password-only',users={};let server,browser,checks=0;
const errors=[],remote=[];const check=(value,message)=>{assert.ok(value,message);checks++;};
try {
  for(const role of ['superadmin','edit','readonly'])users[role]=await provisionSyntheticUser(db,`demo-${role}`,password,role);
  const fixture=await seedDemoProgram(db,users.superadmin.app_user_id,users.edit.app_user_id);
  const readonlyHost=randomUUID();await db.query('insert into public.hosts(id) values($1)',[readonlyHost]);await db.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)',[readonlyHost,users.readonly.app_user_id,users.superadmin.app_user_id]);
  const adminToken=(await service.login({username:'demo-superadmin',password})).token;
  const topic=(await db.query('select topic_id from public.training_program_items where id=$1',[fixture.item_ids[0]])).rows[0].topic_id;
  const material=await service.saveMaterial(adminToken,{topic_id:topic,title:'DEMO material desde API',kind:'document',content:'Solo contenido ficticio',allow_preview:true,allow_download:false});await service.publishMaterial(adminToken,{id:material.id});
  server=createSandboxHttpServer(service,{reactAssets:built.assets});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
  async function pageAt(query){const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{if(!route.request().url().startsWith(base+'/')){remote.push(route.request().url());return route.abort();}return route.continue();});await page.goto(base+'/react-training'+query);return page;}
  async function login(page,role,secret=password){await page.getByLabel('Usuario DEMO',{exact:true}).fill(`demo-${role}`);await page.getByLabel('Contraseña DEMO',{exact:true}).fill(secret);await page.getByRole('button',{name:'Entrar a prueba local',exact:true}).click();}
  const disabled=await pageAt('');let calls=0;disabled.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api')||r.url().endsWith('/health'))calls++;});
  await login(disabled,'edit');await disabled.getByRole('alert').waitFor();check(calls===0,'Missing local opt-in sends no API request');await disabled.close();
  const fake=await pageAt('?trainingSandbox=local');let leaked=0;await fake.route('**/health',r=>r.fulfill({contentType:'application/json',body:'{"sandbox":true}'}));fake.on('request',r=>{if(r.url().endsWith('/api/login'))leaked++;});await login(fake,'edit');await fake.getByRole('alert').waitFor();check(leaked===0,'Capability marker checked before credentials');await fake.close();
  for(const role of ['superadmin','edit','readonly']) {
    const page=await pageAt('?trainingSandbox=local');
    if(role==='superadmin'){await login(page,role,'invalid-password-only');await page.getByRole('alert').waitFor();check(await page.getByLabel('Contraseña DEMO',{exact:true}).inputValue()==='','Failed login clears password');check(await page.getByRole('navigation').count()===0,'Failed authentication hides workspace');}
    await login(page,role);await page.getByText('Permiso verificado por el servidor:').waitFor();
    check((await page.locator('.td-actions').textContent()).includes(role),'Server role rendered');check((await page.getByText('Emisores asignados:').textContent()).includes(role==='superadmin'?'2':'1'),'Server assignment scope');
    for(const name of ['Resumen','Programas','Agenda','Evidencias','Biblioteca','Actualizaciones','Quiz final','Cierre','Historial']) {
      const button=page.getByRole('navigation').getByRole('button',{name,exact:true});await button.click();check(await button.getAttribute('aria-current')==='page','Nine API sections navigate');
      if(name==='Biblioteca')check(await page.getByRole('cell',{name:'DEMO material desde API',exact:true}).count()===1,'Public material DTO rendered');
      await page.setViewportSize({width:390,height:844});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'API section fits mobile');await page.setViewportSize({width:1280,height:900});
    }
    await page.getByRole('navigation').getByRole('button',{name:'Programas',exact:true}).click();check(await page.getByRole('button',{name:'Guardar inscripción DEMO',exact:true}).count()===(role==='readonly'?0:1),'Readonly form absent');
    if(role==='edit') {
      await page.getByLabel('Emisor DEMO',{exact:true}).selectOption({index:1});await page.getByLabel('Programa publicado',{exact:true}).selectOption(fixture.program_version_id);
      await page.getByRole('button',{name:'Guardar inscripción DEMO',exact:true}).click();await page.getByRole('status').waitFor();check((await db.query('select count(*)::integer as n from public.training_enrollments')).rows[0].n===1,'React writes only isolated enrollment');
      if(process.env.UI_SCREENSHOT_DIR){await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:join(process.env.UI_SCREENSHOT_DIR,'training-react-local-enrollment.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(process.env.UI_SCREENSHOT_DIR,'training-react-local-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});}
      await page.getByRole('button',{name:'Guardar inscripción DEMO',exact:true}).click();await page.getByRole('alert').waitFor();check((await db.query('select count(*)::integer as n from public.training_enrollments')).rows[0].n===1,'Conflict prevents duplicate');check(await page.getByRole('navigation').count()===1,'409 preserves authorized workspace');
      await db.query("update training_private.training_principals set role='readonly' where app_user_id=$1",[users.edit.app_user_id]);await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.td-actions')?.textContent.includes('readonly'));check(await page.getByRole('button',{name:'Guardar inscripción DEMO',exact:true}).count()===0,'Refresh honors server role downgrade');
      await db.query('update training_private.training_principals set is_active=false where app_user_id=$1',[users.edit.app_user_id]);await page.getByRole('button',{name:'Actualizar datos',exact:true}).click();await page.getByRole('alert').waitFor();check(await page.getByRole('navigation').count()===0,'Revocation removes stale workspace');
    } else {await page.getByRole('button',{name:'Salir de prueba',exact:true}).click();await page.getByRole('button',{name:'Entrar a prueba local',exact:true}).waitFor();check(await page.getByRole('navigation').count()===0,'Logout clears workspace');}
    check(await page.evaluate(()=>localStorage.length+sessionStorage.length)===0,'No browser credential persistence');await page.close();
  }
  const token=(await service.login({username:'demo-readonly',password})).token;
  const deny=await fetch(base+'/api/enrollments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({host_id:fixture.host_id,program_version_id:fixture.program_version_id,timezone:'UTC'})});check(deny.status===403,'Server denies forged readonly write');
  const workspace=await service.workspace(token);check(!workspace.trainees.some(t=>t.host_id===fixture.host_id),'Unassigned host absent');check(!JSON.stringify(workspace).includes('password_digest')&&!JSON.stringify(workspace).includes('correct_option'),'No credential digests or answer keys');
  const badOrigin=await fetch(base+'/api/me',{headers:{Origin:'https://example.invalid',Authorization:`Bearer ${token}`}});check(badOrigin.status===403,'Origin guard retained');
  check(errors.length===0,'No browser errors');check(remote.length===0,'No external requests');console.log(`${checks} native React/local API checks passed.`);
} finally {if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await db.close();await built.cleanup();}
