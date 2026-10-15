import assert from 'node:assert/strict';
import {parsePrivateExamFile,PRIVATE_EXAM_MAX_BYTES} from '../src/components/training/privateExamImport.mjs';
import {trainingContentProposal} from '../src/components/training/studyCatalogueData.mjs';
import {examTemplate} from './exam-template.mjs';
// Synthetic fixtures only; the owner's actual bank never belongs in this repository.
export function syntheticPrivateExam(){return {key:'Synthetic private import',status:'draft',review_status:'accepted_for_initial_testing',pass_percent:75,max_attempts:3,expires_at:null,extra_attempts_require_preapproval:true,invitation_hours:24,questions:examTemplate().slice(0,25).map((row,index)=>({id:'synthetic-'+index,unit_key:trainingContentProposal.units[index%14].key,...row,review_rationale:'Synthetic review rationale '+index,review_status:'accepted_for_initial_testing'}))};}
let checks=0;const good=syntheticPrivateExam();
const parsed=parsePrivateExamFile(JSON.stringify(good));assert.equal(parsed.questions.length,25);assert.equal(parsed.unit_count,14);assert.equal(parsed.pass_percent,75);assert.deepEqual(Object.keys(parsed.questions[0]).sort(),['correct_option','options','prompt']);checks++;
for(const change of [
 x=>x.questions.pop(),x=>x.questions.push(x.questions[0]),x=>x.pass_percent=80,x=>x.max_attempts=4,x=>x.invitation_hours=48,x=>x.extra_attempts_require_preapproval=false,
 x=>x.expires_at='2030-01-01T00:00:00.000Z',x=>x.status='published',x=>x.review_status='pending',x=>x.extra='untrusted',x=>x.key='x'.repeat(81),
 x=>x.questions[0].id=x.questions[1].id,x=>x.questions[0].prompt=' '+x.questions[1].prompt.toUpperCase()+' ',x=>x.questions[0].options[0]=x.questions[0].options[1].toUpperCase(),
 x=>x.questions[0].correct_option=99,x=>x.questions[0].correct_option='1',x=>x.questions[0].correct_option=1.5,x=>x.questions[0].review_status='pending',
 x=>x.questions[0].unit_key='unknown',x=>x.questions.forEach(q=>q.unit_key='bienvenida'),x=>x.questions[0].review_rationale='',x=>x.questions[0].review_rationale='x'.repeat(2001),
 x=>x.questions[0].prompt='x'.repeat(1001),x=>x.questions[0].options[0]='x'.repeat(301),x=>x.questions[0].options=['one'],x=>x.questions[0].extra=true,
 x=>x.questions[0]=null,x=>x.questions[0].options[0]=null,
]){const bad=structuredClone(good);change(bad);assert.throws(()=>parsePrivateExamFile(JSON.stringify(bad)));checks++;}
for(const bad of ['{','null','[]','true',JSON.stringify({__proto__:null}),JSON.stringify({...good,padding:'x'.repeat(PRIVATE_EXAM_MAX_BYTES)}),'é'.repeat(PRIVATE_EXAM_MAX_BYTES)]){assert.throws(()=>parsePrivateExamFile(bad));checks++;}
assert.equal(good.questions[0].prompt,examTemplate()[0].prompt);checks++;
console.log(`${checks} private-file validation checks passed (synthetic fixtures).`);
