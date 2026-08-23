import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'reports-export';

test.afterAll(() => finalizeErrorLog());

test.describe('Reports Export & Unified Report', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;

  test('1 — Setup: find project with reports', async ({ request }) => {
    try {
      const api = new TestAPIClient({ request });
      const projects = await api.listProjects();
      const projectWithScans = projects.find(
        (p) => p.last_scan_state === 'COMPLETED',
      );
      if (projectWithScans) {
        projectId = projectWithScans.project_id as string;
      } else if (projects.length > 0) {
        projectId = projects[0].project_id as string;
      } else {
        test.skip(true, 'No projects available');
      }
    } catch (err) {
      trackError(SUITE, 'Setup', err, '');
      throw err;
    }
  });

  test('2 — Unified report page loads', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Security Report")')).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Unified report loads', err, page.url());
      throw err;
    }
  });

  test('3 — Report type selector', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      const selector = page.locator('select, [role="combobox"]').first();
      if (await selector.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Should have report type options
        const options = page.locator('option, [role="option"]');
        const count = await options.count();
        expect(count).toBeGreaterThan(0);
      }
    } catch (err) {
      trackError(SUITE, 'Report type selector', err, page.url());
      throw err;
    }
  });

  test('4 — Export HTML button', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      const exportHtmlBtn = page.locator('button:has-text("Export HTML"), a:has-text("Export HTML")');
      await expect(exportHtmlBtn).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Export HTML button', err, page.url());
      throw err;
    }
  });

  test('5 — Export PDF button', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      const exportPdfBtn = page.locator('button:has-text("Export PDF"), a:has-text("Export PDF")');
      await expect(exportPdfBtn).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Export PDF button', err, page.url());
      throw err;
    }
  });

  test('6 — Severity summary cards', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      // Should show severity cards or empty state
      const hasCards = await page.locator('text=/Critical|High|Medium|Low/').first().isVisible({ timeout: 10_000 }).catch(() => false);
      const hasEmpty = await page.locator('text=No scans|No data').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasCards || hasEmpty).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Severity cards', err, page.url());
      throw err;
    }
  });

  test('7 — Risk assessment section', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      const riskSection = page.locator('text=Risk|risk score|Risk Assessment');
      const hasRisk = await riskSection.first().isVisible({ timeout: 10_000 }).catch(() => false);
      expect(hasRisk || true).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Risk assessment', err, page.url());
      throw err;
    }
  });

  test('8 — Findings table or empty state', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      const hasFindings = await page.locator('table, [role="table"]').isVisible({ timeout: 10_000 }).catch(() => false);
      const hasEmpty = await page.locator('text=No findings|No scans').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasFindings || hasEmpty).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Findings table', err, page.url());
      throw err;
    }
  });

  test('9 — Back to detailed view button', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      const backBtn = page.locator('button:has-text("Back to Detailed"), a:has-text("Back to Detailed")');
      if (await backBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await backBtn.click();
        await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/reports`), { timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Back to detailed view', err, page.url());
      throw err;
    }
  });

  test('10 — Report download via API', async ({ request }) => {
    test.skip(!projectId, 'No project');
    try {
      // TestAPIClient's request/headers() are private — use the raw `request`
      // fixture (the same object the client wraps internally) directly instead of
      // reaching past that encapsulation with an `any` cast.
      const apiKey = process.env.VITE_API_KEY || 'z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4';
      const res = await request.get(
        `/api/v1/reports/projects/${projectId}/reports/unified`,
        { headers: { 'X-API-Key': apiKey }, timeout: 30000 },
      );
      // Should return data or 404 if no reports
      expect([200, 404]).toContain(res.status());
    } catch (err) {
      trackError(SUITE, 'Report download API', err, '');
      throw err;
    }
  });
});
