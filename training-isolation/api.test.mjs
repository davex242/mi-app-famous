import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService, provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';
import { seedDemoProgram } from './demo-fixtures.mjs';

test('isolated HTTP API: sessions, scope and practical validation', async t => {
  const db = await createIsolatedDatabase();
  const service = createTrainingService(db);
  const server = createSandboxHttpServer(service);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const password = 'Synthetic-test-password-ONLY';
  const users = {}, tokens = {};
  async function request(path, body, token, headers = {}) {
    const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  let enrollment, session, evidence;
  const hostA = randomUUID(), hostB = randomUUID(), topic = randomUUID(), program = randomUUID(), item = randomUUID(), wrongItem = randomUUID();
  try {
    for (const [name, role] of [['admin','superadmin'], ['sub','subadmin'], ['a','edit'], ['b','edit'], ['read','readonly'], ['off','edit']]) {
      users[name] = await provisionSyntheticUser(db, name, password, role, name !== 'off');
      if (name !== 'off') {
        const result = await request('/api/login', { username: name, password });
        assert.equal(result.status, 200);
        tokens[name] = result.body.token;
      }
    }
    for (const [host, recruiter] of [[hostA, users.a.app_user_id], [hostB, users.b.app_user_id]]) {
      await db.query('insert into public.hosts(id) values($1)', [host]);
      await db.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)', [host, recruiter, users.admin.app_user_id]);
    }
    await db.query(`insert into public.training_topics(id,content_key,revision,title,category,status,estimated_minutes,created_by)
      values($1,$1,1,'TEST','TEST','published',10,$2)`, [topic, users.admin.app_user_id]);
    await db.query(`insert into public.training_program_versions(id,program_key,version,title,status,created_by,published_by,published_at)
      values($1,'TEST',1,'DEMO','published',$2,$2,now())`, [program, users.admin.app_user_id]);
    await db.query('insert into public.training_program_items(id,program_version_id,topic_id,day,position) values($1,$2,$3,1,1)', [item, program, topic]);
    const otherProgram = randomUUID();
    await db.query("insert into public.training_program_versions(id,program_key,version,title,created_by) values($1,'OTHER',1,'DEMO',$2)", [otherProgram, users.admin.app_user_id]);
    await db.query('insert into public.training_program_items(id,program_version_id,topic_id,day,position) values($1,$2,$3,1,1)', [wrongItem, otherProgram, topic]);

    await t.test('no credential or session token is stored as plaintext', async () => {
      const credentials = (await db.query('select * from training_private.local_credentials')).rows;
      assert.ok(credentials.every(row => row.password_digest !== password && row.password_digest.length === 128));
      const sessions = (await db.query('select token_hash from training_private.local_sessions')).rows;
      assert.ok(sessions.every(row => !Object.values(tokens).includes(row.token_hash) && row.token_hash.length === 64));
    });
    await t.test('unknown, wrong password and inactive login fail uniformly', async () => {
      for (const body of [{ username: 'missing', password }, { username: 'a', password: password + 'wrong' }, { username: 'off', password }]) {
        const result = await request('/api/login', body);
        assert.equal(result.status, 401); assert.equal(result.body.error, 'Invalid credentials');
      }
    });
    await t.test('login cannot take a browser-supplied role or actor', async () => {
      assert.equal((await request('/api/login', { username: 'a', password, role: 'superadmin' })).status, 400);
      assert.equal((await request('/api/me', undefined, 'A'.repeat(43))).status, 401);
    });
    await t.test('request without session is rejected', async () => {
      assert.equal((await request('/api/enrollments', { host_id: hostA, program_version_id: program, timezone: 'America/Costa_Rica' })).status, 401);
    });
    await t.test('readonly cannot enroll; recruiter cannot enroll an unrelated host', async () => {
      const body = { host_id: hostA, program_version_id: program, timezone: 'America/Costa_Rica' };
      assert.equal((await request('/api/enrollments', body, tokens.read)).status, 403);
      assert.equal((await request('/api/enrollments', body, tokens.b)).status, 404);
    });
    await t.test('invalid timezone and draft program are rejected without writes', async () => {
      assert.equal((await request('/api/enrollments', { host_id: hostA, program_version_id: program, timezone: 'INVALID' }, tokens.a)).status, 400);
      assert.equal((await request('/api/enrollments', { host_id: hostA, program_version_id: otherProgram, timezone: 'UTC' }, tokens.a)).status, 409);
      assert.equal((await db.query('select * from public.training_enrollments')).rows.length, 0);
    });
    await t.test('enrollment rejects forged recruiter, progress or status', async () => {
      for (const extra of [{ recruiter_id: users.b.app_user_id }, { progress_percent: 100 }, { status: 'completed' }]) {
        assert.equal((await request('/api/enrollments', { host_id: hostA, program_version_id: program, timezone: 'UTC', ...extra }, tokens.a)).status, 400);
      }
    });
    await t.test('assigned recruiter can enroll; duplicate fails with no extra audit row', async () => {
      const body = { host_id: hostA, program_version_id: program, timezone: 'America/Costa_Rica' };
      const result = await request('/api/enrollments', body, tokens.a);
      assert.equal(result.status, 200); enrollment = result.body;
      assert.equal(enrollment.recruiter_id, users.a.app_user_id);
      assert.equal((await request('/api/enrollments', body, tokens.a)).status, 409);
      assert.equal((await db.query("select * from public.training_events where event_type='enrollment_created'")).rows.length, 1);
    });
    await t.test('HTTP reads enforce own scope and admin access', async () => {
      assert.equal((await request('/api/enrollments', undefined, tokens.a)).body.length, 1);
      assert.equal((await request('/api/enrollments', undefined, tokens.b)).body.length, 0);
      assert.equal((await request('/api/enrollments', undefined, tokens.read)).body.length, 0);
      assert.equal((await request('/api/enrollments', undefined, tokens.sub)).body.length, 1);
    });
    await t.test('agenda rejects cross-version items and foreign users', async () => {
      const body = { enrollment_id: enrollment.id, item_id: item, scheduled_at: '2026-10-20T00:00:00Z', duration_minutes: 30 };
      assert.equal((await request('/api/sessions', { ...body, item_id: wrongItem }, tokens.a)).status, 409);
      assert.equal((await request('/api/sessions', body, tokens.b)).status, 404);
      const result = await request('/api/sessions', body, tokens.a); assert.equal(result.status, 200); session = result.body;
    });
    await t.test('practice cannot complete without evidence and assessment', async () => {
      assert.equal((await request('/api/items/complete', { session_id: session.id }, tokens.sub)).status, 409);
      assert.equal((await request('/api/items/complete', { session_id: session.id }, tokens.a)).status, 403);
      assert.equal((await db.query('select * from public.training_completions')).rows.length, 0);
    });
    await t.test('evidence is server-owned and cannot be preapproved or submitted for another host', async () => {
      const body = { session_id: session.id, description: 'DEMO practical report' };
      assert.equal((await request('/api/evidence', { ...body, status: 'approved' }, tokens.a)).status, 400);
      assert.equal((await request('/api/evidence', body, tokens.b)).status, 404);
      const result = await request('/api/evidence', body, tokens.a); assert.equal(result.status, 200); evidence = result.body;
      assert.equal(evidence.status, 'pending'); assert.equal(evidence.submitted_by, users.a.app_user_id);
    });
    await t.test('recruiter cannot approve; subadmin can reject without erasing evidence', async () => {
      const body = { evidence_id: evidence.id, decision: 'rejected', notes: 'DEMO: incomplete practice' };
      assert.equal((await request('/api/evidence/review', body, tokens.a)).status, 403);
      assert.equal((await request('/api/evidence/review', body, tokens.sub)).status, 200);
      assert.equal((await request('/api/evidence/review', { ...body, decision: 'approved' }, tokens.sub)).status, 409);
    });
    await t.test('new evidence preserves rejected history and receives administrative approval', async () => {
      evidence = (await request('/api/evidence', { session_id: session.id, description: 'DEMO corrected practice' }, tokens.a)).body;
      assert.equal((await request('/api/evidence/review', { evidence_id: evidence.id, decision: 'approved', notes: 'DEMO verified' }, tokens.admin)).status, 200);
      const rows = (await db.query('select status from public.training_evidence order by submitted_at')).rows;
      assert.deepEqual(rows.map(row => row.status), ['rejected', 'approved']);
      assert.equal((await request('/api/items/complete', { session_id: session.id }, tokens.admin)).status, 409);
    });
    await t.test('only admin records practical evaluation; invalid scores fail', async () => {
      const body = { session_id: session.id, score: 90, passed: true, notes: 'DEMO skills validated' };
      assert.equal((await request('/api/assessments', body, tokens.a)).status, 403);
      assert.equal((await request('/api/assessments', { ...body, score: 101 }, tokens.sub)).status, 400);
      assert.equal((await request('/api/assessments', body, tokens.sub)).status, 200);
    });
    await t.test('completion is idempotent and does not finish enrollment or Final Quiz', async () => {
      const body = { session_id: session.id };
      const first = await request('/api/items/complete', body, tokens.sub);
      const second = await request('/api/items/complete', body, tokens.admin);
      assert.equal(first.status, 200); assert.equal(first.body.already_completed, false);
      assert.equal(second.status, 200); assert.equal(second.body.already_completed, true);
      assert.equal((await db.query("select * from public.training_events where event_type='item_completed'")).rows.length, 1);
      assert.equal((await db.query('select status from public.training_enrollments')).rows[0].status, 'active');
    });
    await t.test('audit records the verified actor, not an actor from request data', async () => {
      const rows = (await db.query("select actor_app_user_id from public.training_events where event_type='item_completed'")).rows;
      assert.equal(rows[0].actor_app_user_id, users.sub.app_user_id);
    });
    await t.test('role downgrade takes effect with an already issued token', async () => {
      await db.query("update training_private.training_principals set role='readonly' where auth_user_id=$1", [users.a.auth_user_id]);
      assert.equal((await request('/api/me', undefined, tokens.a)).body.role, 'readonly');
      assert.equal((await request('/api/evidence', { session_id: session.id, description: 'FORBIDDEN' }, tokens.a)).status, 403);
    });
    await t.test('deactivation denies an existing token immediately', async () => {
      await db.query('update training_private.training_principals set is_active=false where auth_user_id=$1', [users.b.auth_user_id]);
      assert.equal((await request('/api/me', undefined, tokens.b)).status, 401);
    });
    await t.test('expired token and logged-out token cannot be reused', async () => {
      await db.query('update training_private.local_sessions set expires_at=now()-interval \'1 second\' where auth_user_id=$1', [users.read.auth_user_id]);
      assert.equal((await request('/api/me', undefined, tokens.read)).status, 401);
      assert.equal((await request('/api/logout', {}, tokens.a)).status, 200);
      assert.equal((await request('/api/me', undefined, tokens.a)).status, 401);
    });
    await t.test('external browser origin is rejected and secrets have no endpoint', async () => {
      assert.equal((await request('/api/me', undefined, tokens.admin, { origin: 'https://external.example' })).status, 403);
      assert.equal((await request('/api/answer-keys', undefined, tokens.admin)).status, 404);
    });
    await t.test('workspace exposes authorized results without credentials or quiz secrets', async () => {
      const result = await request('/api/workspace', undefined, tokens.sub);
      assert.equal(result.status, 200);
      assert.equal(result.body.completions.length, 1);
      assert.ok(!JSON.stringify(result.body).includes('password_digest'));
      assert.ok(!JSON.stringify(result.body).includes('token_hash'));
    });
    await t.test('large JSON and cross-site Host header are rejected', async () => {
      assert.equal((await request('/api/sessions', { description: 'x'.repeat(33000) }, tokens.sub)).status, 413);
      // Node fetch normalizes Host; use raw HTTP to actually exercise a forged header.
      const status = await new Promise((resolve, reject) => {
        const req = httpRequest(url + '/api/me', { headers: { host: 'external.example', authorization: `Bearer ${tokens.sub}` } }, res => {
          res.resume(); resolve(res.statusCode);
        });
        req.on('error', reject); req.end();
      });
      assert.equal(status, 403);
    });
    await t.test('local startup demo supplies 14 synthetic days without importing real data', async () => {
      const demo = await seedDemoProgram(db, users.admin.app_user_id, users.a.app_user_id);
      assert.equal(demo.item_ids.length, 14);
      assert.equal((await db.query('select day from public.training_program_items where program_version_id=$1 order by day', [demo.program_version_id])).rows.length, 14);
    });
    await t.test('login attempts are rate limited', async () => {
      let status;
      for (let i = 0; i < 21; i++) status = (await request('/api/login', { username: 'missing', password: 'short' })).status;
      assert.equal(status, 429);
    });
    await t.test('isolated UI assets use same-origin security headers', async () => {
      for (const path of ['/', '/ui.mjs', '/ui.css']) {
        const response = await fetch(url + path);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
        assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const content = await response.text();
        assert.ok(!content.includes('databasepad.com'));
        assert.ok(!content.includes('service_role'));
      }
      assert.equal((await fetch(url + '/service.mjs')).status, 404);
    });
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await db.close();
  }
});
