import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const token='s'.repeat(43),calls=[],content={innerHTML:'',addEventListener(){}},message={textContent:'',className:''};
let removed=false;
runInNewContext(await readFile(new URL('../public/training-quiz/quiz.mjs',import.meta.url),'utf8'),{
  location:{hash:'#'+token,pathname:'/training-quiz/index.html'},
  history:{replaceState:(_state,_title,path)=>{assert.equal(path,'/training-quiz/index.html');removed=true;}},
  window:{addEventListener(){}},document:{querySelector:selector=>selector==='#quiz-content'?content:message},
  fetch:async(url,options)=>{assert.ok(removed);calls.push({url,options});return {ok:true,json:async()=>({question_count:25,pass_percent:75,max_attempts:3,expires_at:'2030-01-01T00:00:00Z',can_start:true,attempts:[]})};},
  Date,Error,JSON,FormData,URL,encodeURIComponent,setTimeout,clearTimeout
});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(calls.length,1);
assert.equal(new URL(calls[0].url,'https://preview.example.invalid').searchParams.get('route'),'/api/quiz/status');
assert.equal(calls[0].options.headers['x-training-authorization'],'Bearer '+token);
assert.equal(calls[0].options.headers.authorization,undefined);
assert.ok(content.innerHTML.includes('Antes de empezar'));
assert.ok(content.innerHTML.includes('75%'));
assert.ok(content.innerHTML.includes('Responde las 25 preguntas'));
assert.ok(content.innerHTML.includes('3'));
console.log('Quiz startup transport passed: fixed gateway, dedicated invitation header and fragment removal before requests.');
