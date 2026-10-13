import assert from 'node:assert/strict';
import test from 'node:test';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService, provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';

test('isolated catalogue: publication, revisions and material access', async t => {
  const db = await createIsolatedDatabase(), service = createTrainingService(db);
  const server = createSandboxHttpServer(service);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`, tokens = {}, principals = {};
  let topic, revisedTopic, material, revisedMaterial, link, locked;
  async function call(path, body, role) {
    const response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      'content-type': 'application/json', ...(tokens[role] ? { authorization: `Bearer ${tokens[role]}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  }
  const topicBody = { title: 'DEMO Networking', description: 'Prácticas respetuosas', category: 'Networking', estimated_minutes: 30 };
  const materialBody = () => ({ topic_id: topic.id, title: 'DEMO Guía práctica', kind: 'document', content: 'Contenido original <script>no ejecutable</script>', allow_preview: true, allow_download: true });
  try {
    for (const role of ['superadmin', 'subadmin', 'edit', 'readonly']) {
      principals[role] = await provisionSyntheticUser(db, role, 'Catalogue-test-password-ONLY', role);
      const result = await call('/api/login', { username: role, password: 'Catalogue-test-password-ONLY' });
      tokens[role] = result.body.token;
    }
    await t.test('no session, recruiter and readonly cannot create topics', async () => {
      assert.equal((await call('/api/topics', topicBody)).status, 401);
      for (const role of ['edit', 'readonly']) assert.equal((await call('/api/topics', topicBody, role)).status, 403);
    });
    await t.test('superadmin creates a draft with authoritative author', async () => {
      const result = await call('/api/topics', topicBody, 'superadmin');
      assert.equal(result.status, 200); topic = result.body;
      assert.equal(topic.status, 'draft'); assert.equal(topic.revision, 1);
      assert.equal(topic.created_by, principals.superadmin.app_user_id);
    });
    await t.test('drafts are hidden from recruiter and readonly', async () => {
      for (const role of ['edit', 'readonly']) assert.equal((await call('/api/workspace', undefined, role)).body.topics.length, 0);
    });
    await t.test('forged publication, author and invalid duration cannot be saved', async () => {
      for (const extra of [{ status: 'published' }, { created_by: principals.edit.app_user_id }]) assert.equal((await call('/api/topics', { ...topicBody, ...extra }, 'subadmin')).status, 400);
      assert.equal((await call('/api/topics', { ...topicBody, estimated_minutes: 0 }, 'subadmin')).status, 400);
    });
    await t.test('subadmin can create a text material; content is private', async () => {
      const result = await call('/api/materials', materialBody(), 'subadmin');
      assert.equal(result.status, 200); material = result.body;
      assert.equal(material.status, 'draft');
      assert.equal((await call('/api/workspace', undefined, 'subadmin')).body.materials.length, 1);
      assert.ok(!JSON.stringify((await call('/api/workspace', undefined, 'subadmin')).body).includes('Contenido original'));
      assert.equal((await call('/api/materials/preview', { id: material.id }, 'edit')).status, 404);
      assert.equal((await call('/api/materials/download', { id: material.id }, 'readonly')).status, 404);
    });
    await t.test('material cannot publish before its exact topic revision', async () => {
      assert.equal((await call('/api/materials/publish', { id: material.id }, 'subadmin')).status, 409);
      assert.equal((await call('/api/topics/publish', { id: topic.id }, 'subadmin')).status, 200);
      assert.equal((await call('/api/materials/publish', { id: material.id }, 'subadmin')).status, 200);
    });
    await t.test('both administrative roles can publish, recruiter cannot', async () => {
      assert.equal((await call('/api/topics/publish', { id: topic.id }, 'edit')).status, 403);
      const result = await call('/api/topics/publish', { id: topic.id }, 'superadmin');
      assert.equal(result.status, 200); assert.equal(result.body.already_published, true);
      assert.equal((await db.query("select * from public.training_events where event_type='topic_published'")).rows.length, 1);
    });
    await t.test('published text previews and downloads work for readonly', async () => {
      assert.equal((await call('/api/materials/preview', { id: material.id }, 'readonly')).body.content, materialBody().content);
      const result = await call('/api/materials/download', { id: material.id }, 'readonly');
      assert.equal(result.status, 200); assert.match(result.body.filename, /\.txt$/);
      assert.equal(result.body.content, materialBody().content);
    });
    await t.test('editing a published topic creates a new draft and preserves version one', async () => {
      revisedTopic = (await call('/api/topics', { ...topicBody, source_id: topic.id, title: 'DEMO Networking actualizado' }, 'superadmin')).body;
      assert.equal(revisedTopic.revision, 2); assert.equal(revisedTopic.content_key, topic.content_key);
      assert.equal(revisedTopic.status, 'draft');
      const rows = (await db.query('select title,status from public.training_topics where id=$1', [topic.id])).rows;
      assert.equal(rows[0].title, topicBody.title); assert.equal(rows[0].status, 'published');
    });
    await t.test('editing stale revisions fails instead of silently branching or overwriting', async () => {
      assert.equal((await call('/api/topics', { ...topicBody, source_id: topic.id }, 'subadmin')).status, 409);
      assert.equal((await db.query('select * from public.training_topics')).rows.length, 2);
    });
    await t.test('material revision keeps its predecessor downloadable', async () => {
      const result = await call('/api/materials', { ...materialBody(), source_id: material.id, content: 'Segunda revisión', topic_id: revisedTopic.id }, 'superadmin');
      assert.equal(result.status, 200); revisedMaterial = result.body;
      assert.equal(revisedMaterial.revision, 2);
      assert.equal((await call('/api/materials/download', { id: material.id }, 'edit')).body.content, materialBody().content);
      assert.equal((await call('/api/materials/preview', { id: revisedMaterial.id }, 'edit')).status, 404);
      assert.equal((await call('/api/materials/publish', { id: revisedMaterial.id }, 'superadmin')).status, 409);
      assert.equal((await call('/api/topics/publish', { id: revisedTopic.id }, 'superadmin')).status, 200);
      assert.equal((await call('/api/materials/publish', { id: revisedMaterial.id }, 'superadmin')).status, 200);
    });
    await t.test('published revisions retain independent content and audit authors', async () => {
      assert.equal((await call('/api/materials/download', { id: material.id }, 'edit')).body.content, materialBody().content);
      assert.equal((await call('/api/materials/download', { id: revisedMaterial.id }, 'edit')).body.content, 'Segunda revisión');
      const events = (await db.query("select actor_app_user_id from public.training_events where event_type='material_published' order by created_at")).rows;
      assert.deepEqual(events.map(e => e.actor_app_user_id), [principals.subadmin.app_user_id, principals.superadmin.app_user_id]);
    });
    await t.test('disabled preview and download are enforced by server', async () => {
      locked = (await call('/api/materials', { ...materialBody(), allow_preview: false, allow_download: false }, 'superadmin')).body;
      await call('/api/materials/publish', { id: locked.id }, 'superadmin');
      for (const role of ['edit', 'readonly', 'superadmin']) {
        assert.equal((await call('/api/materials/preview', { id: locked.id }, role)).status, 403);
        assert.equal((await call('/api/materials/download', { id: locked.id }, role)).status, 403);
      }
    });
    await t.test('only admins can retrieve source content for editing', async () => {
      assert.equal((await call('/api/materials/edit-data', { id: locked.id }, 'edit')).status, 403);
      assert.equal((await call('/api/materials/edit-data', { id: locked.id }, 'superadmin')).body.content, materialBody().content);
    });
    await t.test('safe HTTPS links require explicit preview and are never downloaded', async () => {
      link = (await call('/api/materials', { topic_id: topic.id, title: 'DEMO enlace', kind: 'link', external_url: 'https://example.com/training', allow_preview: true, allow_download: false }, 'subadmin')).body;
      await call('/api/materials/publish', { id: link.id }, 'subadmin');
      const metadata = (await call('/api/workspace', undefined, 'edit')).body.materials.find(m => m.id === link.id);
      assert.equal(metadata.external_url, null);
      const result = await call('/api/materials/preview', { id: link.id }, 'edit');
      assert.equal(result.body.type, 'link'); assert.equal(result.body.url, 'https://example.com/training');
      assert.equal((await call('/api/materials/download', { id: link.id }, 'edit')).status, 403);
    });
    await t.test('unsafe URLs, unsupported uploads and forged material fields fail', async () => {
      for (const external_url of ['javascript:alert(1)', 'http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://user:password@example.com', 'https://example.com:8443']) {
        assert.equal((await call('/api/materials', { topic_id: topic.id, title: 'INVALID', kind: 'link', external_url, allow_preview: true, allow_download: false }, 'superadmin')).status, 400);
      }
      assert.equal((await call('/api/materials', { ...materialBody(), kind: 'video' }, 'superadmin')).status, 400);
      assert.equal((await call('/api/materials', { ...materialBody(), status: 'published' }, 'superadmin')).status, 400);
      assert.equal((await call('/api/materials', { ...materialBody(), content: 'x'.repeat(20001) }, 'superadmin')).status, 400);
    });
    await t.test('direct private content access is denied for authenticated users', async () => {
      await db.exec('begin; set local role authenticated');
      try { await assert.rejects(db.query('select * from training_private.local_material_content'), error => error.code === '42501'); }
      finally { await db.exec('rollback'); }
    });
    await t.test('revoked session cannot download previously accessible content', async () => {
      await call('/api/logout', {}, 'edit');
      assert.equal((await call('/api/materials/download', { id: material.id }, 'edit')).status, 401);
    });
    await t.test('duplicate publication requests produce only one publication event', async () => {
      const draft = (await call('/api/topics', { ...topicBody, title: 'DEMO publication race' }, 'superadmin')).body;
      const results = await Promise.all([call('/api/topics/publish', { id: draft.id }, 'superadmin'), call('/api/topics/publish', { id: draft.id }, 'subadmin')]);
      assert.ok(results.every(result => result.status === 200));
      assert.equal((await db.query("select * from public.training_events where event_type='topic_published' and entity_id=$1", [draft.id])).rows.length, 1);
    });
  } finally {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await db.close();
  }
});
