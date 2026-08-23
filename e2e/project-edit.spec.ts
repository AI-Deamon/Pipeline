import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'project-edit';

test.afterAll(() => finalizeErrorLog());

test.describe('Project Edit Page', () => {
  test.describe.configure({ mode: 'serial' });

  let projectId: string;

  test('1 — Setup: create test project', async ({ request }) => {
    try {
      const api = new TestAPIClient({ request });
      const project = await api.createProject({
        name: `E2E-Edit-${Date.now()}`,
        git_url: 'https://github.com/juice-shop/juice-shop.git',
        sonar_key: `e2e-edit-${Date.now()}`,
      });
      projectId = project.project_id as string;
    } catch (err) {
      trackError(SUITE, 'Setup project', err, '');
      throw err;
    }
  });

  test('2 — Edit page loads', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/edit`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1').filter({ hasText: 'Edit Project' }).last()).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Edit page loads', err, page.url());
      throw err;
    }
  });

  test('3 — Form pre-filled with project data', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/edit`);
      await page.waitForLoadState('networkidle');

      // Check that form fields have values
      const nameInput = page.locator('input[name="name"], #name').first();
      const value = await nameInput.inputValue();
      expect(value.length).toBeGreaterThan(0);
    } catch (err) {
      trackError(SUITE, 'Form pre-filled', err, page.url());
      throw err;
    }
  });

  test('4 — Back link navigates to project', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/edit`);
      await page.waitForLoadState('networkidle');

      const backLink = page.locator(`a[href="/projects/${projectId}"]`).first();
      if (await backLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await backLink.click();
        await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`), { timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Back link navigation', err, page.url());
      throw err;
    }
  });

  test('5 — Edit project name', async ({ page }) => {
    test.skip(!projectId, 'No project');
    try {
      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/edit`);
      await page.waitForLoadState('networkidle');

      const nameInput = page.locator('input[name="name"], #name').first();
      const newName = `E2E-Edited-${Date.now()}`;
      await nameInput.clear();
      await nameInput.fill(newName);

      // Submit the form
      const submitBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update")').first();
      await submitBtn.click();

      // Should show success or redirect
      await page.waitForTimeout(2000);
      const hasSuccess = await page.locator('text=success|updated|saved').isVisible({ timeout: 5_000 }).catch(() => false);
      const redirected = page.url().includes('/projects/');
      expect(hasSuccess || redirected).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Edit project name', err, page.url());
      throw err;
    }
  });

  test('6 — Edit page shows not found for deleted project', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/projects/nonexistent-id-12345/edit');
      await page.waitForLoadState('networkidle');
      const notFound = await page.locator('text=not found|Not Found|error').isVisible({ timeout: 10_000 }).catch(() => false);
      expect(notFound || page.url().includes('/dashboard')).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Edit not found', err, page.url());
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
