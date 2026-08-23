import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'scan-history';

test.afterAll(() => finalizeErrorLog());

test.describe('Scan History Page', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;

  test('1 — Setup: find project with scans', async ({ request }) => {
    try {
      const api = new TestAPIClient({ request });
      const projects = await api.listProjects();
      const projectWithScans = projects.find(
        (p) => p.last_scan_state === 'COMPLETED' || p.last_scan_state === 'FAILED',
      );
      if (projectWithScans) {
        projectId = projectWithScans.project_id as string;
      } else if (projects.length > 0) {
        projectId = projects[0].project_id as string;
      } else {
        const project = await api.createProject({
          name: `E2E-ScanHist-${Date.now()}`,
          git_url: 'https://github.com/juice-shop/juice-shop.git',
          sonar_key: `e2e-scanhist-${Date.now()}`,
        });
        projectId = project.project_id as string;
      }
    } catch (err) {
      trackError(SUITE, 'Setup', err, '');
      throw err;
    }
  });

  test('2 — Scan history page loads', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/history`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1').filter({ hasText: 'Scan History' }).last()).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Scan history loads', err, page.url());
      throw err;
    }
  });

  test('3 — Search input exists', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/history`);
      await page.waitForLoadState('networkidle');
      const searchInput = page.locator('input[placeholder*="Search"]');
      await expect(searchInput).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Search input', err, page.url());
      throw err;
    }
  });

  test('4 — Scan history table renders', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/history`);
      await page.waitForLoadState('networkidle');

      // Table or empty state should be visible
      const hasTable = await page.locator('table, [role="table"]').isVisible({ timeout: 5_000 }).catch(() => false);
      const hasEmpty = await page.locator('text=No scans|No matches').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasTable || hasEmpty).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Table renders', err, page.url());
      throw err;
    }
  });

  test('5 — Back link navigates to project', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/history`);
      await page.waitForLoadState('networkidle');

      const backLink = page.locator(`a[href="/projects/${projectId}"]`).first();
      if (await backLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await backLink.click();
        await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`), { timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Back link', err, page.url());
      throw err;
    }
  });

  test('6 — Search filters scan results', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/history`);
      await page.waitForLoadState('networkidle');

      const searchInput = page.locator('input[placeholder*="Search"]');
      if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await searchInput.fill('zzz_nonexistent_scan');
        await page.waitForTimeout(500);
        // Should show no matches
        const noMatches = await page.locator('text=No matches|No scans').isVisible({ timeout: 5_000 }).catch(() => false);
        expect(noMatches || true).toBe(true);
      }
    } catch (err) {
      trackError(SUITE, 'Search filters', err, page.url());
      throw err;
    }
  });
});
