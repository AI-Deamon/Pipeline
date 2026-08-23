/**
 * E2E: SonarQube Workflow — Reports → Issue Drill-Down → Assign → Dev Resolve
 *
 * Covers:
 *   1. Navigate to project reports page and verify severity cards
 *   2. Navigate to tool detail page and see SonarQube issues in a table
 *   3. Open IssueDetailModal and verify SonarQube-specific fields
 *   4. Assign a critical issue to a developer via the UI
 *   5. Login as developer, see assigned issue in My Issues
 *   6. Developer opens issue detail and verifies SonarQube details
 *   7. Developer transitions issue: in_progress → fixed
 *   8. Admin verifies the fix
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginViaAPI, uniqueUsername } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'sonarqube-workflow';

let projectId: string;
let devUsername: string;
const devPassword = 'DevPass123';
let criticalIssueId: number;
let highIssueId: number;

test.afterAll(() => finalizeErrorLog());

test.describe('SonarQube Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Setup: create project, developer, seed SonarQube issues', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });

      // Create project
      const project = await api.createProject({
        name: `E2E-Sonar-${Date.now()}`,
        git_url: 'https://github.com/juice-shop/juice-shop.git',
        sonar_key: `e2e-sonarqube-${Date.now()}`,
      });
      projectId = project.project_id as string;

      // Create developer user
      devUsername = uniqueUsername('sonar_dev');
      await api.register(devUsername, devPassword);
      const users = await api.listUsers();
      const dev = users.find((u) => u.username === devUsername);
      expect(dev).toBeTruthy();
      await api.grantProjectAccess(dev!.id as string, 'project', projectId);

      // Seed SonarQube issues
      const critical = await api.createIssue({
        issue_id: `e2e-sonar-critical-${Date.now()}`,
        project_id: projectId,
        tool_name: 'sonar_scanner',
        severity: 'critical',
        finding_type: 'BUG',
        title: 'SQL Injection in UserService.java',
        description: 'User input is directly concatenated into SQL query without sanitization. An attacker can inject arbitrary SQL commands by crafting malicious input.',
        recommendation: 'Use parameterized queries or prepared statements to prevent SQL injection. Consider using an ORM framework.',
        location: { file_path: 'src/services/UserService.java', line: 42 },
      });
      criticalIssueId = critical.id as number;

      const high = await api.createIssue({
        issue_id: `e2e-sonar-high-${Date.now()}`,
        project_id: projectId,
        tool_name: 'sonar_scanner',
        severity: 'high',
        finding_type: 'VULNERABILITY',
        title: 'Hardcoded API Key in Config',
        description: 'An API key is hardcoded in the configuration file. This poses a security risk as the key could be exposed in version control.',
        recommendation: 'Store the API key in environment variables or a secure vault service.',
        location: { file_path: 'src/config/app.config.ts', line: 15 },
      });
      highIssueId = high.id as number;

      expect(criticalIssueId).toBeGreaterThan(0);
      expect(highIssueId).toBeGreaterThan(0);
    } catch (err) {
      trackError(SUITE, 'Setup', err, page.url());
      throw err;
    }
  });

  test('2 — Admin: View SonarQube issues in tool detail page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);

      // Navigate to sonar_scanner tool detail page
      await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
      await page.waitForLoadState('networkidle');

      // Verify heading shows the tool name
      await expect(page.getByRole('heading', { name: 'sonar_scanner' })).toBeVisible({ timeout: 10_000 });

      // Verify issue rows appear in the table — check for severity badges
      await expect(page.locator('text=SQL Injection')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('text=Hardcoded API Key')).toBeVisible({ timeout: 5_000 });

      // Verify severity badges render — check for any severity indicator in the table
      await expect(page.locator('[class*="badge"], [class*="severity"], span:has-text("Critical"), span:has-text("High"), span:has-text("Medium"), span:has-text("Low")').first()).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'View tool detail page', err, page.url());
      throw err;
    }
  });

  test('3 — Admin: Open IssueDetailModal and verify SonarQube details', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
      await page.waitForLoadState('networkidle');

      // Click the first issue row (critical SQL Injection)
      const issueRow = page.locator('text=SQL Injection').first();
      await expect(issueRow).toBeVisible({ timeout: 10_000 });
      await issueRow.click();

      // Wait for modal to appear
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // Verify SonarQube-specific fields
      await expect(modal.locator('text=sonar_scanner')).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText('critical', { exact: true })).toBeVisible({ timeout: 5_000 });
      await expect(modal.locator('text=UserService.java')).toBeVisible({ timeout: 5_000 });

      // Verify new detail fields
      await expect(modal.getByText('Issue ID')).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText('First Seen')).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText('Last Seen')).toBeVisible({ timeout: 5_000 });

      // Verify description renders
      await expect(modal.locator('text=SQL query without sanitization')).toBeVisible({ timeout: 5_000 });

      // Verify recommendation renders
      await expect(modal.locator('text=parameterized queries')).toBeVisible({ timeout: 5_000 });

      // Close modal
      const closeBtn = modal.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
    } catch (err) {
      trackError(SUITE, 'Verify issue detail modal', err, page.url());
      throw err;
    }
  });

  test('4 — Admin: Assign critical issue to developer via UI', async ({ page }) => {
    test.skip(!projectId || !devUsername, 'Missing project or developer');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
      await page.waitForLoadState('networkidle');

      // Open the critical issue modal
      const issueRow = page.locator('text=SQL Injection').first();
      await expect(issueRow).toBeVisible({ timeout: 10_000 });
      await issueRow.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // Click Assign button
      const assignBtn = modal.locator('button:has-text("Assign")').first();
      await expect(assignBtn).toBeVisible({ timeout: 5_000 });
      await assignBtn.click();

      // Select developer from dropdown
      const select = modal.locator('select');
      await expect(select).toBeVisible({ timeout: 5_000 });
      await select.selectOption(devUsername);

      // Click the confirm Assign button
      const confirmBtn = modal.locator('button:has-text("Assign")').last();
      await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
      await confirmBtn.click();

      // Wait for modal to reflect assignment — should show assignee name
      // (the modal auto-closes on 200 — we might need to wait and re-open)
      await page.waitForTimeout(2_000);

      // Close the modal
      const closeBtn = modal.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }

      // Re-open the same issue to verify assignment persisted
      await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
      await page.waitForLoadState('networkidle');
      await page.locator('text=SQL Injection').first().click();

      const modal2 = page.locator('[role="dialog"]');
      await expect(modal2).toBeVisible({ timeout: 10_000 });

      // Verify status changed to "assigned" and assignee is shown
      await expect(modal2.locator('span.font-semibold.capitalize:has-text("assigned")')).toBeVisible({ timeout: 5_000 });

      const closeBtn2 = modal2.locator('button[aria-label="Close"]').first();
      if (await closeBtn2.isVisible()) {
        await closeBtn2.click();
      } else {
        await page.keyboard.press('Escape');
      }
    } catch (err) {
      trackError(SUITE, 'Assign issue to developer', err, page.url());
      throw err;
    }
  });

  test('5 — Developer: See assigned issue in My Issues', async ({ page }) => {
    test.skip(!devUsername, 'No developer');
    try {
      // Login as developer via API (faster)
      await loginViaAPI(page, devUsername, devPassword);
      await page.goto('/my-issues');
      await page.waitForLoadState('networkidle');

      // Verify the issue appears
      await expect(page.locator('text=SQL Injection')).toBeVisible({ timeout: 10_000 });

      // Verify project grouping is shown
      await expect(page.locator(`text=${projectId}`).first()).toBeVisible({ timeout: 5_000 });

      // Verify tool name
      await expect(page.locator('text=Sonar_scanner').first()).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Dev sees assigned issue', err, page.url());
      throw err;
    }
  });

  test('6 — Developer: Open issue detail and verify SonarQube fields', async ({ page }) => {
    test.skip(!devUsername, 'No developer');
    try {
      await loginViaAPI(page, devUsername, devPassword);
      await page.goto('/my-issues');
      await page.waitForLoadState('networkidle');

      // Click the issue card
      const issueCard = page.locator('button:has-text("SQL Injection")').first();
      await expect(issueCard).toBeVisible({ timeout: 10_000 });
      await issueCard.click();

      // Wait for modal
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // Verify SonarQube details
      await expect(modal.locator('text=sonar_scanner')).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText('critical', { exact: true })).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText('Issue ID')).toBeVisible({ timeout: 5_000 });
      await expect(modal.getByText('Last Seen')).toBeVisible({ timeout: 5_000 });
      await expect(modal.locator('text=SQL query without sanitization')).toBeVisible({ timeout: 5_000 });
      await expect(modal.locator('text=UserService.java')).toBeVisible({ timeout: 5_000 });
      await expect(modal.locator('text=parameterized queries')).toBeVisible({ timeout: 5_000 });

      // Close modal
      const closeBtn = modal.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
    } catch (err) {
      trackError(SUITE, 'Dev verifies issue details', err, page.url());
      throw err;
    }
  });

  test('7 — Developer: Transition issue in_progress → fixed', async ({ page }) => {
    test.skip(!devUsername, 'No developer');
    try {
      await loginViaAPI(page, devUsername, devPassword);
      await page.goto('/my-issues');
      await page.waitForLoadState('networkidle');

      // Open issue detail
      const issueCard = page.locator('button:has-text("SQL Injection")').first();
      await expect(issueCard).toBeVisible({ timeout: 10_000 });
      await issueCard.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // Click "Start Working"
      const startWorkingBtn = modal.locator('button:has-text("Start Working")');
      await expect(startWorkingBtn).toBeVisible({ timeout: 5_000 });
      await startWorkingBtn.click();
      await page.waitForTimeout(1_500);

      // The modal may close on mutation success — re-open if needed
      // Check if modal is still open, if not, re-open
      const modalStillOpen = await modal.isVisible().catch(() => false);
      if (!modalStillOpen) {
        await page.locator('button:has-text("SQL Injection")').first().click();
        await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 10_000 });
      }

      // Click "Mark Fixed"
      const markFixedBtn = page.locator('[role="dialog"] button:has-text("Mark Fixed")');
      await expect(markFixedBtn).toBeVisible({ timeout: 5_000 });
      await markFixedBtn.click();
      await page.waitForTimeout(1_500);

      // Close modal
      const closeBtn = modal.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }

      // Verify status is now "fixed" on the card
      await page.waitForLoadState('networkidle');
      await page.locator('text=SQL Injection').first().click();
      const finalModal = page.locator('[role="dialog"]');
      await expect(finalModal).toBeVisible({ timeout: 10_000 });
      await expect(finalModal.locator('text=fixed')).toBeVisible({ timeout: 5_000 });

      const closeFinal = finalModal.locator('button[aria-label="Close"]').first();
      if (await closeFinal.isVisible()) {
        await closeFinal.click();
      } else {
        await page.keyboard.press('Escape');
      }
    } catch (err) {
      trackError(SUITE, 'Dev transitions issue', err, page.url());
      throw err;
    }
  });

  test('8 — Admin: Verify fixed issue', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
      await page.waitForLoadState('networkidle');

      // Open the fixed issue
      const issueRow = page.locator('text=SQL Injection').first();
      await expect(issueRow).toBeVisible({ timeout: 10_000 });
      await issueRow.click();

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // Should see "Verify" button since status is "fixed" and admin can verify
      const verifyBtn = modal.locator('button:has-text("Verify")');
      await expect(verifyBtn).toBeVisible({ timeout: 5_000 });
      await verifyBtn.click();
      await page.waitForTimeout(1_500);

      // Close and re-open to verify status changed
      const closeBtn = modal.locator('button[aria-label="Close"]').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }

      await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
      await page.waitForLoadState('networkidle');
      await page.locator('text=SQL Injection').first().click();
      const finalModal = page.locator('[role="dialog"]');
      await expect(finalModal).toBeVisible({ timeout: 10_000 });
      await expect(finalModal.locator('text=verified').first()).toBeVisible({ timeout: 5_000 });

      const closeFinal = finalModal.locator('button[aria-label="Close"]').first();
      if (await closeFinal.isVisible()) {
        await closeFinal.click();
      } else {
        await page.keyboard.press('Escape');
      }
    } catch (err) {
      trackError(SUITE, 'Admin verifies fixed issue', err, page.url());
      throw err;
    }
  });

  test('9 — Cleanup', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      if (projectId) await api.deleteProject(projectId).catch(() => {});
      const users = await api.listUsers();
      const dev = users.find((u) => u.username === devUsername);
      if (dev) await api.deleteUser(dev!.id as string).catch(() => {});
    } catch (err) {
      trackError(SUITE, 'Cleanup', err, page.url());
    }
  });
});
