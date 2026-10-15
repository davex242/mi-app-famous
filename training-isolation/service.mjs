import {createAcceptedCourseOperations} from './accepted-course.mjs';
import {examAttemptBudget} from './exam-attempts.mjs';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createCatalogueOperations } from './catalogue.mjs';
import { createProgramOperations, ensureNoSessionOverlap } from './programs.mjs';
import { createUpdateOperations, effectiveItemId, updateHistory, currentProgress, propagateCompletion } from './updates.mjs';
import { createExamOperations } from './exams.mjs';
import {createClosingOperations,scopedClosingRecords,scopedExamIssuances} from './closing.mjs';
import {createClosingExportOperations} from './closing-export.mjs';
import {validateMP4} from './private-videos.mjs';
import {validatePDF} from './private-pdfs.mjs';
import {normalizePNG} from './private-images.mjs';
import {createEvidenceFileOperations,loadEvidenceFile,evidencePath,evidenceMetadata} from './evidence-files.mjs';
const derive = promisify(scrypt);
const hash = token => createHash('sha256').update(token).digest('hex');
const admin = actor => ['superadmin', 'subadmin'].includes(actor.role);
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ApiError(status, message); };
function fields(body, names) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !names.includes(key))) fail(400, 'Invalid fields');
}
function text(value, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, 'Invalid text');
  return value.trim();
}
function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(400, 'Invalid ID');
  return value;
}
function requireAdmin(actor) { if (!admin(actor)) fail(403, 'Administrative role required'); }
function requireWrite(actor) { if (!admin(actor) && actor.role !== 'edit') fail(403, 'Write access denied'); }
async function audit(tx, actor, action, entity, entityId, enrollmentId = null, details = {}) {
  await tx.query(`insert into public.training_events(actor_app_user_id,event_type,entity_type,entity_id,enrollment_id,details)
    values($1,$2,$3,$4,$5,$6)`, [actor.app_user_id, action, entity, entityId, enrollmentId, JSON.stringify(details)]);
}
async function scope(tx, actor, host) {
  const { rows } = await tx.query('select recruiter_id from training_private.training_host_assignments where host_id=$1 for share', [host]);
  if (!rows.length || (!admin(actor) && rows[0].recruiter_id !== actor.app_user_id)) fail(404, 'Record unavailable');
  return rows[0].recruiter_id;
}
async function enrollment(tx, actor, key, write = true) {
  const { rows } = await tx.query('select * from public.training_enrollments where id=$1 for update', [uuid(key)]);
  if (!rows.length) fail(404, 'Record unavailable');
  if (!admin(actor) && rows[0].recruiter_id !== actor.app_user_id) fail(404, 'Record unavailable');
  if (write && rows[0].status !== 'active') fail(409, 'Enrollment is not active');
  return rows[0];
}
async function session(tx, actor, key) {
  const { rows } = await tx.query('select * from public.training_sessions where id=$1 for update', [uuid(key)]);
  if (!rows.length) fail(404, 'Record unavailable');
  await enrollment(tx, actor, rows[0].enrollment_id);
  return rows[0];
}

export function createTrainingService(db,{verifiedActor=null,readerRole='authenticated'}={}) {
  if(!['authenticated','training_preview_reader'].includes(readerRole))throw new TypeError('Invalid training reader role');
  async function actorFor(tx, token) {
    if(verifiedActor){const actor=await verifiedActor(tx,token);if(!actor||!actor.auth_user_id||!actor.app_user_id||!['superadmin','subadmin','edit','readonly'].includes(actor.role))fail(401,'Verified training identity required');return actor;}
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, 'Authentication required');
    const { rows } = await tx.query(`select p.auth_user_id,p.app_user_id,p.role from training_private.local_sessions s
      join training_private.training_principals p on p.auth_user_id=s.auth_user_id
      where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and p.is_active for share of s,p`, [hash(token)]);
    if (!rows.length) fail(401, 'Authentication required');
    return rows[0];
  }
  async function run(token, operation) {
    try {
      return await db.transaction(async tx => operation(tx, await actorFor(tx, token)));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (['23505', '23503', '23514'].includes(error.code)) fail(409, 'Operation conflicts with current data');
      throw error;
    }
  }
  return {
    ...createAcceptedCourseOperations(run,{requireAdmin,fields,text,fail,audit}),
    ...createCatalogueOperations(run, { requireAdmin, fields, text, uuid, fail, audit, admin }),
    ...createProgramOperations(run, { fields, text, uuid, fail, requireAdmin, requireWrite, enrollment, session, audit }),
    ...createUpdateOperations(run,{fields,uuid,fail,requireWrite,enrollment,audit}),
    ...createExamOperations(db,run,{fields,text,uuid,fail,requireAdmin,requireWrite,enrollment,audit}),
    ...createClosingOperations(run,{fields,text,uuid,fail,requireAdmin,enrollment,audit}),
    ...createClosingExportOperations(run,{fields,uuid,fail,enrollment,audit}),
    ...createEvidenceFileOperations(run,{fields,uuid,fail,enrollment,audit}),
    async login(body) {
      fields(body, ['username', 'password']);
      const username = text(body.username, 80);
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 200) fail(401, 'Invalid credentials');
      const { rows } = await db.query('select * from training_private.local_credentials where username=$1', [username]);
      // Perform expensive derivation even for unknown usernames to reduce timing differences.
      const candidate = Buffer.from(await derive(body.password, rows[0]?.password_salt ?? 'sandbox-unknown-user', 64));
      const expected = rows.length ? Buffer.from(rows[0].password_digest, 'hex') : Buffer.alloc(64);
      if (!timingSafeEqual(candidate, expected) || !rows.length) fail(401, 'Invalid credentials');
      return db.transaction(async tx => {
        const { rows: principals } = await tx.query('select is_active from training_private.training_principals where auth_user_id=$1 for share', [rows[0].auth_user_id]);
        if (!principals[0]?.is_active) fail(401, 'Invalid credentials');
        const token = randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await tx.query('insert into training_private.local_sessions(token_hash,auth_user_id,expires_at) values($1,$2,$3)', [hash(token), rows[0].auth_user_id, expiresAt]);
        return { token, expires_at: expiresAt, sandbox: true };
      });
    },
    me: token => run(token, async (_, actor) => ({ ...actor, sandbox: true })),
    logout: token => run(token, async tx => {
      await tx.query('update training_private.local_sessions set revoked_at=now() where token_hash=$1', [hash(token)]);
      return { logged_out: true };
    }),
    listEnrollments: token => run(token, async (tx, actor) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.auth_user_id]);
      await tx.exec(`set local role ${readerRole}`);
      return (await tx.query('select * from public.training_enrollments order by started_at,id')).rows;
    }),
    workspace: token => run(token, async (tx, actor) => {
      const trainees = (await tx.query(`select host_id,recruiter_id from training_private.training_host_assignments
        where $1::boolean or recruiter_id=$2 or host_id in (select host_id from public.training_enrollments where recruiter_id=$2) order by host_id`, [admin(actor), actor.app_user_id])).rows;
      const attemptBudgets=[];
      const scopedEnrollments=(await tx.query('select id from public.training_enrollments where $1::boolean or recruiter_id=$2',[admin(actor),actor.app_user_id])).rows;
      for(const e of scopedEnrollments)attemptBudgets.push({enrollment_id:e.id,...await examAttemptBudget(tx,e.id)});
      const exams=(await tx.query("select id,exam_key,version,status,question_count,pass_percent from public.training_exam_versions where status='published' order by exam_key,version desc")).rows;
      const closingRecords=await scopedClosingRecords(tx,actor,admin);
      const issuances=await scopedExamIssuances(tx,actor,admin);
      const revoked=(await tx.query(`select t.assignment_id,t.revoked_at from training_private.training_exam_tokens t
        join public.training_exam_assignments a on a.id=t.assignment_id join public.training_enrollments e on e.id=a.enrollment_id
        where $1::boolean or e.recruiter_id=$2`,[admin(actor),actor.app_user_id])).rows;
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.auth_user_id]);
      await tx.exec(`set local role ${readerRole}`);
      const result = { sandbox: true, exams,closing_records:closingRecords, trainees: trainees.map((row, i) => ({ ...row, label: `Emisor DEMO ${i + 1}` })) };
      for (const table of ['topics', 'materials', 'program_versions', 'program_items', 'program_materials', 'enrollments', 'update_history', 'sessions', 'attendance', 'evidence', 'assessments', 'approvals', 'completions', 'events']) {
        // Static table allowlist; never accepts a table name from a caller.
        result[table] = (await tx.query(`select * from public.training_${table}`)).rows;
      }
      // Material content and link targets require a separate permission-checked request.
      result.materials = result.materials.map(material => ({ ...material, external_url: null }));
      result.exam_assignments=(await tx.query('select * from public.training_exam_assignments')).rows.map(a=>({...a,program_version_id:issuances.find(i=>i.assignment_id===a.id)?.program_version_id||null,revoked_at:revoked.find(t=>t.assignment_id===a.id)?.revoked_at||null}));
      result.exam_attempts=(await tx.query('select * from public.training_exam_attempts')).rows;
      result.exam_attempt_budgets=attemptBudgets;
      result.progress=[];
      for(const e of result.enrollments) result.progress.push(await currentProgress(tx,e));
      result.sessions=result.sessions.map(s=>{
        const e=result.enrollments.find(e=>e.id===s.enrollment_id);
        return {...s,current_item_id:effectiveItemId(s.item_id,result.update_history.filter(h=>h.enrollment_id===s.enrollment_id),result.program_items.filter(i=>i.program_version_id===e?.program_version_id))};
      });
      return result;
    }),
    reassignEnrollment: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['enrollment_id', 'trainer_id']);
      const e = await enrollment(tx, actor, body.enrollment_id);
      const trainer = uuid(body.trainer_id);
      if (!(await tx.query("select app_user_id from training_private.training_principals where app_user_id=$1 and is_active and role in ('edit','subadmin','superadmin') for share", [trainer])).rows.length) fail(409, 'Active trainer required');
      if (e.recruiter_id === trainer) return e;
      const saved = (await tx.query('update public.training_enrollments set recruiter_id=$2 where id=$1 returning *', [e.id, trainer])).rows[0];
      await audit(tx, actor, 'enrollment_reassigned', 'enrollment', e.id, e.id, {previous_trainer_id:e.recruiter_id,trainer_id:trainer});
      return saved;
    }),
    enroll: (token, body) => run(token, async (tx, actor) => {
      requireWrite(actor); fields(body, ['host_id', 'program_version_id', 'timezone']);
      const host = uuid(body.host_id), version = uuid(body.program_version_id);
      const recruiter = await scope(tx, actor, host);
      const timezone = text(body.timezone, 80);
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { fail(400, 'Invalid timezone'); }
      const { rows: versions } = await tx.query('select id from public.training_program_versions where id=$1 and status=$2 for share', [version, 'published']);
      if (!versions.length) fail(409, 'Published program required');
      const { rows } = await tx.query(`insert into public.training_enrollments(host_id,recruiter_id,program_version_id,timezone)
        values($1,$2,$3,$4) returning *`, [host, recruiter, version, timezone]);
      await audit(tx, actor, 'enrollment_created', 'enrollment', rows[0].id, rows[0].id);
      return rows[0];
    }),
    schedule: (token, body) => run(token, async (tx, actor) => {
      requireWrite(actor); fields(body, ['enrollment_id', 'item_id', 'scheduled_at', 'duration_minutes']);
      const e = await enrollment(tx, actor, body.enrollment_id);
      const { rows: items } = await tx.query('select * from public.training_program_items where id=$1 and program_version_id=$2', [uuid(body.item_id), e.program_version_id]);
      if (!items.length) fail(409, 'Item does not belong to enrollment version');
      if (typeof body.scheduled_at !== 'string' || !/Z$/.test(body.scheduled_at) || !Number.isFinite(Date.parse(body.scheduled_at))) fail(400, 'UTC date required');
      if (!Number.isInteger(body.duration_minutes) || body.duration_minutes < 1 || body.duration_minutes > 480) fail(400, 'Invalid duration');
      const retained=(await tx.query('select item_id from public.training_sessions where enrollment_id=$1',[e.id])).rows;
      const history=await updateHistory(tx,e.id);
      if(retained.some(s=>effectiveItemId(s.item_id,history,items)===items[0].id)) fail(409,'This practice already has a preserved session');
      if((await tx.query('select item_id from public.training_completions where enrollment_id=$1 and item_id=$2',[e.id,items[0].id])).rows.length) fail(409,'This practice is already validated');
      await ensureNoSessionOverlap(tx, e.id, body.scheduled_at, body.duration_minutes, null, fail);
      const { rows } = await tx.query(`insert into public.training_sessions(enrollment_id,item_id,topic_id,scheduled_at,duration_minutes,auto_generated,edited_manually)
        values($1,$2,$3,$4,$5,false,true) returning *`, [e.id, items[0].id, items[0].topic_id, body.scheduled_at, body.duration_minutes]);
      await audit(tx, actor, 'session_scheduled', 'session', rows[0].id, e.id);
      return rows[0];
    }),
    submitEvidence: (token, body) => run(token, async (tx, actor) => {
      requireWrite(actor); fields(body, ['session_id', 'description','image_base64','pdf_base64','video_base64','consent_confirmed']);
      const s = await session(tx, actor, body.session_id),description=text(body.description);
      const png=Object.hasOwn(body,'image_base64'),pdf=Object.hasOwn(body,'pdf_base64'),video=Object.hasOwn(body,'video_base64'),attached=png||pdf||video;
      if(Number(png)+Number(pdf)+Number(video)>1)fail(400,'Choose one evidence file');
      if(attached&&body.consent_confirmed!==true)fail(400,'Evidence file consent required');
      if(!attached&&Object.hasOwn(body,'consent_confirmed'))fail(400,'Invalid fields');
      const file=pdf?await validatePDF(body.pdf_base64,fail):video?validateMP4(body.video_base64,fail):png?normalizePNG(body.image_base64,fail):null,id=randomUUID();
      const { rows } = await tx.query(`insert into public.training_evidence(id,enrollment_id,session_id,topic_id,description,submitted_by,storage_path)
        values($1,$2,$3,$4,$5,$6,$7) returning *`, [id,s.enrollment_id, s.id, s.topic_id,description, actor.app_user_id,file?evidencePath(id,pdf?'pdf':video?'video':'image'):null]);
      if(file)await tx.query('insert into training_private.local_evidence_content(evidence_id,body) values($1,$2)',[id,JSON.stringify(file)]);
      await tx.query('insert into public.training_approvals(evidence_id,requested_by) values($1,$2)', [id, actor.app_user_id]);
      await audit(tx, actor, 'evidence_submitted', 'evidence', id, s.enrollment_id,file?{attachment:evidenceMetadata(file),consent_confirmed:true}:{});
      return rows[0];
    }),
    reviewEvidence: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['evidence_id', 'decision', 'notes']);
      if (!['approved', 'rejected'].includes(body.decision)) fail(400, 'Invalid decision');
      const notes = text(body.notes);
      const { rows } = await tx.query('select * from public.training_evidence where id=$1 for update', [uuid(body.evidence_id)]);
      if (!rows.length) fail(404, 'Record unavailable');
      const e = await enrollment(tx, actor, rows[0].enrollment_id);
      if (rows[0].status !== 'pending') fail(409, 'Evidence already reviewed');
      if(body.decision==='approved')await loadEvidenceFile(tx,rows[0],fail);
      await tx.query('update public.training_evidence set status=$1 where id=$2', [body.decision, rows[0].id]);
      const approval = await tx.query(`update public.training_approvals set status=$1,reviewed_by=$2,review_notes=$3,reviewed_at=now()
        where evidence_id=$4 and status='pending' returning id`, [body.decision, actor.app_user_id, notes, rows[0].id]);
      if (approval.rows.length !== 1) fail(409, 'Approval history is inconsistent');
      await audit(tx, actor, 'evidence_' + body.decision, 'evidence', rows[0].id, e.id);
      return { ...rows[0], status: body.decision };
    }),
    assess: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['session_id', 'score', 'passed', 'notes']);
      const s = await session(tx, actor, body.session_id);
      if (!Number.isFinite(body.score) || body.score < 0 || body.score > 100 || typeof body.passed !== 'boolean') fail(400, 'Invalid assessment');
      const { rows } = await tx.query(`insert into public.training_assessments(enrollment_id,topic_id,score,passed,notes,assessed_by)
        values($1,$2,$3,$4,$5,$6) returning *`, [s.enrollment_id, s.topic_id, body.score, body.passed, text(body.notes), actor.app_user_id]);
      await audit(tx, actor, 'assessment_recorded', 'assessment', rows[0].id, s.enrollment_id);
      return rows[0];
    }),
    completeItem: (token, body) => run(token, async (tx, actor) => {
      requireAdmin(actor); fields(body, ['session_id']);
      const s = await session(tx, actor, body.session_id);
      const { rows: items } = await tx.query('select * from public.training_program_items where id=$1', [s.item_id]);
      if (items[0].evidence_required) {
        const { rows } = await tx.query("select * from public.training_evidence where session_id=$1 and status='approved'", [s.id]);
        if (!rows.length) fail(409, 'Approved practical evidence required');
        await loadEvidenceFile(tx,rows.sort((a,b)=>a.id.localeCompare(b.id))[0],fail);
      }
      if (items[0].assessment_required) {
        const { rows } = await tx.query(`select passed from public.training_assessments where enrollment_id=$1 and topic_id=$2
          order by assessed_at desc,id desc limit 1`, [s.enrollment_id, s.topic_id]);
        if (rows[0]?.passed !== true) fail(409, 'Passing administrative assessment required');
      }
      const result = await tx.query(`insert into public.training_completions(enrollment_id,item_id,validated_by)
        values($1,$2,$3) on conflict(enrollment_id,item_id) do nothing returning item_id`, [s.enrollment_id, s.item_id, actor.app_user_id]);
      if (result.rows.length) {
        await tx.query("update public.training_sessions set status='completed' where id=$1", [s.id]);
        await audit(tx, actor, 'item_completed', 'session', s.id, s.enrollment_id);
      }
      const credit=(await tx.query('select * from public.training_completions where enrollment_id=$1 and item_id=$2',[s.enrollment_id,s.item_id])).rows[0];
      const e=await enrollment(tx,actor,s.enrollment_id);
      await propagateCompletion(tx,e,credit);
      // Finishing one item does NOT complete the whole enrollment or bypass Final Quiz.
      return { item_id: s.item_id, completed: true, already_completed: !result.rows.length };
    }),
  };
}

// Only local fixtures call this; it is deliberately NOT an HTTP registration endpoint.
export async function provisionSyntheticUser(db, username, password, role, active = true) {
  if (!['superadmin', 'subadmin', 'edit', 'readonly'].includes(role)) throw new Error('Invalid fixture role');
  const authId = randomUUID(), appId = randomUUID(), salt = randomBytes(16).toString('hex');
  const digest = Buffer.from(await derive(password, salt, 64)).toString('hex');
  await db.transaction(async tx => {
    await tx.query('insert into auth.users(id) values($1)', [authId]);
    await tx.query('insert into public.app_users(id) values($1)', [appId]);
    await tx.query('insert into training_private.training_principals(auth_user_id,app_user_id,role,is_active) values($1,$2,$3,$4)', [authId, appId, role, active]);
    await tx.query('insert into training_private.local_credentials(auth_user_id,username,password_salt,password_digest) values($1,$2,$3,$4)', [authId, username, salt, digest]);
  });
  return { auth_user_id: authId, app_user_id: appId, role };
}
