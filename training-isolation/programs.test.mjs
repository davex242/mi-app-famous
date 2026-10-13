import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService, provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';

test('isolated programs and agenda: versions, calendar and preservation', async t => {
  const db = await createIsolatedDatabase(), service = createTrainingService(db);
  const server = createSandboxHttpServer(service);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`, tokens = {}, users = {};
  let topic, material, program, newer, registration, session;
  async function call(path, body, role = 'admin') {
    const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      'content-type': 'application/json', ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const body = () => ({ title: 'DEMO Programa flexible', duration_days: 14, changelog: 'Primera versión',
    items: [{ day: 1, topic_id: topic.id, notes: 'Primer paso', material_ids: [material.id] }, { day: 2, topic_id: topic.id, notes: 'Segundo paso', material_ids: [] }] });
  async function enroll(timezone) {
    const host = randomUUID();
    await db.query('insert into public.hosts(id) values($1)', [host]);
    await db.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)', [host, users.a.app_user_id, users.admin.app_user_id]);
    const result = await call('/api/enrollments', { host_id: host, program_version_id: program.id, timezone }, 'a');
    assert.equal(result.status, 200); return result.body;
  }
  try {
    for (const [name, role] of [['admin','superadmin'], ['sub','subadmin'], ['a','edit'], ['b','edit'], ['read','readonly']]) {
      users[name] = await provisionSyntheticUser(db, name, 'Program-test-password-ONLY', role);
      tokens[name] = (await call('/api/login', { username: name, password: 'Program-test-password-ONLY' }, 'missing')).body.token;
    }
    topic = (await call('/api/topics', { title: 'DEMO Tema', description: '', category: 'Training', estimated_minutes: 30 })).body;
    material = (await call('/api/materials', { topic_id: topic.id, title: 'DEMO Material', kind: 'document', content: 'Guía', allow_preview: true, allow_download: true })).body;
    await t.test('program builder rejects nonadministrators', async () => {
      for (const role of ['a', 'read']) assert.equal((await call('/api/programs', body(), role)).status, 403);
    });
    await t.test('admin creates draft with exact topic/material revisions and mandatory practices', async () => {
      const result = await call('/api/programs', body()); assert.equal(result.status, 200); program = result.body;
      assert.equal(program.status, 'draft'); assert.equal(program.duration_days, 14);
      const items = (await db.query('select * from public.training_program_items where program_version_id=$1 order by day', [program.id])).rows;
      assert.equal(items.length, 2); assert.ok(items.every(item => item.evidence_required && item.assessment_required));
      assert.equal((await call('/api/workspace', undefined, 'a')).body.program_versions.length, 0);
    });
    await t.test('out-of-range days and disabling practical requirements roll back the whole draft', async () => {
      const invalid = body(); invalid.items[1].day = 15;
      assert.equal((await call('/api/programs', invalid)).status, 400);
      invalid.items[1].day = 2; invalid.items[1].evidence_required = false;
      assert.equal((await call('/api/programs', invalid)).status, 400);
      assert.equal((await db.query('select * from public.training_program_versions')).rows.length, 1);
    });
    await t.test('publication requires published topic and material revisions', async () => {
      assert.equal((await call('/api/programs/publish', { id: program.id })).status, 409);
      await call('/api/topics/publish', { id: topic.id });
      assert.equal((await call('/api/programs/publish', { id: program.id })).status, 409);
      await call('/api/materials/publish', { id: material.id });
      const result = await call('/api/programs/publish', { id: program.id }, 'sub');
      assert.equal(result.status, 200); assert.equal(result.body.published_by, users.sub.app_user_id);
    });
    await t.test('cross-topic materials cannot be attached and failures do not leave partial programs', async () => {
      const other = (await call('/api/topics', { title:'DEMO Other',description:'',category:'Training',estimated_minutes:20 })).body;
      const foreign = (await call('/api/materials', { topic_id:other.id,title:'DEMO Foreign',kind:'document',content:'Text',allow_preview:true,allow_download:true })).body;
      const invalid = body(); invalid.items[0].material_ids=[foreign.id];
      assert.equal((await call('/api/programs', invalid)).status,409);
      assert.equal((await db.query('select * from public.training_program_versions')).rows.length,1);
    });
    await t.test('publication is idempotent and creates one audited action', async () => {
      assert.equal((await call('/api/programs/publish', { id: program.id })).body.already_published, true);
      assert.equal((await db.query("select * from public.training_events where event_type='program_published'")).rows.length, 1);
    });
    await t.test('new program version leaves the existing enrollment pinned to its original version', async () => {
      registration = await enroll('America/Costa_Rica');
      newer = (await call('/api/programs', { ...body(), source_id: program.id, title: 'DEMO Programa v2', duration_days: 21, changelog: 'Ampliación opcional' }, 'sub')).body;
      assert.equal(newer.version, 2); assert.equal(newer.program_key, program.program_key);
      assert.equal((await db.query('select program_version_id from public.training_enrollments where id=$1', [registration.id])).rows[0].program_version_id, program.id);
      assert.equal((await call('/api/programs', { ...body(), source_id: program.id })).status, 409);
    });
    await t.test('agenda preview respects local time, training weekdays, and does not persist', async () => {
      const result = await call('/api/agenda/preview', { enrollment_id: registration.id, start_date: '2026-10-23', local_time: '19:00', weekdays: [1,2,3,4,5] }, 'a');
      assert.equal(result.status, 200); assert.equal(result.body.preview, true);
      assert.equal(result.body.sessions[0].scheduled_at, '2026-10-24T01:00:00.000Z');
      assert.equal(result.body.sessions[1].scheduled_at, '2026-10-27T01:00:00.000Z');
      assert.equal((await db.query('select * from public.training_sessions')).rows.length, 0);
    });
    await t.test('readonly and unrelated recruiter cannot generate or preview the agenda', async () => {
      const params = { enrollment_id: registration.id, start_date: '2026-10-23', local_time: '19:00' };
      assert.equal((await call('/api/agenda/generate', params, 'read')).status, 403);
      assert.equal((await call('/api/agenda/preview', params, 'b')).status, 404);
    });
    await t.test('generation persists once and repeated requests preserve all sessions', async () => {
      const params = { enrollment_id: registration.id, start_date: '2026-10-23', local_time: '19:00', weekdays: [1,2,3,4,5] };
      const first = await call('/api/agenda/generate', params, 'a');
      assert.equal(first.status, 200); assert.equal(first.body.created, 2); session = first.body.sessions[0];
      const again = await call('/api/agenda/generate', { ...params, local_time: '20:00' }, 'a');
      assert.equal(again.body.created, 0); assert.equal(again.body.skipped, 2);
      assert.equal((await db.query('select * from public.training_sessions where id=$1', [session.id])).rows[0].edited_manually, false);
      assert.equal((await db.query("select * from public.training_events where event_type='agenda_generated'")).rows.length, 1);
    });
    await t.test('manual rescheduling preserves identity, requires current date and records the actor', async () => {
      const params = { session_id: session.id, local_date: '2026-10-24', local_time: '18:00', expected_scheduled_at: session.scheduled_at, reason: 'DEMO disponibilidad' };
      assert.equal((await call('/api/sessions/reschedule', params, 'b')).status, 404);
      const result = await call('/api/sessions/reschedule', params, 'a');
      assert.equal(result.status, 200); assert.equal(result.body.id, session.id); assert.equal(result.body.edited_manually, true);
      assert.equal(result.body.scheduled_at, '2026-10-25T00:00:00.000Z');
      assert.equal((await call('/api/sessions/reschedule', params, 'a')).status, 409);
      session = result.body;
      const event = (await db.query("select * from public.training_events where event_type='session_rescheduled'")).rows[0];
      assert.equal(event.actor_app_user_id, users.a.app_user_id); assert.equal(event.details.reason, params.reason);
    });
    await t.test('regeneration preserves manually edited and completed sessions', async () => {
      await db.query("update public.training_sessions set status='completed' where id=$1", [session.id]);
      const result = await call('/api/agenda/generate', { enrollment_id: registration.id, start_date: '2026-11-01', local_time: '09:00' }, 'a');
      assert.equal(result.body.created, 0); assert.equal(result.body.skipped, 2);
      assert.equal((await db.query('select status,scheduled_at from public.training_sessions where id=$1', [session.id])).rows[0].status, 'completed');
      assert.equal((await call('/api/sessions/reschedule', { session_id: session.id, local_date: '2026-11-02', local_time: '19:00', expected_scheduled_at: session.scheduled_at, reason: 'Forbidden' }, 'a')).status, 409);
    });
    await t.test('attendance is scoped, auditable and does not autoapprove or complete training', async () => {
      assert.equal((await call('/api/attendance', { session_id: session.id, status: 'present' }, 'read')).status, 403);
      assert.equal((await call('/api/attendance', { session_id: session.id, status: 'present' }, 'b')).status, 404);
      const result = await call('/api/attendance', { session_id: session.id, status: 'present' }, 'a');
      assert.equal(result.status, 200); assert.equal(result.body.recorded_by, users.a.app_user_id);
      assert.equal((await call('/api/attendance', { session_id: session.id, status: 'absent' }, 'a')).status, 409);
      assert.equal((await call('/api/attendance', { session_id: session.id, status: 'late', expected_recorded_at: result.body.recorded_at }, 'a')).status, 200);
      assert.equal((await db.query('select * from public.training_attendance')).rows.length, 1);
      assert.equal((await db.query('select * from public.training_completions')).rows.length, 0);
    });
    await t.test('daylight saving preserves local start time across successive training days', async () => {
      const e = await enroll('America/New_York');
      const result = await call('/api/agenda/preview', { enrollment_id: e.id, start_date: '2026-03-07', local_time: '19:00' }, 'a');
      assert.equal(result.status, 200);
      assert.equal(result.body.sessions[0].scheduled_at, '2026-03-08T00:00:00.000Z');
      assert.equal(result.body.sessions[1].scheduled_at, '2026-03-08T23:00:00.000Z');
    });
    await t.test('skipped and repeated local times are rejected, with no partial writes', async () => {
      for (const [start_date, local_time] of [['2026-03-08','02:30'], ['2026-03-07','02:30'], ['2026-11-01','01:30']]) {
        const e = await enroll('America/New_York');
        assert.equal((await call('/api/agenda/generate', { enrollment_id: e.id, start_date, local_time }, 'a')).status, 409);
        assert.equal((await db.query('select * from public.training_sessions where enrollment_id=$1', [e.id])).rows.length, 0);
      }
    });
    await t.test('invalid dates, weekdays and overlapping reschedule attempts fail', async () => {
      const params = { enrollment_id: registration.id, start_date: '2026-02-30', local_time: '19:00' };
      assert.equal((await call('/api/agenda/preview', params, 'a')).status, 400);
      assert.equal((await call('/api/agenda/preview', { ...params, start_date: '2026-10-12', weekdays: [] }, 'a')).status, 400);
      const other = (await db.query('select * from public.training_sessions where enrollment_id=$1 and id<>$2', [registration.id, session.id])).rows[0];
      assert.equal((await call('/api/sessions/reschedule', { session_id: other.id, local_date: '2026-10-24', local_time: '18:00', expected_scheduled_at: other.scheduled_at, reason: 'Overlap' }, 'a')).status, 409);
    });
    await t.test('existing manual session can block generation without being overwritten', async () => {
      const e=await enroll('America/Costa_Rica');
      const items=(await db.query('select * from public.training_program_items where program_version_id=$1 order by day',[program.id])).rows;
      const manual=await call('/api/sessions',{enrollment_id:e.id,item_id:items[1].id,scheduled_at:'2026-10-24T01:00:00Z',duration_minutes:30},'a');
      assert.equal(manual.status,200);
      assert.equal((await call('/api/agenda/generate',{enrollment_id:e.id,start_date:'2026-10-23',local_time:'19:00'},'a')).status,409);
      const rows=(await db.query('select * from public.training_sessions where enrollment_id=$1',[e.id])).rows;
      assert.equal(rows.length,1);assert.equal(rows[0].id,manual.body.id);
      assert.equal((await call('/api/sessions',{enrollment_id:e.id,item_id:items[0].id,scheduled_at:'2026-10-24T01:00:00Z',duration_minutes:30},'a')).status,409);
    });
    await t.test('multiple practices on one day are ordered consecutively', async () => {
      const params=body();params.title='DEMO same-day program';params.items[1].day=1;
      const p=(await call('/api/programs',params)).body;
      await call('/api/programs/publish',{id:p.id});
      const e=await enroll('America/Costa_Rica');
      await db.query('update public.training_enrollments set program_version_id=$1 where id=$2',[p.id,e.id]);
      const result=await call('/api/agenda/preview',{enrollment_id:e.id,start_date:'2026-10-23',local_time:'19:00'},'a');
      assert.equal(result.status,200);
      assert.deepEqual(result.body.sessions.map(s=>s.scheduled_at),['2026-10-24T01:00:00.000Z','2026-10-24T01:30:00.000Z']);
    });
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await db.close();
  }
});
