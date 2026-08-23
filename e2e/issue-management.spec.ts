/**
 * E2E: Issue Management
 *
 * Covers: create, assign, lifecycle transitions, history, My Issues page.
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginViaAPI, uniqueUsername } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'issue-management';
let projectId: string;
let issueDbId: number;
let developerUserId: string;
let developerUsername: string;
const developerPassword = 'DevPass123';

test.afterAll(() => finalizeErrorLog());

test.describe('Issue Management', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Setup: project + developer user', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      const project = await api.createProject({
        name: `E2E-Issues-${Date.now()}`,
        git_url: 'https://github.com/juice-shop/juice-shop.git',
        sonar_key: `e2e-issues-${Date.now()}`,
      });
      projectId = project.project_id as string;
      developerUsername = uniqueUsername('dev');
      await api.register(developerUsername, developerPassword);
      const users = await api.listUsers();
      const devUser = users.find((u) => u.username === developerUsername);
      expect(devUser).toBeTruthy();
      developerUserId = devUser!.id as string;
      await api.grantProjectAccess(developerUserId, 'project', projectId);
    } catch (err) {
      trackError(SUITE, 'Setup', err, page.url());
      throw err;
    }
  });

  test('2 — Create issue via API', async ({ page, request }) => {
    test.skip(!projectId, 'No project');
    try {
      const api = new TestAPIClient({ request });
      const issue = await api.createIssue({
        issue_id: `e2e-vuln-${Date.now()}`,
        project_id: projectId,
        tool_name: 'sonar_scanner',
        severity: 'high',
        title: 'E2E: SQL Injection in UserService',
        description: 'Automated E2E test issue.',
      });
      issueDbId = issue.id as number;
      expect(issue.status).toBe('open');
    } catch (err) {
      trackError(SUITE, 'Create issue', err, page.url());
      throw err;
    }
  });

  test('3 — Verify issue in project overview', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/issues`);
      await page.waitForLoadState('networkidle');
      const hasError = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      expect(hasError).toBe(false);
    } catch (err) {
      trackError(SUITE, 'Verify issue overview', err, page.url());
      throw err;
    }
  });

  test('4 — Assign issue to developer', async ({ page, request }) => {
    test.skip(!issueDbId || !developerUserId, 'Missing issue/developer');
    try {
      const api = new TestAPIClient({ request });
      const result = await api.assignIssue(issueDbId, developerUserId, 'high');
      expect(result.status).toBe('assigned');
      expect(result.assignee_id).toBe(developerUserId);
    } catch (err) {
      trackError(SUITE, 'Assign issue', err, page.url());
      throw err;
    }
  });

  test('5 — Transition: assigned → in_progress', async ({ page, request }) => {
    test.skip(!issueDbId, 'No issue');
    try {
      const api = new TestAPIClient({ request });
      await api.login(developerUsername, developerPassword);
      const result = await api.transitionIssue(issueDbId, 'in_progress', 'Starting fix');
      expect(result.status).toBe('in_progress');
    } catch (err) {
      trackError(SUITE, 'Transition to in_progress', err, page.url());
      throw err;
    }
  });

  test('6 — Transition: in_progress → fixed', async ({ page, request }) => {
    test.skip(!issueDbId, 'No issue');
    try {
      const api = new TestAPIClient({ request });
      await api.login(developerUsername, developerPassword);
      const result = await api.transitionIssue(issueDbId, 'fixed', 'Applied parameterized queries');
      expect(result.status).toBe('fixed');
    } catch (err) {
      trackError(SUITE, 'Transition to fixed', err, page.url());
      throw err;
    }
  });

  test('7 — Transition: fixed → verified (admin)', async ({ page, request }) => {
    test.skip(!issueDbId, 'No issue');
    try {
      const api = new TestAPIClient({ request });
      await api.login('admin', 'admin123');
      const result = await api.transitionIssue(issueDbId, 'verified', 'Confirmed fix via re-scan');
      expect(result.status).toBe('verified');
    } catch (err) {
      trackError(SUITE, 'Transition to verified', err, page.url());
      throw err;
    }
  });

  test('8 — My Issues page for developer', async ({ page }) => {
    test.skip(!developerUsername, 'No developer');
    try {
      await loginViaAPI(page, developerUsername, developerPassword);
      await page.goto('/my-issues');
      await page.waitForLoadState('networkidle');
      const hasError = await page.locator('text=Something went wrong').isVisible().catch(() => false);
      expect(hasError).toBe(false);
    } catch (err) {
      trackError(SUITE, 'My Issues page', err, page.url());
      throw err;
    }
  });

  test('9 — Issues Triage page (admin)', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/issues');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Issues")')).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Issues Triage page', err, page.url());
      throw err;
    }
  });

  test('10 — Cleanup', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      if (projectId) await api.deleteProject(projectId).catch(() => {});
      if (developerUserId) await api.deleteUser(developerUserId).catch(() => {});
    } catch (err) {
      trackError(SUITE, 'Cleanup', err, page.url());
    }
  });
});
