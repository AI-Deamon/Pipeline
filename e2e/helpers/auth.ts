/**
 * Authentication helpers for Playwright E2E tests.
 *
 * Uses the app's OAuth2 login form to authenticate and store
 * the JWT token in sessionStorage (matching the real app flow).
 */
import { type Page, expect } from '@playwright/test';

/** Default admin credentials per AGENTS.md staging config. */
export const ADMIN_CREDS = {
  username: process.env.E2E_ADMIN_USER || 'admin',
  password: process.env.E2E_ADMIN_PASS || 'admin123',
};

/** Generate unique usernames for test isolation. */
export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Log in through the UI login form.
 * After success, the page is redirected to /dashboard.
 */
export async function loginViaUI(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.waitForSelector('#username', { state: 'visible' });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  // Wait for dashboard redirect (or error) — login can be slow
  await expect(page).toHaveURL(/\/(dashboard|projects|issues)/, { timeout: 30_000 });
}

/**
 * Log in as the default admin user via API (fast, bypasses UI).
 * Navigates to /dashboard after injecting the token and waits for role to load.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await loginViaAPI(page, ADMIN_CREDS.username, ADMIN_CREDS.password);
  await page.goto('/dashboard');
  // Wait for the AuthProvider to load user info (role check in sidebar)
  await expect(page.locator('text=Admin').first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Register a new user via the UI.
 * Returns the credentials used.
 */
export async function registerUser(
  page: Page,
  username: string,
  password: string,
): Promise<{ username: string; password: string }> {
  await page.goto('/register');
  await page.waitForSelector('#username', { state: 'visible' });
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  // After successful registration, app redirects to /login with success message
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  return { username, password };
}

/**
 * Log out by clearing session storage and navigating to login.
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    sessionStorage.clear();
  });
  await page.goto('/login');
  await page.waitForSelector('#username', { state: 'visible' });
}

/**
 * Authenticate via direct API call and inject token into sessionStorage.
 * Faster than UI login for setup steps.
 * Retries on 429 rate limit with exponential backoff.
 */
export async function loginViaAPI(
  page: Page,
  username: string,
  password: string,
  baseUrl?: string,
): Promise<string> {
  const base = baseUrl || (process.env.E2E_BASE_URL || 'http://localhost:5173');
  const apiBase = `${base}/api/v1`;

  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    response = await page.request.post(`${apiBase}/auth/login`, {
      data: params.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (response.ok()) break;
    if (response.status() === 429) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    break;
  }

  if (!response!.ok()) {
    throw new Error(`API login failed for ${username}: ${response!.status()}`);
  }

  const body = await response!.json();
  const token = body.access_token;

  // Inject token into sessionStorage (the app reads from here)
  await page.goto('/login');
  await page.evaluate((t: string) => {
    sessionStorage.setItem('token', t);
  }, token);

  return token;
}
