import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// No connection strings, sockets, cloud client or production schema downloads.
// PostgreSQL runs inside this process; only synthetic fixtures enter it.
const draftUrl = new URL('../docs/training-stage-2/schema-and-rls.draft.sql', import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = { superadmin: id(1), subadmin: id(2), editA: id(3), editB: id(4), readonly: id(5), inactive: id(6), unknown: id(7) };
const roles = { superadmin: 'superadmin', subadmin: 'subadmin', editA: 'edit', editB: 'edit', readonly: 'readonly', inactive: 'superadmin' };

async function insert(db, table, values) {
  const entries = Object.entries(values);
  // Names originate solely from the fixture definitions below, not user input.
  await db.query(`insert into ${table} (${entries.map(([k]) => k).join(',')}) values (${entries.map((_, i) => `$${i + 1}`).join(',')})`, entries.map(([, v]) => v));
}
async function asUser(db, user, sql, params = [], role = 'authenticated') {
  assert.ok(['authenticated', 'anon'].includes(role));
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? '']);
    return await db.query(sql, params);
  } finally {
    await db.exec('rollback');
  }
}

test('isolated PostgreSQL: draft compilation and authorization matrix', async t => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(new URL('bootstrap.sql', import.meta.url), 'utf8'));
    const original = await readFile(draftUrl, 'utf8');
    const guard = /do \$\$ begin\s+raise exception 'DESIGN ONLY:[^\n]+\nend \$\$;/;
    assert.match(original, guard);
    assert.match(original, /rollback;\s*$/);
    // Only this in-memory harness strips the deliberate design guard.
    // It never creates a deployable migration or rewrites the source draft.
    const schema = original.replace(guard, '-- Guard removed inside in-memory test only.').replace(/rollback;\s*$/, 'commit;');
    await t.test('draft executes on PostgreSQL with synthetic UUID prerequisites', async () => {
      await db.exec(schema);
      const { rows } = await db.query("select count(*)::integer as n from pg_tables where schemaname='public' and tablename like 'training_%'");
      assert.equal(rows[0].n, 18);
    });

    for (const [name, user] of Object.entries(users)) {
      await insert(db, 'auth.users', { id: user });
      await insert(db, 'public.app_users', { id: user });
      if (name !== 'unknown') await insert(db, 'training_private.training_principals', { auth_user_id: user, app_user_id: user, role: roles[name], is_active: name !== 'inactive' });
    }
    const topic = id(100), draftTopic = id(101), archiveTopic = id(102), program = id(110), item = id(120), material = id(130), exam = id(140), question = id(150);
    for (const [key, status] of [[topic, 'published'], [draftTopic, 'draft'], [archiveTopic, 'archived']]) await insert(db, 'public.training_topics', { id: key, content_key: key, revision: 1, title: `TEST ${status}`, category: 'TEST', status, estimated_minutes: 10, created_by: users.superadmin });
    await insert(db, 'public.training_materials', { id: material, content_key: material, revision: 1, topic_id: topic, title: 'TEST MATERIAL', kind: 'document', storage_path: 'synthetic/test.pdf', status: 'published', created_by: users.superadmin });
    await insert(db, 'public.training_program_versions', { id: program, program_key: 'SYNTHETIC', version: 1, title: 'TEST 14 DAYS', status: 'published', created_by: users.superadmin, published_by: users.subadmin, published_at: '2026-10-01T00:00:00Z' });
    await insert(db, 'public.training_program_items', { id: item, program_version_id: program, topic_id: topic, day: 1, position: 1 });
    await insert(db, 'public.training_program_materials', { item_id: item, material_id: material });
    await insert(db, 'public.training_exam_versions', { id: exam, exam_key: 'SYNTHETIC', version: 1, pass_percent: 80, created_by: users.superadmin });
    await insert(db, 'public.training_exam_questions', { id: question, exam_version_id: exam, position: 1, prompt: 'TEST ONLY', options: '["A","B"]', topic_id: topic });
    await insert(db, 'training_private.training_exam_keys', { question_id: question, correct_option: 1 });
    const owners = [users.editA, users.editB, users.readonly];
    for (let i = 0; i < owners.length; i++) {
      const host = id(200 + i), enrollment = id(210 + i), session = id(220 + i), evidence = id(230 + i), assessment = id(240 + i), assignment = id(250 + i), attempt = id(260 + i);
      await insert(db, 'public.hosts', { id: host });
      await insert(db, 'training_private.training_host_assignments', { host_id: host, recruiter_id: owners[i], assigned_by: users.superadmin });
      await insert(db, 'public.training_enrollments', { id: enrollment, host_id: host, recruiter_id: owners[i], program_version_id: program, timezone: 'America/Costa_Rica' });
      await insert(db, 'public.training_sessions', { id: session, enrollment_id: enrollment, item_id: item, topic_id: topic, scheduled_at: '2026-10-14T00:00:00Z', duration_minutes: 30 });
      await insert(db, 'public.training_attendance', { session_id: session, status: 'present', recorded_by: owners[i] });
      await insert(db, 'public.training_evidence', { id: evidence, enrollment_id: enrollment, session_id: session, topic_id: topic, description: 'SYNTHETIC', submitted_by: owners[i] });
      await insert(db, 'public.training_assessments', { id: assessment, enrollment_id: enrollment, topic_id: topic, assessed_by: users.subadmin });
      await insert(db, 'public.training_approvals', { evidence_id: evidence, requested_by: owners[i] });
      await insert(db, 'public.training_completions', { enrollment_id: enrollment, item_id: item, validated_by: users.subadmin });
      await insert(db, 'public.training_exam_assignments', { id: assignment, exam_version_id: exam, host_id: host, enrollment_id: enrollment, issued_by: users.subadmin, max_attempts: 1 });
      await insert(db, 'public.training_exam_attempts', { id: attempt, assignment_id: assignment, attempt_number: 1 });
      await insert(db, 'training_private.training_exam_tokens', { assignment_id: assignment, token_hash: `FAKE-NON-USABLE-HASH-${i}` });
      await insert(db, 'training_private.training_exam_answers', { attempt_id: attempt, question_id: question, selected_option: 0 });
      await insert(db, 'public.training_events', { actor_app_user_id: owners[i], event_type: 'synthetic_fixture', entity_type: 'enrollment', entity_id: enrollment, enrollment_id: enrollment });
    }

    const scoped = ['enrollments', 'sessions', 'attendance', 'evidence', 'assessments', 'approvals', 'completions', 'exam_assignments', 'exam_attempts'];
    for (const table of scoped) {
      for (const name of ['superadmin', 'subadmin', 'editA', 'editB', 'readonly', 'inactive', 'unknown']) {
        await t.test(`${name} SELECT ${table}: only authorized rows`, async () => {
          const { rows } = await asUser(db, users[name], `select count(*)::integer as n from public.training_${table}`);
          assert.equal(rows[0].n, ['superadmin', 'subadmin'].includes(name) ? 3 : ['inactive', 'unknown'].includes(name) ? 0 : 1);
        });
      }
    }
    for (const [name, expectedHost] of [['editA', id(200)], ['editB', id(201)], ['readonly', id(202)]]) {
      await t.test(`${name} sees the exact assigned host, not merely one row`, async () => {
        const { rows } = await asUser(db, users[name], 'select host_id from public.training_enrollments');
        assert.deepEqual(rows.map(row => row.host_id), [expectedHost]);
      });
    }
    for (const name of ['superadmin', 'subadmin', 'editA', 'readonly', 'inactive', 'unknown']) {
      await t.test(`${name} topic drafts and archived history`, async () => {
        const { rows } = await asUser(db, users[name], 'select count(*)::integer as n from public.training_topics');
        assert.equal(rows[0].n, ['superadmin', 'subadmin'].includes(name) ? 3 : ['inactive', 'unknown'].includes(name) ? 0 : 2);
      });
      for (const table of ['exam_versions', 'exam_questions', 'events']) {
        await t.test(`${name} administrative read ${table}`, async () => {
          const { rows } = await asUser(db, users[name], `select count(*)::integer as n from public.training_${table}`);
          assert.equal(rows[0].n, ['superadmin', 'subadmin'].includes(name) ? table === 'events' ? 3 : 1 : 0);
        });
      }
      for (const table of ['training_principals', 'training_host_assignments', 'training_exam_keys', 'training_exam_tokens', 'training_exam_answers']) {
        await t.test(`${name} cannot read private ${table}`, async () => {
          await assert.rejects(asUser(db, users[name], `select * from training_private.${table}`), err => err.code === '42501');
        });
      }
      for (const sql of [
        "update public.training_enrollments set recruiter_id=$1",
        "update public.training_evidence set status='approved' where submitted_by=$1",
        "update public.training_exam_attempts set score_percent=100,passed=true where id=$1",
        "delete from public.training_enrollments where recruiter_id=$1",
        "insert into public.training_completions(enrollment_id,item_id,validated_by) values($1,$1,$1)",
      ]) {
        await t.test(`${name} cannot write directly: ${sql.split(' ').slice(0, 3).join(' ')}`, async () => {
          await assert.rejects(asUser(db, users[name], sql, [users[name]]), err => err.code === '42501');
        });
      }
    }
    await t.test('anon cannot read catalog or enrollments', async () => {
      for (const table of ['topics', 'enrollments']) await assert.rejects(asUser(db, null, `select * from public.training_${table}`, [], 'anon'), err => err.code === '42501');
    });
    await t.test('authenticated role without verified identity sees no rows', async () => {
      assert.equal((await asUser(db, null, 'select * from public.training_enrollments')).rows.length, 0);
    });
    await t.test('deactivation denies access immediately despite unchanged auth UID', async () => {
      await db.query('update training_private.training_principals set is_active=false where auth_user_id=$1', [users.editA]);
      assert.equal((await asUser(db, users.editA, 'select * from public.training_enrollments')).rows.length, 0);
      await db.query('update training_private.training_principals set is_active=true where auth_user_id=$1', [users.editA]);
    });
    await t.test('host reassignment revokes old scope and grants new scope immediately', async () => {
      await db.query('update training_private.training_host_assignments set recruiter_id=$1 where host_id=$2', [users.editB, id(200)]);
      assert.equal((await asUser(db, users.editA, 'select * from public.training_enrollments')).rows.length, 0);
      assert.equal((await asUser(db, users.editB, 'select * from public.training_enrollments')).rows.length, 2);
    });
    await t.test('all 23 tables have RLS and no client write privileges', async () => {
      const { rows } = await db.query(`select n.nspname, c.relname, c.relrowsecurity,
        has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as can_write,
        has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where c.relkind='r' and ((n.nspname='public' and c.relname like 'training_%') or n.nspname='training_private')`);
      assert.equal(rows.length, 23);
      for (const row of rows) {
        assert.equal(row.relrowsecurity, true, row.relname);
        assert.equal(row.can_write, false, row.relname);
        assert.equal(row.anon_access, false, row.relname);
      }
    });
    await t.test('session-linked evidence cannot cross enrollments', async () => {
      await assert.rejects(insert(db, 'public.training_evidence', { enrollment_id: id(211), session_id: id(220), topic_id: topic, description: 'INVALID', submitted_by: users.editB }), err => err.code === '23503');
    });
    await t.test('approval must reference exactly one existing subject', async () => {
      await assert.rejects(insert(db, 'public.training_approvals', { requested_by: users.editA }), err => err.code === '23514');
      await assert.rejects(insert(db, 'public.training_approvals', { requested_by: users.editA, topic_id: topic, material_id: material }), err => err.code === '23514');
    });
    await t.test('Final Quiz declaration rejects 49 and 51 questions', async () => {
      for (const count of [49, 51]) await assert.rejects(insert(db, 'public.training_exam_versions', { exam_key: 'INVALID', version: count, question_count: count, pass_percent: 80, created_by: users.superadmin }), err => err.code === '23514');
    });
    await t.test('duplicate open attempt is rejected', async () => {
      await assert.rejects(insert(db, 'public.training_exam_attempts', { assignment_id: id(250), attempt_number: 2 }), err => err.code === '23505');
    });
    await t.test('no answer key or public token hash columns in exposed tables', async () => {
      const { rows } = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name like 'training_%' and column_name in ('correct_option','token_hash','public_token_hash')");
      assert.equal(rows.length, 0);
    });
    await t.test('source SQL remains guarded and unchanged after in-memory execution', async () => {
      assert.equal(await readFile(draftUrl, 'utf8'), original);
    });
  } finally {
    await db.close();
  }
});
