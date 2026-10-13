import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createIsolatedDatabase } from './database.mjs';
import { createTrainingService, provisionSyntheticUser } from './service.mjs';
import { createSandboxHttpServer } from './server.mjs';
import { seedDemoProgram } from './demo-fixtures.mjs';

test('isolated browser UI: recruiter, administration and mobile', async t => {
  const db = await createIsolatedDatabase();
  let browser, server;
  const password = 'Browser-test-password-ONLY';
  const pages = [], errors = [], remoteRequests = [];
  try {
    const users = {};
    for (const role of ['superadmin', 'subadmin', 'edit', 'readonly']) users[role] = await provisionSyntheticUser(db, `demo-${role}`, password, role);
    const demo = await seedDemoProgram(db, users.superadmin.app_user_id, users.edit.app_user_id);
    server = createSandboxHttpServer(createTrainingService(db));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true,
      ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    async function pageFor(role, viewport = { width: 1440, height: 1050 }) {
      const context = await browser.newContext({ viewport, timezoneId: 'America/Costa_Rica' });
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
      await administrator.locator('[data-tab="overview"]').click();
      await administrator.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/training-desktop.png`, fullPage: true });
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
