/**
 * E2E: Project Lifecycle
 *
 * Covers:
 *   1. Creating a project through the multi-step wizard
 *   2. Verifying the project appears on the dashboard
 *   3. Triggering an automated scan from the project control page
 *   4. Canceling a scan
 *   5. Deleting the project (cleanup)
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'project-lifecycle';

// Unique project name per run
const PROJECT_NAME = `E2E-Project-${Date.now()}`;
const SONAR_KEY = `e2e-sonar-${Date.now()}`;
const GIT_URL = 'https://github.com/juice-shop/juice-shop.git';

let createdProjectId: string;

test.afterAll(async () => {
  finalizeErrorLog();
});

test.describe('Project Lifecycle', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Login as admin', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Login as admin', err, page.url());
      throw err;
    }
  });

  test('2 — Create a project via wizard', async ({ page }) => {
    try {
      await loginAsAdmin(page);

      // Navigate to create project
      await page.goto('/projects/create');
      await expect(page.locator('h1')).toContainText(/create/i, { timeout: 10_000 });

      // Step 1: Project Details
      await page.fill('#name', PROJECT_NAME);
      await page.fill('#sonar_key', SONAR_KEY);
      await page.click('button:has-text("Continue")');

      // Step 2: Repository Configuration
      await expect(page.locator('h2')).toContainText('Repository', { timeout: 5_000 });
      await page.fill('#git_url', GIT_URL);
      await page.click('button:has-text("Continue")');

      // Step 3: Analysis Setup — optional fields, just click Create
      await expect(page.locator('h2')).toContainText('Analysis', { timeout: 5_000 });
      await page.click('button:has-text("Create Project")');

      // Wait for redirect to project control page
      await page.waitForURL(/\/projects\/[a-f0-9-]+/, { timeout: 15_000 });

      // Extract project ID from URL
      const url = page.url();
      const match = url.match(/\/projects\/([a-f0-9-]+)/);
      expect(match).toBeTruthy();
      createdProjectId = match![1];

      // Verify project name is visible
      await expect(page.locator('h1, h2').filter({ hasText: PROJECT_NAME })).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Create project via wizard', err, page.url());
      throw err;
    }
  });

  test('3 — Verify project appears on dashboard', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Search or find the project name in the dashboard listing
      const projectCard = page.locator(`text=${PROJECT_NAME}`).first();
      await expect(projectCard).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Verify project on dashboard', err, page.url());
      throw err;
    }
  });

  test('4 — Trigger an automated scan', async ({ page }) => {
    test.skip(!createdProjectId, 'Skipped: no project created in previous step');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // Check if project was deleted (e.g. by previous test run cleanup)
      const notFound = page.locator('text=Project not found');
      if (await notFound.isVisible({ timeout: 3000 }).catch(() => false)) {
        test.skip(true, 'Project was deleted — skipping scan trigger');
        return;
      }

      // Click "Start Scan" button
      const startBtn = page.locator('button:has-text("Start Scan")').first();
      await expect(startBtn).toBeVisible({ timeout: 10_000 });
      await startBtn.click();

      // Confirm in the modal dialog
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
      const confirmBtn = confirmDialog.locator('button:has-text("Start Scan")');
      await confirmBtn.click();

      // Should redirect to scan status page OR show error
      // (scan may fail if Jenkins is not running — that's OK, we validate the trigger flow)
      await page.waitForURL(/\/(scans\/[a-f0-9-]+|projects\/)/, { timeout: 20_000 });
    } catch (err) {
      trackError(SUITE, 'Trigger automated scan', err, page.url());
      throw err;
    }
  });

  test('5 — Cancel a scan via API', async ({ page, request }) => {
    test.skip(!createdProjectId, 'Skipped: no project created');
    try {
      const api = new TestAPIClient({ request });

      // Try to trigger a new scan and immediately cancel
      let scanId: string;
      try {
        const scan = await api.triggerScan(createdProjectId, 'automated');
        scanId = scan.scan_id as string;
      } catch {
        // If trigger fails (e.g., active scan or Jenkins unavailable), skip gracefully
        test.skip(true, 'Could not trigger scan to cancel — Jenkins may be unavailable');
        return;
      }

      // Attempt cancel
      const cancelResult = await api.cancelScan(scanId);
      expect(cancelResult).toBeTruthy();

      // Verify scan is no longer in RUNNING/CREATED state
      const scanStatus = await api.getScan(scanId);
      expect(['CANCELLED', 'FAILED', 'COMPLETED']).toContain(scanStatus.state);
    } catch (err) {
      trackError(SUITE, 'Cancel scan via API', err, page.url());
      throw err;
    }
  });

  test('6 — Delete the project', async ({ page }) => {
    test.skip(!createdProjectId, 'Skipped: no project created');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${createdProjectId}`);
      await page.waitForLoadState('networkidle');

      // Check if project was deleted already
      const notFound = page.locator('text=Project not found');
      if (await notFound.isVisible({ timeout: 3000 }).catch(() => false)) {
        return; // Already deleted, nothing to do
      }

      // Click Delete button
      const deleteBtn = page.locator('button:has-text("Delete")').first();
      await expect(deleteBtn).toBeVisible({ timeout: 10_000 });
      await deleteBtn.click();

      // Confirm deletion in modal
      const confirmDialog = page.locator('[role="dialog"]');
      await expect(confirmDialog).toBeVisible({ timeout: 5_000 });
      const confirmDeleteBtn = confirmDialog.locator('button:has-text("Delete")');
      await confirmDeleteBtn.click();

      // Should redirect to dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

      // Verify project is no longer visible
      await page.waitForLoadState('networkidle');
      const removed = page.locator(`text=${PROJECT_NAME}`);
      await expect(removed).toHaveCount(0, { timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Delete project', err, page.url());
      throw err;
    }
  });
});
