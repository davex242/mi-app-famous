import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {trainingContentProposal as publicProposal} from '../src/components/training/studyCatalogueData.mjs';
const source=await readFile(new URL('../src/components/training/studyCatalogueData.mjs',import.meta.url),'utf8');
test('editorial proposal covers the flexible 14-day course with the quiz policy explicitly confirmed by Dave',()=>{
 assert.equal(publicProposal.status,'draft');assert.equal(publicProposal.review_status,'accepted_for_initial_testing');assert.equal(publicProposal.duration_days,14);assert.equal(publicProposal.units.length,14);
 assert.deepEqual(publicProposal.units.map(u=>u.day),Array.from({length:14},(_,i)=>i+1));assert.equal(new Set(publicProposal.units.map(u=>u.key)).size,14);
 for(const unit of publicProposal.units){assert.equal(unit.requires_evidence,true);assert.equal(unit.requires_assessment,true);assert.ok(unit.objective&&unit.evidence);assert.ok(unit.estimated_minutes>0&&unit.estimated_minutes<=480);assert.equal(unit.guide.length,4);assert.equal(unit.practice.length,3);assert.equal(unit.review_criteria.length,3);}
 assert.equal(publicProposal.pass_percent,75);assert.equal(publicProposal.max_attempts,3);assert.equal(publicProposal.extra_attempts_require_preapproval,true);assert.equal(publicProposal.expires_at,null);assert.equal(publicProposal.invitation_hours,24);
 assert.ok(!source.includes('correct_option'));assert.ok(!source.includes('review_rationale'));
});
