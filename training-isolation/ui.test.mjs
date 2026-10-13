import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService, provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';
import { seedDemoProgram } from './demo-fixtures.mjs';

test('isolated browser UI: recruiter, administration and mobile', async t => {
  const db = await createIsolatedDatabase();
  const service=createTrainingService(db);
  let browser, server;
  const password = 'Browser-test-password-ONLY';
  const pages = [], errors = [], remoteRequests = [];
  try {
    const users = {};
    for (const role of ['superadmin', 'subadmin', 'edit', 'readonly']) users[role] = await provisionSyntheticUser(db, `demo-${role}`, password, role);
    const demo = await seedDemoProgram(db, users.superadmin.app_user_id, users.edit.app_user_id);
    server = createSandboxHttpServer(service);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true,
      ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    if(process.env.UI_SCREENSHOT_DIR)await mkdir(process.env.UI_SCREENSHOT_DIR,{recursive:true});
    async function pageFor(role, viewport = { width: 1440, height: 1050 }) {
      const context = await browser.newContext({ viewport, locale: 'es-CR', timezoneId: 'America/Costa_Rica' });
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', error => errors.push(error.message));
      // Block any off-origin traffic even if a future UI change accidentally adds it.
      await page.route('**/*', route => {
        if (new URL(route.request().url()).origin !== url) {
          remoteRequests.push(route.request().url()); return route.abort();
        }
        return route.continue();
      });
      await page.goto(url);
      await page.locator('#login-form [name="username"]').selectOption(`demo-${role}`);
      await page.locator('#login-form [name="password"]').fill(password);
      await page.locator('#login-form button').click();
      await page.locator('#app-view').waitFor({ state: 'visible' });
      return page;
    }
    let recruiter, administrator;
    await t.test('recruiter signs in and sees DEMO-only 14-day program', async () => {
      recruiter = await pageFor('edit');
      assert.equal(await recruiter.locator('.day').count(), 14);
      assert.match(await recruiter.locator('#workspace-title').textContent(), /Recruiter/);
      assert.equal(await recruiter.locator('#enroll-form').count(), 1);
      for (const tab of ['agenda','evidence','exams']) {
        await recruiter.locator(`[data-open-tab="${tab}"]`).click();
        assert.equal(await recruiter.locator(`#nav [data-tab="${tab}"]`).getAttribute('class'), 'active');
        assert.equal(await recruiter.evaluate(()=>document.activeElement.id), 'workspace-title');
        await recruiter.locator('#nav [data-tab="overview"]').click();
      }
    });
    await t.test('recruiter enrolls and schedules through real sandbox API', async () => {
      await recruiter.locator('#enroll-form button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Emisor inscrito.' }).waitFor();
      await recruiter.locator('[data-tab="agenda"]').click();
      await recruiter.locator('#schedule-form [name="local_date"]').fill('2026-10-25T19:00');
      await recruiter.locator('#schedule-form button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Sesión programada.' }).waitFor();
      const sessions = (await db.query('select scheduled_at from public.training_sessions')).rows;
      assert.equal(sessions.length, 1);
      assert.equal(new Date(sessions[0].scheduled_at).toISOString(), '2026-10-26T01:00:00.000Z');
    });
    await t.test('submitted evidence renders safely and cannot be approved by recruiter', async () => {
      await recruiter.locator('[data-tab="evidence"]').click();
      await recruiter.locator('#evidence-form [name="description"]').fill('DEMO práctica <img src=x onerror="window.compromised=true">');
      await recruiter.locator('#evidence-form button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Práctica enviada' }).waitFor();
      assert.equal(await recruiter.locator('[data-review]').count(), 0);
      assert.equal(await recruiter.locator('.evidence-card img').count(), 0);
      assert.equal(await recruiter.evaluate(() => window.compromised), undefined);
    });
    await t.test('administrator reviews evidence and cannot validate before assessment', async () => {
      administrator = await pageFor('superadmin');
      await administrator.locator('[data-tab="evidence"]').click();
      await administrator.locator('[data-review] [name="notes"]').fill('DEMO práctica revisada');
      await administrator.locator('[data-review] button').click();
      await administrator.locator('#notice').filter({ hasText: 'Revisión registrada' }).waitFor();
      await administrator.locator('#complete-button').click();
      await administrator.locator('#notice.error').filter({ hasText: 'Falta una evaluación' }).waitFor();
      assert.equal((await db.query('select * from public.training_completions')).rows.length, 0);
    });
    await t.test('evaluation unlocks validation and history persists in memory', async () => {
      await administrator.locator('#assessment-form [name="notes"]').fill('DEMO habilidades verificadas');
      await administrator.locator('#assessment-form button[type="submit"]').click();
      await administrator.locator('#notice').filter({ hasText: 'Evaluación registrada' }).waitFor();
      await administrator.locator('#complete-button').click();
      await administrator.locator('#notice').filter({ hasText: 'Práctica validada' }).waitFor();
      assert.equal((await db.query('select * from public.training_completions')).rows.length, 1);
      await administrator.locator('[data-tab="history"]').click();
      assert.match(await administrator.locator('#content').textContent(), /DEMO habilidades verificadas/);
    });
    let catalogueTopic, catalogueMaterial;
    const documentContent = 'DEMO Guía de networking <script>window.materialScript=true</script>';
    await t.test('administrator creates and publishes a topic through the library', async () => {
      await administrator.locator('[data-tab="library"]').click();
      await administrator.locator('#topic-form [name="title"]').fill('DEMO Networking respetuoso');
      await administrator.locator('#topic-form [name="description"]').fill('Prácticas para crecer la red con respeto.');
      await administrator.locator('#topic-form [name="category"]').fill('Networking');
      await administrator.locator('#topic-form button').click();
      await administrator.locator('#notice').filter({ hasText: 'Borrador de tema creado' }).waitFor();
      catalogueTopic = (await db.query("select * from public.training_topics where title='DEMO Networking respetuoso'")).rows[0];
      assert.equal(catalogueTopic.status, 'draft');
      await administrator.locator(`[data-publish-topic="${catalogueTopic.id}"]`).click();
      await administrator.locator('#notice').filter({ hasText: 'Tema publicado' }).waitFor();
    });
    await t.test('administrator creates a downloadable text document and safe preview', async () => {
      await administrator.locator('[data-catalogue-mode="materials"]').click();
      await administrator.locator('#material-form [name="title"]').fill('DEMO Guía de networking');
      await administrator.locator('#material-form [name="topic_id"]').selectOption(catalogueTopic.id);
      await administrator.locator('#material-form [name="content"]').fill(documentContent);
      await administrator.locator('#material-form button').click();
      await administrator.locator('#notice').filter({ hasText: 'Borrador de material creado' }).waitFor();
      catalogueMaterial = (await db.query("select * from public.training_materials where title='DEMO Guía de networking'")).rows[0];
      await administrator.locator(`[data-publish-material="${catalogueMaterial.id}"]`).click();
      await administrator.locator('#notice').filter({ hasText: 'Material publicado' }).waitFor();
      await administrator.locator(`[data-preview-material="${catalogueMaterial.id}"]`).click();
      await administrator.locator('#material-preview').waitFor({ state: 'visible' });
      assert.equal(await administrator.locator('#preview-text').textContent(), documentContent);
      assert.equal(await administrator.evaluate(() => window.materialScript), undefined);
      await administrator.locator('[data-close-preview]').click();
    });
    await t.test('recruiter downloads exact published content without administrative controls', async () => {
      await recruiter.locator('[data-tab="library"]').click();
      await recruiter.locator('#refresh-button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Información actualizada' }).waitFor();
      await recruiter.locator('[data-catalogue-mode="materials"]').click();
      assert.equal(await recruiter.locator('#material-form').count(), 0);
      assert.equal(await recruiter.locator('[data-publish-material]').count(), 0);
      const downloaded = recruiter.waitForEvent('download');
      await recruiter.locator(`[data-download-material="${catalogueMaterial.id}"]`).click();
      const download = await downloaded;
      assert.equal(await readFile(await download.path(), 'utf8'), documentContent);
      assert.match(download.suggestedFilename(), /\.txt$/);
    });
    await t.test('material edit creates a draft revision without changing published content', async () => {
      await administrator.locator(`[data-edit-material="${catalogueMaterial.id}"]`).click();
      await administrator.locator('#material-form [name="content"]').fill('DEMO guía revisada');
      await administrator.locator('#material-form button').click();
      await administrator.locator('#notice').filter({ hasText: 'Borrador de material creado' }).waitFor();
      const revisions = (await db.query('select revision,status from public.training_materials where content_key=$1 order by revision', [catalogueMaterial.content_key])).rows;
      assert.deepEqual(revisions, [{ revision: 1, status: 'published' }, { revision: 2, status: 'draft' }]);
      await administrator.locator('#catalogue-history').check();
      assert.equal(await administrator.locator('.catalogue-card').count(), 2);
    });
    await t.test('HTTPS link form and preview do not automatically fetch external content', async () => {
      await administrator.locator('#material-form [name="title"]').fill('DEMO Enlace externo');
      await administrator.locator('#material-form [name="kind"]').selectOption('link');
      assert.equal(await administrator.locator('#material-text-field').isVisible(), false);
      assert.equal(await administrator.locator('#material-download-field').isVisible(), false);
      await administrator.locator('#material-form [name="external_url"]').fill('https://example.com/training');
      await administrator.locator('#material-form button').click();
      await administrator.locator('#notice').filter({ hasText: 'Borrador de material creado' }).waitFor();
      const link = (await db.query("select id from public.training_materials where title='DEMO Enlace externo'")).rows[0];
      await administrator.locator(`[data-publish-material="${link.id}"]`).click();
      await administrator.locator('#notice').filter({ hasText: 'Material publicado' }).waitFor();
      await administrator.locator(`[data-preview-material="${link.id}"]`).click();
      await administrator.locator('#material-preview').waitFor({ state: 'visible' });
      assert.equal(await administrator.locator('#preview-link-anchor').getAttribute('href'), 'https://example.com/training');
      assert.equal(await administrator.locator('#preview-link-anchor').getAttribute('rel'), 'noopener noreferrer');
      assert.deepEqual(remoteRequests, []);
      await administrator.locator('[data-close-preview]').click();
      await administrator.locator('[data-tab="history"]').click();
      assert.match(await administrator.locator('#content').textContent(), /Publicación de material/);
      assert.match(await administrator.locator('#content').textContent(), /Publicación de tema/);
      await administrator.locator('[data-tab="library"]').click();
    });
    await t.test('administrative catalogue remains usable on mobile', async () => {
      await administrator.setViewportSize({ width: 390, height: 844 });
      assert.equal(await administrator.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.equal(await administrator.locator('#material-form').isVisible(), true);
      await administrator.setViewportSize({ width: 1440, height: 1050 });
    });
    let authoredProgram, authoredEnrollment, generatedSession;
    await t.test('administrator builds and publishes a program with exact material revisions', async () => {
      await administrator.locator('[data-tab="programs"]').click();
      await administrator.locator('#program-form [name="title"]').fill('DEMO Programa para nuevos emisores');
      const first = administrator.locator('.program-item').first();
      await first.locator('[name="item_topic"]').selectOption(catalogueTopic.id);
      await first.locator('[name="item_materials"]').selectOption(catalogueMaterial.id);
      await first.locator('[name="item_notes"]').fill('Primera práctica del programa');
      await administrator.locator('[data-add-program-item]').click();
      await administrator.locator('.program-item').nth(1).locator('[name="item_topic"]').selectOption(catalogueTopic.id);
      await administrator.locator('#program-form button[type="submit"]').click();
      await administrator.locator('#notice').filter({ hasText: 'Programa guardado como borrador' }).waitFor();
      authoredProgram = (await db.query("select * from public.training_program_versions where title='DEMO Programa para nuevos emisores'")).rows[0];
      await administrator.locator(`[data-publish-program="${authoredProgram.id}"]`).click();
      await administrator.locator('#notice').filter({ hasText: 'Programa publicado' }).waitFor();
      assert.equal((await db.query('select * from public.training_program_materials where item_id in (select id from public.training_program_items where program_version_id=$1)', [authoredProgram.id])).rows.length, 1);
    });
    await t.test('new version preserves published program and existing training', async () => {
      await administrator.locator(`[data-edit-program="${authoredProgram.id}"]`).click();
      await administrator.locator('#program-form [name="duration_days"]').fill('21');
      await administrator.locator('#program-form [name="changelog"]').fill('Ampliación opcional a 21 días');
      await administrator.locator('#program-form button[type="submit"]').click();
      await administrator.locator('#notice').filter({ hasText: 'Programa guardado como borrador' }).waitFor();
      const versions = (await db.query('select version,status from public.training_program_versions where program_key=$1 order by version', [authoredProgram.program_key])).rows;
      assert.deepEqual(versions, [{ version: 1, status: 'published' }, { version: 2, status: 'draft' }]);
      assert.equal((await db.query('select program_version_id from public.training_enrollments')).rows[0].program_version_id, demo.program_version_id);
    });
    await t.test('recruiter assigns published program and reviews automatic agenda before saving', async () => {
      const host = randomUUID();
      await db.query('insert into public.hosts(id) values($1)', [host]);
      await db.query('insert into training_private.training_host_assignments(host_id,recruiter_id,assigned_by) values($1,$2,$3)', [host, users.edit.app_user_id, users.superadmin.app_user_id]);
      await recruiter.locator('[data-tab="overview"]').click();
      await recruiter.locator('#refresh-button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Información actualizada' }).waitFor();
      await recruiter.locator('#enroll-form [name="host_id"]').selectOption(host);
      await recruiter.locator('#enroll-form [name="program_version_id"]').selectOption(authoredProgram.id);
      await recruiter.locator('#enroll-form button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Emisor inscrito' }).waitFor();
      authoredEnrollment = (await db.query('select * from public.training_enrollments where host_id=$1', [host])).rows[0];
      await recruiter.locator('[data-tab="agenda"]').click();
      await recruiter.locator('#auto-agenda-form [name="enrollment_id"]').selectOption(authoredEnrollment.id);
      await recruiter.locator('#auto-agenda-form [name="start_date"]').fill('2026-11-02');
      await recruiter.locator('#auto-agenda-form [name="local_time"]').fill('19:00');
      await recruiter.locator('#auto-agenda-form button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Propuesta calculada' }).waitFor();
      assert.equal((await db.query('select * from public.training_sessions where enrollment_id=$1', [authoredEnrollment.id])).rows.length, 0);
      await recruiter.locator('[data-generate-agenda]').click();
      await recruiter.locator('#notice').filter({ hasText: '2 sesiones creadas' }).waitFor();
      const sessions = (await db.query('select * from public.training_sessions where enrollment_id=$1 order by scheduled_at', [authoredEnrollment.id])).rows;
      assert.equal(sessions.length, 2); generatedSession = sessions[0];
      assert.equal(new Date(generatedSession.scheduled_at).toISOString(), '2026-11-03T01:00:00.000Z');
    });
    await t.test('recruiter reschedules and records attendance without duplicating sessions', async () => {
      await recruiter.locator('#reschedule-form [name="session_id"]').selectOption(generatedSession.id);
      await recruiter.locator('#reschedule-form [name="local_date"]').fill('2026-11-04');
      await recruiter.locator('#reschedule-form [name="local_time"]').fill('18:00');
      await recruiter.locator('#reschedule-form [name="reason"]').fill('DEMO ajuste de disponibilidad');
      await recruiter.locator('#reschedule-form button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Sesión reprogramada' }).waitFor();
      await recruiter.locator('#attendance-form [name="session_id"]').selectOption(generatedSession.id);
      await recruiter.locator('#attendance-form button').click();
      await recruiter.locator('#notice').filter({ hasText: 'Asistencia registrada' }).waitFor();
      assert.equal((await db.query('select * from public.training_sessions where enrollment_id=$1', [authoredEnrollment.id])).rows.length, 2);
      const session = (await db.query('select scheduled_at,edited_manually from public.training_sessions where id=$1', [generatedSession.id])).rows[0];
      assert.equal(new Date(session.scheduled_at).toISOString(), '2026-11-05T00:00:00.000Z'); assert.equal(session.edited_manually, true);
      assert.equal((await db.query('select status from public.training_attendance where session_id=$1', [generatedSession.id])).rows[0].status, 'present');
    });
    await t.test('program builder fits mobile and recruiter cannot edit programs', async () => {
      await administrator.locator('[data-tab="programs"]').click();
      await administrator.setViewportSize({ width: 390, height: 844 });
      assert.equal(await administrator.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await administrator.setViewportSize({ width: 1440, height: 1050 });
      await recruiter.locator('[data-tab="programs"]').click();
      assert.equal(await recruiter.locator('#program-form').count(), 0);
      assert.equal(await recruiter.locator('[data-publish-program]').count(), 0);
    });
    let optionalVersion;
    await t.test('completed practical credit and a new published version do not force an update',async()=>{
      const editor=(await service.login({username:'demo-edit',password})).token;
      const administratorToken=(await service.login({username:'demo-superadmin',password})).token;
      const evidence=await service.submitEvidence(editor,{session_id:generatedSession.id,description:'DEMO práctica para conservar'});
      await service.reviewEvidence(administratorToken,{evidence_id:evidence.id,decision:'approved',notes:'DEMO verificada'});
      await service.assess(administratorToken,{session_id:generatedSession.id,score:95,passed:true,notes:'DEMO habilidades validadas'});
      await service.completeItem(administratorToken,{session_id:generatedSession.id});
      const source=(await db.query('select id from public.training_program_versions where program_key=$1 and version=2',[authoredProgram.program_key])).rows[0];
      await administrator.locator('[data-tab="programs"]').click();
      await administrator.locator(`[data-edit-program="${source.id}"]`).click();
      await administrator.locator('#program-form [name="changelog"]').fill('DEMO nueva práctica opcional');
      await administrator.locator('[data-add-program-item]').click();
      await administrator.locator('#program-form button[type="submit"]').click();
      await administrator.locator('#notice').filter({hasText:'Programa guardado como borrador'}).waitFor();
      optionalVersion=(await db.query('select * from public.training_program_versions where program_key=$1 and version=3',[authoredProgram.program_key])).rows[0];
      await administrator.locator(`[data-publish-program="${optionalVersion.id}"]`).click();
      await administrator.locator('#notice').filter({hasText:'Programa publicado'}).waitFor();
      assert.equal((await db.query('select program_version_id from public.training_enrollments where id=$1',[authoredEnrollment.id])).rows[0].program_version_id,authoredProgram.id);
    });
    await t.test('recruiter can review and decline the optional update without changing training',async()=>{
      await recruiter.locator('[data-tab="updates"]').click();
      await recruiter.locator('#refresh-button').click();
      await recruiter.locator('#notice').filter({hasText:'Información actualizada'}).waitFor();
      await recruiter.locator('#update-preview-form [name="enrollment_id"]').selectOption(authoredEnrollment.id);
      await recruiter.locator('#update-preview-form [name="to_version_id"]').selectOption(optionalVersion.id);
      await recruiter.locator('#update-preview-form button').click();
      await recruiter.locator('#notice').filter({hasText:'Comparación preparada'}).waitFor();
      assert.equal(await recruiter.locator('.update-comparison .stat strong').first().textContent(),'1');
      if(process.env.UI_SCREENSHOT_DIR)await recruiter.screenshot({path:`${process.env.UI_SCREENSHOT_DIR}/training-updates.png`,fullPage:true});
      await recruiter.locator('[data-decline-program-update]').click();
      await recruiter.locator('#notice').filter({hasText:'Se mantiene la versión actual'}).waitFor();
      assert.equal((await db.query('select * from public.training_update_history')).rows.length,0);
    });
    await t.test('acceptance preserves sessions and validations and agenda proposes only new work',async()=>{
      const original=(await db.query('select * from public.training_sessions where enrollment_id=$1 order by id',[authoredEnrollment.id])).rows;
      await recruiter.locator('#update-preview-form button').click();
      await recruiter.locator('#notice').filter({hasText:'Comparación preparada'}).waitFor();
      await recruiter.locator('[data-accept-program-update]').click();
      await recruiter.locator('#notice').filter({hasText:'Actualización aceptada'}).waitFor();
      assert.equal((await db.query('select program_version_id from public.training_enrollments where id=$1',[authoredEnrollment.id])).rows[0].program_version_id,optionalVersion.id);
      assert.deepEqual((await db.query('select * from public.training_sessions where enrollment_id=$1 order by id',[authoredEnrollment.id])).rows,original);
      await recruiter.locator('[data-tab="agenda"]').click();
      await recruiter.locator('#auto-agenda-form [name="enrollment_id"]').selectOption(authoredEnrollment.id);
      await recruiter.locator('#auto-agenda-form [name="start_date"]').fill('2026-11-02');
      await recruiter.locator('#auto-agenda-form button').click();
      await recruiter.locator('#notice').filter({hasText:'Propuesta calculada'}).waitFor();
      assert.match(await recruiter.locator('#agenda-proposal').textContent(),/1 sesiones nuevas/);
      assert.equal((await db.query('select * from public.training_update_history')).rows.length,1);
    });
    await t.test('mobile layout fits viewport and exposes readonly data without actions', async () => {
      await db.query('update training_private.training_host_assignments set recruiter_id=$1 where host_id=$2', [users.readonly.app_user_id, demo.host_id]);
      const mobile = await pageFor('readonly', { width: 390, height: 844 });
      assert.equal(await mobile.locator('#enroll-form').count(), 0);
      assert.equal(await mobile.locator('.readonly-note').count(), 1);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await mobile.locator('[data-tab="evidence"]').click();
      assert.equal(await mobile.locator('#evidence-form').count(), 0);
      assert.equal(await mobile.locator('#assessment-form').count(), 0);
      assert.equal(await mobile.locator('.evidence-card').count(), 1);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    });
    await t.test('readonly can consult update history on mobile without accepting changes',async()=>{
      await db.query('update training_private.training_host_assignments set recruiter_id=$1 where host_id=$2',[users.readonly.app_user_id,authoredEnrollment.host_id]);
      const mobile=pages[2];
      await mobile.locator('[data-tab="updates"]').click();
      await mobile.locator('#refresh-button').click();
      await mobile.locator('#notice').filter({hasText:'Información actualizada'}).waitFor();
      assert.equal(await mobile.locator('#update-preview-form').count(),0);
      assert.equal(await mobile.locator('[data-accept-program-update]').count(),0);
      assert.match(await mobile.locator('#content').textContent(),/v1 → v3/);
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    });
    await t.test('logout clears screen and tokens stay out of browser storage', async () => {
      assert.equal(await recruiter.evaluate(() => localStorage.length + sessionStorage.length), 0);
      await recruiter.locator('#logout-button').click();
      await recruiter.locator('#login-view').waitFor({ state: 'visible' });
      assert.equal(await recruiter.locator('#app-view').isVisible(), false);
    });
    await t.test('no JavaScript errors or external requests', async () => {
      assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, []);
    });
    // Optional local QA screenshots; no credentials or login fields in captures.
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await administrator.locator('#refresh-button').click();
      await administrator.locator('#notice').filter({ hasText: 'Información actualizada' }).waitFor();
      await administrator.locator('[data-tab="overview"]').click();
      await administrator.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/training-desktop.png`, fullPage: true });
      await administrator.locator('[data-tab="library"]').click();
      await administrator.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/training-library.png`, fullPage: true });
      await administrator.locator('[data-tab="programs"]').click();
      await administrator.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/training-programs.png`, fullPage: true });
      await administrator.locator('[data-tab="agenda"]').click();
      await administrator.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/training-agenda.png`, fullPage: true });
      const mobile = pages[2];
      await mobile.locator('[data-tab="overview"]').click();
      await mobile.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/training-mobile.png`, fullPage: true });
    }
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    await db.close();
  }
});
