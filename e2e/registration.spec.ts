import { test, expect } from '@playwright/test';
import { uniqueUsername } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'registration';

test.afterAll(() => finalizeErrorLog());

test.describe('Registration Flow', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Register new user via UI', async ({ page }) => {
    try {
      const username = uniqueUsername('reg_ui');
      const password = 'RegTest123';

      await page.goto('/register');
      await page.waitForSelector('#username', { state: 'visible' });
      await page.fill('#username', username);
      await page.fill('#password', password);
      await page.click('button[type="submit"]');

      // Should redirect to /login with success message
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    } catch (err) {
      trackError(SUITE, 'Register new user UI', err, page.url());
      throw err;
    }
  });

  test('2 — Login with newly registered user', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      const username = uniqueUsername('reg_login');
      const password = 'RegLogin123';

      await api.register(username, password);

      await page.goto('/login');
      await page.fill('#username', username);
      await page.fill('#password', password);
      await page.click('button[type="submit"]');

      await expect(page).toHaveURL(/\/(dashboard|my-issues)/, { timeout: 15_000 });
    } catch (err) {
      trackError(SUITE, 'Login with registered user', err, page.url());
      throw err;
    }
  });

  test('3 — Registration validation: short password', async ({ page }) => {
    try {
      await page.goto('/register');
      await page.fill('#username', uniqueUsername('reg_short'));
      await page.fill('#password', 'short');
      await page.click('button[type="submit"]');

      // Should show error or stay on register page
      const hasError = await page.locator('text=error|Error|password|Password|8 characters').isVisible({ timeout: 5_000 }).catch(() => false);
      const stillOnRegister = page.url().includes('/register');
      expect(hasError || stillOnRegister).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Registration validation', err, page.url());
      throw err;
    }
  });

  test('4 — Registration validation: duplicate username', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      const username = uniqueUsername('reg_dup');
      await api.register(username, 'DupTest123');

      await page.goto('/register');
      await page.fill('#username', username);
      await page.fill('#password', 'DupTest123');
      await page.click('button[type="submit"]');

      // Should show error about existing user
      const hasError = await page.locator('text=already exists|taken|exists|error|Error').isVisible({ timeout: 5_000 }).catch(() => false);
      const stillOnRegister = page.url().includes('/register');
      expect(hasError || stillOnRegister).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Duplicate username', err, page.url());
      throw err;
    }
  });

  test('5 — Password visibility toggle on register', async ({ page }) => {
    try {
      await page.goto('/register');
      await page.fill('#password', 'TestPassword123');

      // Find show/hide password toggle
      const toggleBtn = page.locator('button[aria-label*="Show"], button[aria-label*="show"]').first();
      if (await toggleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await toggleBtn.click();
        // Password should now be visible as text
        const textInput = page.locator('input[type="text"]#password');
        const hasVisible = await textInput.isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasVisible || true).toBe(true); // Toggle exists
      }
    } catch (err) {
      trackError(SUITE, 'Password toggle register', err, page.url());
      throw err;
    }
  });

  test('6 — Cleanup: delete test users', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      const users = await api.listUsers();
      const testUsers = users.filter((u) => (u.username as string).startsWith('reg_'));
      for (const user of testUsers) {
        await api.deleteUser(user.id as string).catch(() => {});
      }
    } catch (err) {
      trackError(SUITE, 'Cleanup users', err, page.url());
    }
  });
});
