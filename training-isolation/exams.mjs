import { randomBytes, createHash } from 'node:crypto';
import { examTemplate } from './exam-template.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');

// An invitation authorizes this assignment only; it does not verify a person's identity.
export function createExamOperations(db, run, { fields, text, uuid, fail, requireAdmin, requireWrite, enrollment, audit }) {
  async function questions(tx, version) {
    return (await tx.query('select id,position,prompt,options from public.training_exam_questions where exam_version_id=$1 order by position',[version])).rows;
  }
  async function publicRun(token, operation) {
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)) fail(404,'Invitation unavailable');
    return db.transaction(async tx=>{
      const a=(await tx.query(`select a.*,v.pass_percent from public.training_exam_assignments a
        join training_private.training_exam_tokens t on t.assignment_id=a.id
        join public.training_exam_versions v on v.id=a.exam_version_id
        where t.token_hash=$1 and t.revoked_at is null and a.expires_at>now()
        and a.status in ('issued','completed') and v.status='published' for update of a`,[hash(token)])).rows[0];
      if(!a)fail(404,'Invitation unavailable');
      const e=(await tx.query('select status,host_id from public.training_enrollments where id=$1 for share',[a.enrollment_id])).rows[0];
      if(!e || e.status!=='active' || e.host_id!==a.host_id)fail(404,'Invitation unavailable');
      return operation(tx,a);
    });
  }
  const result=a=>({attempt_id:a.id,attempt_number:a.attempt_number,submitted_at:a.submitted_at,score_percent:Number(a.score_percent),passed:a.passed});
  return {
    examTemplate:(token,body)=>run(token,async(_,actor)=>{requireAdmin(actor);fields(body,[]);return {demo:true,questions:examTemplate()};}),
    examEditData:(token,body)=>run(token,async(tx,actor)=>{
      requireAdmin(actor);fields(body,['id']);
      const exam=(await tx.query("select id,exam_key,version,pass_percent from public.training_exam_versions where id=$1 and status='published'",[uuid(body.id)])).rows[0];
      if(!exam)fail(404,'Record unavailable');
      const rows=(await tx.query('select q.prompt,q.options,k.correct_option from public.training_exam_questions q join training_private.training_exam_keys k on k.question_id=q.id where q.exam_version_id=$1 order by q.position',[exam.id])).rows;
      if(rows.length!==50)fail(409,'Exam content is inconsistent');
      return {...exam,pass_percent:Number(exam.pass_percent),questions:rows};
    }),
    publishExam:(token,body)=>run(token,async(tx,actor)=>{
      requireAdmin(actor);fields(body,['exam_key','pass_percent','questions','source_id']);
      const key=text(body.exam_key,80);
      if(!Number.isFinite(body.pass_percent)||body.pass_percent<=0||body.pass_percent>100 || Number(body.pass_percent.toFixed(2))!==body.pass_percent)fail(400,'Explicit approval threshold required');
      if(!Array.isArray(body.questions)||body.questions.length!==50)fail(400,'Exactly 50 questions required');
      const prepared=body.questions.map(q=>{
        fields(q,['prompt','options','correct_option']);
        if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6)fail(400,'Invalid options');
        const options=q.options.map(o=>text(o,300));
        if(new Set(options).size!==options.length || !Number.isInteger(q.correct_option)||q.correct_option<0||q.correct_option>=options.length)fail(400,'Invalid answer key');
        return {prompt:text(q.prompt,1000),options,correct_option:q.correct_option};
      });
      if(new Set(prepared.map(q=>q.prompt)).size!==50)fail(400,'Questions must be distinct');
      const latest=(await tx.query('select * from public.training_exam_versions where exam_key=$1 order by version desc limit 1 for update',[key])).rows[0];
      if(latest ? body.source_id!==latest.id : body.source_id!==undefined)fail(409,'Exam version changed; refresh first');
      const v=(await tx.query(`insert into public.training_exam_versions(exam_key,version,pass_percent,created_by)
        values($1,$2,$3,$4) returning *`,[key,(latest?.version||0)+1,body.pass_percent,actor.app_user_id])).rows[0];
      for(let i=0;i<prepared.length;i++){
        const q=prepared[i];
        const row=(await tx.query('insert into public.training_exam_questions(exam_version_id,position,prompt,options) values($1,$2,$3,$4) returning id',[v.id,i+1,q.prompt,JSON.stringify(q.options)])).rows[0];
        await tx.query('insert into training_private.training_exam_keys(question_id,correct_option) values($1,$2)',[row.id,q.correct_option]);
      }
      await tx.query("update public.training_exam_versions set status='published' where id=$1",[v.id]);
      await audit(tx,actor,'exam_published','exam_version',v.id,null,{question_count:50,pass_percent:body.pass_percent});
      return {...v,status:'published'};
    }),
    issueExam:(token,body)=>run(token,async(tx,actor)=>{
      requireWrite(actor);fields(body,['enrollment_id','exam_version_id','max_attempts','expires_at']);
      const e=await enrollment(tx,actor,body.enrollment_id);
      if(!Number.isInteger(body.max_attempts)||body.max_attempts<1||body.max_attempts>10)fail(400,'Explicit attempt limit required');
      const expires=typeof body.expires_at==='string'&&/Z$/.test(body.expires_at)?Date.parse(body.expires_at):NaN;
      if(!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+30*86400000)fail(400,'Future expiry within 30 days required');
      const v=(await tx.query("select * from public.training_exam_versions where id=$1 and status='published' for share",[uuid(body.exam_version_id)])).rows[0];
      if(!v)fail(409,'Published exam required');
      const qs=await questions(tx,v.id),keys=(await tx.query(`select k.* from training_private.training_exam_keys k join public.training_exam_questions q on q.id=k.question_id where q.exam_version_id=$1`,[v.id])).rows;
      if(qs.length!==50||qs.some(q=>{const k=keys.find(k=>k.question_id===q.id);return !k||k.correct_option>=q.options.length;}))fail(409,'Exam content is inconsistent');
      if((await tx.query(`select a.id from public.training_exam_assignments a join training_private.training_exam_tokens t on t.assignment_id=a.id
        where a.enrollment_id=$1 and a.status='issued' and t.revoked_at is null and a.expires_at>now()`,[e.id])).rows.length)fail(409,'An invitation is already active');
      const a=(await tx.query(`insert into public.training_exam_assignments(exam_version_id,host_id,enrollment_id,status,expires_at,issued_by,max_attempts)
        values($1,$2,$3,'issued',$4,$5,$6) returning *`,[v.id,e.host_id,e.id,body.expires_at,actor.app_user_id,body.max_attempts])).rows[0];
      const invitation=randomBytes(32).toString('base64url');
      await tx.query('insert into training_private.training_exam_tokens(assignment_id,token_hash) values($1,$2)',[a.id,hash(invitation)]);
      await audit(tx,actor,'exam_issued','exam_assignment',a.id,e.id,{exam_version_id:v.id,program_version_id:e.program_version_id,max_attempts:body.max_attempts});
      return {assignment:a,invitation_token:invitation};
    }),
    revokeExam:(token,body)=>run(token,async(tx,actor)=>{
      requireWrite(actor);fields(body,['assignment_id']);
      const a=(await tx.query('select * from public.training_exam_assignments where id=$1 for update',[uuid(body.assignment_id)])).rows[0];
      if(!a)fail(404,'Record unavailable');
      await enrollment(tx,actor,a.enrollment_id,false);
      const r=await tx.query('update training_private.training_exam_tokens set revoked_at=now() where assignment_id=$1 and revoked_at is null returning assignment_id',[a.id]);
      if(r.rows.length)await audit(tx,actor,'exam_revoked','exam_assignment',a.id,a.enrollment_id);
      return {revoked:true};
    }),
    examStatus:(token,body)=>publicRun(token,async(tx,a)=>{
      fields(body,[]);
      const attempts=(await tx.query('select * from public.training_exam_attempts where assignment_id=$1 order by attempt_number',[a.id])).rows;
      return {question_count:50,pass_percent:Number(a.pass_percent),max_attempts:a.max_attempts,expires_at:a.expires_at,
        attempts:attempts.filter(r=>r.submitted_at).map(result),can_start:a.status==='issued'&&(!attempts.length||!attempts.at(-1).submitted_at||attempts.length<a.max_attempts)};
    }),
    startExam:(token,body)=>publicRun(token,async(tx,a)=>{
      fields(body,[]);
      if(a.status!=='issued')fail(409,'Exam is finished');
      const attempts=(await tx.query('select * from public.training_exam_attempts where assignment_id=$1 order by attempt_number',[a.id])).rows;
      let current=attempts.find(a=>!a.submitted_at);
      if(!current){
        if(attempts.length>=a.max_attempts)fail(409,'Attempt limit reached');
        current=(await tx.query('insert into public.training_exam_attempts(assignment_id,attempt_number) values($1,$2) returning *',[a.id,attempts.length+1])).rows[0];
        await audit(tx,{app_user_id:null},'exam_started','exam_attempt',current.id,a.enrollment_id,{assignment_id:a.id,identity:'invitation bearer'});
      }
      return {attempt_id:current.id,attempt_number:current.attempt_number,questions:await questions(tx,a.exam_version_id)};
    }),
    submitExam:(token,body)=>publicRun(token,async(tx,a)=>{
      fields(body,['attempt_id','answers']);
      const attempt=(await tx.query('select * from public.training_exam_attempts where id=$1 and assignment_id=$2 for update',[uuid(body.attempt_id),a.id])).rows[0];
      if(!attempt)fail(404,'Invitation unavailable');
      const qs=await questions(tx,a.exam_version_id);
      if(!Array.isArray(body.answers)||body.answers.length!==50)fail(400,'Answer all 50 questions');
      const answers=body.answers.map(answer=>{
        fields(answer,['question_id','selected_option']);
        const q=qs.find(q=>q.id===uuid(answer.question_id));
        if(!q||!Number.isInteger(answer.selected_option)||answer.selected_option<0||answer.selected_option>=q.options.length)fail(400,'Invalid answer');
        return {question_id:q.id,selected_option:answer.selected_option};
      }).sort((a,b)=>a.question_id.localeCompare(b.question_id));
      if(new Set(answers.map(a=>a.question_id)).size!==50)fail(400,'Duplicate answer');
      if(attempt.submitted_at){
        const saved=(await tx.query('select question_id,selected_option from training_private.training_exam_answers where attempt_id=$1 order by question_id',[attempt.id])).rows;
        if(JSON.stringify(saved)!==JSON.stringify(answers))fail(409,'Submitted answers cannot change');
        return {...result(attempt),already_submitted:true};
      }
      if(a.status!=='issued')fail(409,'Exam is finished');
      const keys=(await tx.query(`select k.* from training_private.training_exam_keys k join public.training_exam_questions q on q.id=k.question_id where q.exam_version_id=$1`,[a.exam_version_id])).rows;
      if(keys.length!==50)fail(409,'Exam content is inconsistent');
      const score=answers.filter(r=>keys.some(k=>k.question_id===r.question_id&&k.correct_option===r.selected_option)).length*2,passed=score>=Number(a.pass_percent);
      for(const answer of answers)await tx.query('insert into training_private.training_exam_answers(attempt_id,question_id,selected_option) values($1,$2,$3)',[attempt.id,answer.question_id,answer.selected_option]);
      const saved=(await tx.query('update public.training_exam_attempts set submitted_at=now(),score_percent=$2,passed=$3 where id=$1 returning *',[attempt.id,score,passed])).rows[0];
      if(passed||attempt.attempt_number>=a.max_attempts)await tx.query("update public.training_exam_assignments set status='completed' where id=$1",[a.id]);
      await audit(tx,{app_user_id:null},'exam_submitted','exam_attempt',attempt.id,a.enrollment_id,{assignment_id:a.id,identity:'invitation bearer',score_percent:score,passed});
      return {...result(saved),already_submitted:false};
    }),
  };
}
