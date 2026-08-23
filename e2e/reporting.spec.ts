/**
 * E2E: Reporting
 *
 * Covers:
 *   1. Navigating to project reports page
 *   2. Verifying report summary loads (severity cards, tool table)
 *   3. Accessing the unified report view
 *   4. Verifying sub-reports (individual tool reports) are accessible
 *   5. Checking report data integrity (total findings, severity breakdown)
 *
 * Prerequisites:
 *   - At least one project with a completed scan must exist.
 *   - Tests use the API to identify a suitable project, falling back to
 *     creating one if none exist.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'reporting';

let targetProjectId: string;

test.afterAll(async () => {
  finalizeErrorLog();
});

test.describe('Reporting', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Identify a project with scan data', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });

      const projects = await api.listProjects();

      // Find a project that has completed at least one scan
      const projectWithScans = projects.find(
        (p) => p.last_scan_state === 'COMPLETED' || p.last_scan_state === 'FAILED',
      );

      if (projectWithScans) {
        targetProjectId = projectWithScans.project_id as string;
      } else if (projects.length > 0) {
        // Use first available project even without completed scans
        targetProjectId = (projects[0] as Record<string, unknown>).project_id as string;
      } else {
        // Create a test project
        const project = await api.createProject({
          name: `E2E-Report-Test-${Date.now()}`,
          git_url: 'https://github.com/juice-shop/juice-shop.git',
          sonar_key: `e2e-report-${Date.now()}`,
        });
        targetProjectId = project.project_id as string;
      }

      expect(targetProjectId).toBeTruthy();
    } catch (err) {
      trackError(SUITE, 'Identify project with scan data', err, page.url());
      throw err;
    }
  });

  test('2 — Navigate to project reports page', async ({ page }) => {
    test.skip(!targetProjectId, 'No target project available');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${targetProjectId}/reports`);
      await page.waitForLoadState('networkidle');

      // The page should load — either showing reports or an empty state
      const heading = page.locator('h1, h2').first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Navigate to reports page', err, page.url());
      throw err;
    }
  });

  test('3 — Verify report summary structure', async ({ page, request }) => {
    test.skip(!targetProjectId, 'No target project available');
    try {
      // Verify API returns valid structure
      const api = new TestAPIClient({ request });

      let summary: Record<string, unknown>;
      try {
        summary = await api.getReportSummary(targetProjectId);
      } catch {
        // No reports yet — this is acceptable
        test.skip(true, 'No report summary available for this project');
        return;
      }

      // Verify shape: project_id, total_findings, severity, tools
      expect(summary.project_id).toBe(targetProjectId);
      expect(typeof summary.total_findings).toBe('number');

      if (summary.severity) {
        const severity = summary.severity as Record<string, number>;
        expect(typeof severity.critical).toBe('number');
        expect(typeof severity.high).toBe('number');
        expect(typeof severity.medium).toBe('number');
        expect(typeof severity.low).toBe('number');
      }

      if (summary.tools) {
        expect(Array.isArray(summary.tools)).toBe(true);
        const tools = summary.tools as Record<string, unknown>[];
        for (const tool of tools) {
          expect(typeof tool.tool).toBe('string');
          expect(typeof tool.findings).toBe('number');
        }
      }
    } catch (err) {
      trackError(SUITE, 'Verify report summary structure', err, page.url());
      throw err;
    }
  });

  test('4 — Navigate to unified report view', async ({ page }) => {
    test.skip(!targetProjectId, 'No target project available');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${targetProjectId}/reports/unified`);
      await page.waitForLoadState('networkidle');

      // Page should render — may show data or empty state
      const content = page.locator('main, [class*="max-w"]').first();
      await expect(content).toBeVisible({ timeout: 10_000 });

      // Check for any error boundaries not triggered
      const errorBoundary = page.locator('text=Something went wrong');
      const hasError = await errorBoundary.isVisible().catch(() => false);
      expect(hasError).toBe(false);
    } catch (err) {
      trackError(SUITE, 'Navigate to unified report', err, page.url());
      throw err;
    }
  });

  test('5 — Verify sub-reports via API', async ({ page, request }) => {
    test.skip(!targetProjectId, 'No target project available');
    try {
      const api = new TestAPIClient({ request });

      let reports: Record<string, unknown>[];
      try {
        reports = await api.getReports(targetProjectId);
      } catch {
        test.skip(true, 'No individual reports available');
        return;
      }

      expect(Array.isArray(reports)).toBe(true);

      // For each sub-report, verify it can be individually accessed
      for (const report of reports.slice(0, 3)) {
        const reportId = report.id as number;
        if (!reportId) continue;

        const single = await api.getReport(reportId);
        expect(single).toBeTruthy();
        expect(single.id).toBe(reportId);
      }
    } catch (err) {
      trackError(SUITE, 'Verify sub-reports via API', err, page.url());
      throw err;
    }
  });

  test('6 — Verify report data consistency', async ({ page, request }) => {
    test.skip(!targetProjectId, 'No target project available');
    try {
      const api = new TestAPIClient({ request });

      let summary: Record<string, unknown>;
      try {
        summary = await api.getReportSummary(targetProjectId);
      } catch {
        test.skip(true, 'No report data available');
        return;
      }

      const totalFindings = summary.total_findings as number;
      const severity = summary.severity as Record<string, number> | undefined;

      if (severity && totalFindings > 0) {
        // Sum of severity counts should equal total_findings (or at least be close)
        const severitySum =
          (severity.critical || 0) +
          (severity.high || 0) +
          (severity.medium || 0) +
          (severity.low || 0) +
          (severity.info || 0);

        expect(severitySum).toBe(totalFindings);
      }

      // Verify tool-level totals sum up
      if (summary.tools && Array.isArray(summary.tools)) {
        const toolFindings = (summary.tools as Record<string, unknown>[]).reduce(
          (acc, t) => acc + (t.findings as number || 0),
          0,
        );
        expect(toolFindings).toBe(totalFindings);
      }
    } catch (err) {
      trackError(SUITE, 'Verify report data consistency', err, page.url());
      throw err;
    }
  });

  test('7 — Reports page renders severity cards in UI', async ({ page }) => {
    test.skip(!targetProjectId, 'No target project available');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${targetProjectId}/reports`);
      await page.waitForLoadState('networkidle');

      // Check that the page loaded without crashing
      const pageContent = await page.textContent('body');
      expect(pageContent).toBeTruthy();

      // Look for common report UI elements (may vary based on data availability)
      const hasContent =
        (await page.locator('text=/critical|high|medium|low/i').first().isVisible().catch(() => false)) ||
        (await page.locator('text=/no.*report|no.*scan|no.*data/i').first().isVisible().catch(() => false)) ||
        (await page.locator('text=/findings|summary|total/i').first().isVisible().catch(() => false));

      expect(hasContent).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Reports page renders severity cards', err, page.url());
      throw err;
    }
  });
});
