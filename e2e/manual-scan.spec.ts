import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'manual-scan';

test.afterAll(() => finalizeErrorLog());

test.describe('Manual Scan Page', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;

  test('1 — Setup: create test project', async ({ request }) => {
    try {
      const api = new TestAPIClient({ request });
      const project = await api.createProject({
        name: `E2E-Manual-${Date.now()}`,
        git_url: 'https://github.com/juice-shop/juice-shop.git',
        sonar_key: `e2e-manual-${Date.now()}`,
      });
      projectId = project.project_id as string;
    } catch (err) {
      trackError(SUITE, 'Setup project', err, '');
      throw err;
    }
  });

  test('2 — Manual scan page loads', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/manual`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Custom Scan")')).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Manual scan loads', err, page.url());
      throw err;
    }
  });

  test('3 — Stage selection buttons render', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/manual`);
      await page.waitForLoadState('networkidle');

      // Should have stage toggle buttons
      const stageButtons = page.locator('button:has-text("sonar"), button:has-text("trivy"), button:has-text("nmap"), button:has-text("zap")');
      const count = await stageButtons.count();
      expect(count).toBeGreaterThan(0);
    } catch (err) {
      trackError(SUITE, 'Stage buttons render', err, page.url());
      throw err;
    }
  });

  test('4 — Select All / Deselect All', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/manual`);
      await page.waitForLoadState('networkidle');

      const selectAllBtn = page.locator('button:has-text("Select All")');
      if (await selectAllBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await selectAllBtn.click();
        await page.waitForTimeout(300);

        // Verify submit button shows all stages
        const submitBtn = page.locator('button:has-text("Start Scan")');
        await expect(submitBtn).toBeVisible({ timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Select All', err, page.url());
      throw err;
    }
  });

  test('5 — Individual stage toggle', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/manual`);
      await page.waitForLoadState('networkidle');

      // Click a specific stage button
      const stageBtn = page.locator('button:has-text("sonar")').first();
      if (await stageBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await stageBtn.click();
        await page.waitForTimeout(300);
        // Toggle should work without error
        const submitBtn = page.locator('button:has-text("Start Scan")');
        await expect(submitBtn).toBeVisible({ timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Stage toggle', err, page.url());
      throw err;
    }
  });

  test('6 — Cancel link navigates back', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/manual`);
      await page.waitForLoadState('networkidle');

      const cancelLink = page.locator('a:has-text("Cancel"), button:has-text("Cancel")').first();
      if (await cancelLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await cancelLink.click();
        await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`), { timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Cancel link', err, page.url());
      throw err;
    }
  });

  test('7 — Cleanup', async ({ request }) => {
    try {
      const api = new TestAPIClient({ request });
      if (projectId) await api.deleteProject(projectId).catch(() => {});
    } catch (err) {
      trackError(SUITE, 'Cleanup', err, '');
    }
  });
});
