import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
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
async function audit(tx, actor, action, entity, entityId, enrollmentId = null) {
  await tx.query(`insert into public.training_events(actor_app_user_id,event_type,entity_type,entity_id,enrollment_id)
    values($1,$2,$3,$4,$5)`, [actor.app_user_id, action, entity, entityId, enrollmentId]);
}
async function scope(tx, actor, host) {
  const { rows } = await tx.query('select recruiter_id from training_private.training_host_assignments where host_id=$1 for share', [host]);
  if (!rows.length || (!admin(actor) && rows[0].recruiter_id !== actor.app_user_id)) fail(404, 'Record unavailable');
  return rows[0].recruiter_id;
}
async function enrollment(tx, actor, key, write = true) {
  const { rows } = await tx.query('select * from public.training_enrollments where id=$1 for update', [uuid(key)]);
  if (!rows.length) fail(404, 'Record unavailable');
  await scope(tx, actor, rows[0].host_id);
  if (write && rows[0].status !== 'active') fail(409, 'Enrollment is not active');
  return rows[0];
}
async function session(tx, actor, key) {
  const { rows } = await tx.query('select * from public.training_sessions where id=$1 for update', [uuid(key)]);
  if (!rows.length) fail(404, 'Record unavailable');
  await enrollment(tx, actor, rows[0].enrollment_id);
  return rows[0];
}

export function createTrainingService(db) {
  async function actorFor(tx, token) {
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
      await tx.exec('set local role authenticated');
      return (await tx.query('select * from public.training_enrollments order by started_at,id')).rows;
    }),
    workspace: token => run(token, async (tx, actor) => {
      const trainees = (await tx.query(`select host_id,recruiter_id from training_private.training_host_assignments
        where $1::boolean or recruiter_id=$2 order by host_id`, [admin(actor), actor.app_user_id])).rows;
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [actor.auth_user_id]);
      await tx.exec('set local role authenticated');
      const result = { sandbox: true, trainees: trainees.map((row, i) => ({ ...row, label: `Emisor DEMO ${i + 1}` })) };
      for (const table of ['topics', 'program_versions', 'program_items', 'enrollments', 'sessions', 'evidence', 'assessments', 'approvals', 'completions']) {
        // Static table allowlist; never accepts a table name from a caller.
        result[table] = (await tx.query(`select * from public.training_${table}`)).rows;
      }
      return result;
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
      const { rows } = await tx.query(`insert into public.training_sessions(enrollment_id,item_id,topic_id,scheduled_at,duration_minutes,auto_generated,edited_manually)
        values($1,$2,$3,$4,$5,false,true) returning *`, [e.id, items[0].id, items[0].topic_id, body.scheduled_at, body.duration_minutes]);
      await audit(tx, actor, 'session_scheduled', 'session', rows[0].id, e.id);
      return rows[0];
    }),
    submitEvidence: (token, body) => run(token, async (tx, actor) => {
      requireWrite(actor); fields(body, ['session_id', 'description']);
      const s = await session(tx, actor, body.session_id);
      const { rows } = await tx.query(`insert into public.training_evidence(enrollment_id,session_id,topic_id,description,submitted_by)
        values($1,$2,$3,$4,$5) returning *`, [s.enrollment_id, s.id, s.topic_id, text(body.description), actor.app_user_id]);
      await tx.query('insert into public.training_approvals(evidence_id,requested_by) values($1,$2)', [rows[0].id, actor.app_user_id]);
      await audit(tx, actor, 'evidence_submitted', 'evidence', rows[0].id, s.enrollment_id);
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
        const { rows } = await tx.query("select id from public.training_evidence where session_id=$1 and status='approved'", [s.id]);
        if (!rows.length) fail(409, 'Approved practical evidence required');
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
