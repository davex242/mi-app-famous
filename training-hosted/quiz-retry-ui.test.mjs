import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chromium} from '../training-isolation/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH,args:['--no-sandbox']});
try{
 for(const count of [10,25,50]){
  const page=await browser.newPage({viewport:count===25?{width:1440,height:900}:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const invitation='q'.repeat(43),attempt=randomUUID(),questions=Array.from({length:count},(_,i)=>({id:randomUUID(),position:i+1,prompt:'FICTITIOUS question '+i,options:['Correct','Wrong']}));let committed=false;const submissions=[];
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='https://quiz.preview.invalid')throw Error('Unexpected external request');
   const files={'/training-quiz/index.html':'index.html','/training-quiz/quiz.mjs':'quiz.mjs','/training-quiz/ui.css':'ui.css'};
   if(files[url.pathname])return route.fulfill({contentType:url.pathname.endsWith('.mjs')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('../public/training-quiz/'+files[url.pathname],import.meta.url),'utf8')});
   assert.equal(route.request().headers()['x-training-authorization'],'Bearer '+invitation);
   const send=body=>route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   const path=url.searchParams.get('route');
   if(path==='/api/quiz/status')return send({question_count:count,pass_percent:75,max_attempts:3,expires_at:'2030-01-01T00:00:00Z',can_start:!committed,attempts:committed?[{attempt_number:1,score_percent:100,passed:true}]:[]});
   if(path==='/api/quiz/start')return send({attempt_id:attempt,attempt_number:1,questions});
   if(path==='/api/quiz/submit'){
    submissions.push(route.request().postDataJSON());
    if(!committed){committed=true;return route.abort('internetdisconnected');}
    assert.deepEqual(submissions[1],submissions[0]);return send({attempt_id:attempt,score_percent:100,passed:true,already_submitted:true});
   }
   throw Error('Unexpected route');
  });
  await page.goto('https://quiz.preview.invalid/training-quiz/index.html#'+invitation);
  await page.getByText(`Responde las ${count} preguntas y envía`,{exact:false}).waitFor();assert.equal(new URL(page.url()).hash,'');
  await page.locator('#quiz-start').click();await page.locator('#quiz-answers').waitFor();
  for(const q of questions)await page.locator(`input[name="${q.id}"][value="0"]`).check();
  assert.equal(await page.locator('#quiz-counter').innerText(),`${count} de ${count} respondidas`);
  const submit=page.getByRole('button',{name:`Enviar las ${count} respuestas`,exact:true});await submit.click();await page.locator('#quiz-message.error').waitFor();
  assert.equal(await page.locator('input:checked').count(),count);await submit.click();await page.getByText('Resultado guardado:',{exact:false}).waitFor();
  assert.equal(submissions.length,2);assert.equal(submissions[1].answers.length,count);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Quiz browser retry passed for 10/25/50: real DOM, dynamic labels, preserved answers after response loss, identical retry, mobile/desktop.');
}finally{await browser.close();}
