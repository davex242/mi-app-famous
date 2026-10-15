import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../training-isolation/node_modules/playwright/index.mjs';
const {build}=createRequire(join(process.env.APP_NODE_MODULES,'_reports.cjs'))('esbuild');
const dir=await mkdtemp(join(tmpdir(),'training-report-'));let browser;
try{
 const workspace=Object.fromEntries(['enrollments','trainees','program_versions','sessions','attendance','exam_attempts','exam_assignments','exams','completions','evidence'].map(k=>[k,[]]));
 workspace.program_versions=[{id:'p1',title:'FICTITIOUS A',version:1},{id:'p2',title:'FICTITIOUS B',version:1}];
 workspace.exams=[{id:'quiz',exam_key:'session-s1',question_count:10},{id:'final',exam_key:'FICTITIOUS final',question_count:25}];
 for(let i=0;i<50;i++){
  workspace.trainees.push({host_id:'h'+i,label:i===0?'  =FICTITIOUS()':'FICTITIOUS host '+i,mico_id:'FAKE-'+i});
  workspace.enrollments.push({id:'e'+i,host_id:'h'+i,program_version_id:i%2?'p2':'p1',recruiter_id:'t'+i%5,status:'active'});
  workspace.sessions.push({id:'s'+i,enrollment_id:'e'+i,status:'completed'});
  workspace.attendance.push({session_id:'s'+i,status:i%2?'absent':'present'});
 }
 workspace.exam_assignments=[{id:'a1',enrollment_id:'e0',exam_version_id:'quiz'},{id:'a2',enrollment_id:'e1',exam_version_id:'final'}];
 workspace.exam_attempts=[{id:'r1',assignment_id:'a1',passed:true,score_percent:100},{id:'r2',assignment_id:'a2',passed:true,score_percent:76}];
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Reports from ${JSON.stringify(new URL('../src/components/training/TrainingPhaseFiveReports.tsx',import.meta.url).pathname)};createRoot(document.getElementById('root')).render(<Reports role="superadmin" workspace={${JSON.stringify(workspace)}}/>);`,resolveDir:dir,loader:'tsx'},bundle:true,nodePaths:[process.env.APP_NODE_MODULES],outfile:join(dir,'reports.js')});
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.setContent('<div id="root"></div>');await page.addScriptTag({content:await readFile(join(dir,'reports.js'),'utf8')});
 await page.getByText('Inscritos:').waitFor();assert.equal(await page.locator('.td-stats article').nth(0).innerText(),'Inscritos: 50');assert.equal(await page.locator('.td-stats article').nth(2).innerText(),'Aprobados: 1');
 await page.locator('select').nth(0).selectOption('p1');assert.equal(await page.locator('.td-stats article').nth(0).innerText(),'Inscritos: 25');assert.equal(await page.locator('.td-stats article').nth(2).innerText(),'Aprobados: 0');
 await page.locator('select').nth(1).selectOption('t0');assert.equal(await page.locator('.td-stats article').nth(0).innerText(),'Inscritos: 5');
 await page.getByLabel('Buscar emisor').fill('FAKE-0');assert.equal(await page.locator('.td-stats article').nth(0).innerText(),'Inscritos: 1');
 await page.getByRole('button',{name:'=FICTITIOUS()',exact:true}).click();assert.match(await page.locator('body').innerText(),/Aprobado · 100%/);
 await page.evaluate(()=>{window.exported='';URL.createObjectURL=b=>{b.text().then(t=>window.exported=t);return 'blob:synthetic';};HTMLAnchorElement.prototype.click=()=>{};});
 await page.getByRole('button',{name:'Exportar CSV filtrado'}).click();await page.waitForFunction(()=>window.exported.length>0);const csv=await page.evaluate(()=>window.exported);assert.equal(csv.trim().split('\r\n').length,2);assert.ok(csv.includes('"\'  =FICTITIOUS()"'));assert.ok(csv.includes('"false"'));
 await page.getByLabel('Buscar emisor').fill('NO-MATCH');assert.equal(await page.getByRole('button',{name:'Exportar CSV filtrado'}).isDisabled(),true);
 console.log('Reports UI passed: 50 rows, combined filters, session quiz excluded from final pass, real score and escaped filtered CSV.');
}finally{if(browser)await browser.close();await rm(dir,{recursive:true,force:true});}
