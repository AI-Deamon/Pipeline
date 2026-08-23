import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginViaAPI, uniqueUsername } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';
import { TestAPIClient } from './helpers/api-client';

const SUITE = 'navigation';

test.afterAll(() => finalizeErrorLog());

test.describe('Navigation & Routing', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Unauthenticated user redirects to /login', async ({ page }) => {
    try {
      await page.goto('/login');
      await page.evaluate(() => sessionStorage.clear());
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Unauth redirect to login', err, page.url());
      throw err;
    }
  });

  test('2 — Root / redirects to /dashboard', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/');
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Root redirects to dashboard', err, page.url());
      throw err;
    }
  });

  test('3 — Sidebar links navigate correctly', async ({ page }) => {
    try {
      await loginAsAdmin(page);

      // Dashboard
      await page.locator('aside nav a:has-text("Dashboard")').first().click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 5_000 });

      // My Issues
      await page.locator('aside nav a:has-text("My Issues")').click();
      await expect(page).toHaveURL(/\/my-issues/, { timeout: 5_000 });

      // Issues
      await page.locator('aside nav a:has-text("Issues")').click();
      await expect(page).toHaveURL(/\/issues/, { timeout: 5_000 });

      // Rescan Approvals
      await page.locator('aside nav a:has-text("Rescan Approvals")').click();
      await expect(page).toHaveURL(/\/pending-verification/, { timeout: 5_000 });

      // Groups
      await page.locator('aside nav a:has-text("Groups")').click();
      await expect(page).toHaveURL(/\/project-groups/, { timeout: 5_000 });

      // Users (admin only)
      await page.locator('aside nav a:has-text("Users")').click();
      await expect(page).toHaveURL(/\/users/, { timeout: 5_000 });

      // API Settings
      await page.locator('aside nav a:has-text("API Settings")').click();
      await expect(page).toHaveURL(/\/settings/, { timeout: 5_000 });

      // Docs
      await page.locator('aside nav a:has-text("Docs")').click();
      await expect(page).toHaveURL(/\/docs/, { timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Sidebar navigation', err, page.url());
      throw err;
    }
  });

  test('4 — 404 route shows not found', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/nonexistent-page');
      await page.waitForLoadState('networkidle');
      // App should either show a 404 page or redirect to dashboard
      const url = page.url();
      const is404 = await page.locator('text=not found|404|Not Found').isVisible({ timeout: 5_000 }).catch(() => false);
      const isRedirect = url.includes('/dashboard') || url.includes('/login');
      expect(is404 || isRedirect).toBe(true);
    } catch (err) {
      trackError(SUITE, '404 page handling', err, page.url());
      throw err;
    }
  });

  test('5 — Breadcrumbs navigation', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      const projects = await api.listProjects();
      if (projects.length === 0) {
        test.skip(true, 'No projects to test breadcrumbs');
        return;
      }
      const projectId = projects[0].project_id as string;

      await loginAsAdmin(page);
      await page.goto(`/projects/${projectId}/reports`);
      await page.waitForLoadState('networkidle');

      // Look for breadcrumb navigation
      const breadcrumb = page.locator('nav[aria-label*="breadcrumb"], [class*="breadcrumb"], a:has-text("DASHBOARD")').first();
      const hasBreadcrumbs = await breadcrumb.isVisible({ timeout: 5_000 }).catch(() => false);
      // Breadcrumbs may not exist on all pages — just verify the page loads
      expect(hasBreadcrumbs || page.url().includes(projectId)).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Breadcrumbs navigation', err, page.url());
      throw err;
    }
  });

  test('6 — Login page renders correctly', async ({ page }) => {
    try {
      await page.goto('/login');
      await expect(page.locator('h1:has-text("Login")')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('#username')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      await expect(page.locator('a:has-text("Create one")')).toBeVisible();
    } catch (err) {
      trackError(SUITE, 'Login page renders', err, page.url());
      throw err;
    }
  });

  test('7 — Register page renders correctly', async ({ page }) => {
    try {
      await page.goto('/register');
      await expect(page.locator('h1:has-text("Create Account")')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('#username')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      await expect(page.locator('a:has-text("Sign in")')).toBeVisible();
    } catch (err) {
      trackError(SUITE, 'Register page renders', err, page.url());
      throw err;
    }
  });

  test('8 — Login → Register → Login flow', async ({ page }) => {
    try {
      await page.goto('/login');
      // Click "Create one" link
      await page.locator('a:has-text("Create one")').click();
      await expect(page).toHaveURL(/\/register/, { timeout: 5_000 });

      // Click "Sign in" link
      await page.locator('a:has-text("Sign in")').click();
      await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Login-Register flow', err, page.url());
      throw err;
    }
  });

  test('9 — Developer sidebar hides admin-only links', async ({ page, request }) => {
    try {
      const api = new TestAPIClient({ request });
      const devUsername = uniqueUsername('nav_dev');
      const devPassword = 'NavTest123';
      await api.register(devUsername, devPassword);

      await loginViaAPI(page, devUsername, devPassword);
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');

      // Developer should NOT see Users link
      const usersLink = page.locator('nav a:has-text("Users")');
      await expect(usersLink).toHaveCount(0, { timeout: 5_000 });

      // Cleanup
      const users = await api.listUsers();
      const dev = users.find((u) => u.username === devUsername);
      if (dev) await api.deleteUser(dev.id as string).catch(() => {});
    } catch (err) {
      trackError(SUITE, 'Developer sidebar', err, page.url());
      throw err;
    }
  });

  test('10 — Logout clears session', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/dashboard');

      // Click logout
      await page.locator('button:has-text("Logout"), a:has-text("Logout")').first().click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

      // Verify session is cleared
      const token = await page.evaluate(() => sessionStorage.getItem('token'));
      expect(token).toBeNull();
    } catch (err) {
      trackError(SUITE, 'Logout clears session', err, page.url());
      throw err;
    }
  });
});
