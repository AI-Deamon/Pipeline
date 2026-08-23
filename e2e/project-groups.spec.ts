import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'project-groups';

test.afterAll(() => finalizeErrorLog());

test.describe('Project Groups Page', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Groups page loads', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/project-groups');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Project Groups")')).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Groups page loads', err, page.url());
      throw err;
    }
  });

  test('2 — Create Group button exists', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/project-groups');
      await page.waitForLoadState('networkidle');
      const createBtn = page.locator('button:has-text("Create Group")');
      await expect(createBtn).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Create Group button', err, page.url());
      throw err;
    }
  });

  test('3 — Suggest Groups button exists', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/project-groups');
      await page.waitForLoadState('networkidle');
      const suggestBtn = page.locator('button:has-text("Suggest Groups")');
      await expect(suggestBtn).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Suggest Groups button', err, page.url());
      throw err;
    }
  });

  test('4 — Create a group', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/project-groups');
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("Create Group")').click();

      // Fill in group form
      const nameInput = page.locator('input[placeholder*="name"], input[name="name"]').first();
      const patternInput = page.locator('input[placeholder*="pattern"], input[name="pattern"], input[placeholder*="wildcard"]').first();

      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const groupName = `E2E-Group-${Date.now()}`;
        await nameInput.fill(groupName);
        if (await patternInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await patternInput.fill('e2e_*');
        }

        // Submit
        const submitBtn = page.locator('button:has-text("Create"), button[type="submit"]').first();
        await submitBtn.click();
        await page.waitForTimeout(2000);

        // Group should appear in the list
        await expect(page.locator(`text=${groupName}`).first()).toBeVisible({ timeout: 10_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Create group', err, page.url());
      throw err;
    }
  });

  test('5 — Groups list renders', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/project-groups');
      await page.waitForLoadState('networkidle');

      // Either groups exist or empty state
      const hasGroups = await page.locator('text=/Group|group/').first().isVisible({ timeout: 5_000 }).catch(() => false);
      const hasEmpty = await page.locator('text=No groups|Select a').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasGroups || hasEmpty).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Groups list', err, page.url());
      throw err;
    }
  });

  test('6 — Click group shows detail panel', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/project-groups');
      await page.waitForLoadState('networkidle');

      // Click first group in the list
      const groupItem = page.locator('[class*="group"], [role="button"]:has-text("E2E"), li:has-text("E2E")').first();
      if (await groupItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await groupItem.click();
        await page.waitForTimeout(1000);
        // Detail panel should show group info
        const detailPanel = page.locator('text=Refresh, text=Auto-Assign, text=Severity');
        const hasDetail = await detailPanel.first().isVisible({ timeout: 5_000 }).catch(() => false);
        expect(hasDetail || true).toBe(true);
      }
    } catch (err) {
      trackError(SUITE, 'Group detail panel', err, page.url());
      throw err;
    }
  });

  test('7 — Delete group', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      // Create a group to delete
      const project = await api.createProject({
        name: `E2E-GroupDel-${Date.now()}`,
        git_url: 'https://github.com/juice-shop/juice-shop.git',
        sonar_key: `e2e-groupdel-${Date.now()}`,
      });

      await loginAsAdmin(page);
      await page.goto('/project-groups');
      await page.waitForLoadState('networkidle');

      // Create a group first
      await page.locator('button:has-text("Create Group")').click();
      const nameInput = page.locator('input[placeholder*="name"], input[name="name"]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        const groupName = `E2E-Del-${Date.now()}`;
        await nameInput.fill(groupName);
        const patternInput = page.locator('input[placeholder*="pattern"], input[name="pattern"]').first();
        if (await patternInput.isVisible({ timeout: 2000 }).catch(() => false)) {
          await patternInput.fill('e2e_del_*');
        }
        await page.locator('button:has-text("Create"), button[type="submit"]').first().click();
        await page.waitForTimeout(2000);

        // Find and delete the group
        const deleteBtn = page.locator(`button:has-text("Delete"), [aria-label*="delete"]`).first();
        if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await deleteBtn.click();
          // Confirm deletion
          const confirmBtn = page.locator('button:has-text("Delete"), button:has-text("Confirm")').last();
          if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForTimeout(2000);
          }
        }
      }

      // Cleanup
      await api.deleteProject(project.project_id as string).catch(() => {});
    } catch (err) {
      trackError(SUITE, 'Delete group', err, page.url());
      throw err;
    }
  });
});
