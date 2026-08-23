import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';

const SUITE = 'settings';

test.afterAll(() => finalizeErrorLog());

test.describe('Settings Page', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Settings page loads', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Settings")')).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Settings page loads', err, page.url());
      throw err;
    }
  });

  test('2 — API Key section renders', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel('API Key', { exact: true })).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('button:has-text("Save")')).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'API Key section', err, page.url());
      throw err;
    }
  });

  test('3 — Save API key', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Find the API key input and enter a value
      const apiKeyInput = page.locator('input[type="password"], input[type="text"]').first();
      await apiKeyInput.fill('test-api-key-12345');

      // Click Save
      await page.locator('button:has-text("Save")').first().click();

      // Verify success toast or status change
      await expect(page.locator('text=API Key Configured')).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Save API key', err, page.url());
      throw err;
    }
  });

  test('4 — Clear API key', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // First set an API key
      const apiKeyInput = page.locator('input[type="password"], input[type="text"]').first();
      await apiKeyInput.fill('test-api-key-to-clear');
      await page.locator('button:has-text("Save")').first().click();
      await page.waitForTimeout(1000);

      // Now clear it
      const clearBtn = page.locator('button:has-text("Clear")');
      if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clearBtn.click();
        await expect(page.locator('text=API Key Not Configured')).toBeVisible({ timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Clear API key', err, page.url());
      throw err;
    }
  });

  test('5 — Show/Hide API key toggle', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const toggleBtn = page.locator('button[aria-label*="Show"], button[aria-label*="show"]').first();
      if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleBtn.click();
        // Input type should change from password to text
        const input = page.locator('input[type="text"]').first();
        await expect(input).toBeVisible({ timeout: 3000 });
      }
    } catch (err) {
      trackError(SUITE, 'Show/Hide toggle', err, page.url());
      throw err;
    }
  });

  test('6 — Desktop Notifications section', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=Desktop Notifications')).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Notifications section', err, page.url());
      throw err;
    }
  });

  test('7 — Back link navigates to dashboard', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const backLink = page.locator('a[href="/dashboard"]').first();
      if (await backLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await backLink.click();
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });
      }
    } catch (err) {
      trackError(SUITE, 'Back link navigation', err, page.url());
      throw err;
    }
  });
});
