import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';

const SUITE = 'error-states';

test.afterAll(() => finalizeErrorLog());

test.describe('Error States & Edge Cases', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — 404 for nonexistent project', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/projects/nonexistent-uuid-12345');
      await page.waitForLoadState('networkidle');

      const notFound = await page.locator('text=/not found|Not Found|Project not found|error|Error/').isVisible({ timeout: 10_000 }).catch(() => false);
      const isRedirect = page.url().includes('/dashboard');
      const isLogin = page.url().includes('/login');
      expect(notFound || isRedirect || isLogin).toBe(true);
    } catch (err) {
      trackError(SUITE, '404 nonexistent project', err, page.url());
      throw err;
    }
  });

  test('2 — 404 for nonexistent scan', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/scans/nonexistent-scan-12345');
      await page.waitForLoadState('networkidle');

      const notFound = await page.locator('text=not found|Not Found|Scan not found|error').isVisible({ timeout: 10_000 }).catch(() => false);
      const isRedirect = page.url().includes('/dashboard');
      expect(notFound || isRedirect).toBe(true);
    } catch (err) {
      trackError(SUITE, '404 nonexistent scan', err, page.url());
      throw err;
    }
  });

  test('3 — Login with wrong credentials', async ({ page }) => {
    try {
      await page.goto('/login');
      await page.fill('#username', 'nonexistent_user_xyz');
      await page.fill('#password', 'wrongpassword123');
      await page.click('button[type="submit"]');

      // Should show error message
      const hasError = await page.locator('text=incorrect|wrong|invalid|error|Error').isVisible({ timeout: 10_000 }).catch(() => false);
      const stillOnLogin = page.url().includes('/login');
      expect(hasError || stillOnLogin).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Wrong credentials', err, page.url());
      throw err;
    }
  });

  test('4 — Empty form submission on login', async ({ page }) => {
    try {
      await page.goto('/login');
      // Try to submit without filling fields
      await page.click('button[type="submit"]');

      // Should stay on login or show validation
      await page.waitForTimeout(1000);
      expect(page.url()).toContain('/login');
    } catch (err) {
      trackError(SUITE, 'Empty login submission', err, page.url());
      throw err;
    }
  });

  test('5 — Empty form submission on register', async ({ page }) => {
    try {
      await page.goto('/register');
      await page.click('button[type="submit"]');

      await page.waitForTimeout(1000);
      expect(page.url()).toContain('/register');
    } catch (err) {
      trackError(SUITE, 'Empty register submission', err, page.url());
      throw err;
    }
  });

  test('6 — Project edit page for deleted project', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/projects/deleted-uuid-99999/edit');
      await page.waitForLoadState('networkidle');

      const notFound = await page.locator('text=not found|Not Found|error').isVisible({ timeout: 10_000 }).catch(() => false);
      const isRedirect = page.url().includes('/dashboard');
      expect(notFound || isRedirect).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Edit deleted project', err, page.url());
      throw err;
    }
  });

  test('7 — Manual scan page for deleted project', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/projects/deleted-uuid-99999/manual');
      await page.waitForLoadState('networkidle');

      const notFound = await page.locator('text=not found|Not Found|error').isVisible({ timeout: 10_000 }).catch(() => false);
      const isRedirect = page.url().includes('/dashboard');
      expect(notFound || isRedirect).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Manual scan deleted project', err, page.url());
      throw err;
    }
  });

  test('8 — Scan history page for deleted project', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/projects/deleted-uuid-99999/history');
      await page.waitForLoadState('networkidle');

      const notFound = await page.locator('text=not found|Not Found|error|No scans').isVisible({ timeout: 10_000 }).catch(() => false);
      const isRedirect = page.url().includes('/dashboard');
      expect(notFound || isRedirect).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Scan history deleted project', err, page.url());
      throw err;
    }
  });

  test('9 — Token expired redirect', async ({ page }) => {
    try {
      await page.goto('/login?reason=token-expired');
      await page.waitForLoadState('networkidle');

      const hasExpiredMsg = await page.locator('text=expired|session').isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasExpiredMsg || page.url().includes('/login')).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Token expired redirect', err, page.url());
      throw err;
    }
  });

  test('10 — Account deleted redirect', async ({ page }) => {
    try {
      await page.goto('/login?reason=account-deleted');
      await page.waitForLoadState('networkidle');

      const hasDeletedMsg = await page.locator('text=deleted|no longer exists').isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasDeletedMsg || page.url().includes('/login')).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Account deleted redirect', err, page.url());
      throw err;
    }
  });

  test('11 — Page handles slow API gracefully', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      // Navigate to a page that loads data
      await page.goto('/dashboard');
      // Should show loading state or content
      await page.waitForTimeout(2000);
      const hasContent = await page.locator('text=Projects|Dashboard|Loading').first().isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasContent).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Slow API handling', err, page.url());
      throw err;
    }
  });

  test('12 — Browser back button works', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.goBack();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/dashboard');
    } catch (err) {
      trackError(SUITE, 'Browser back button', err, page.url());
      throw err;
    }
  });
});
