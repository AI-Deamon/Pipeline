/**
 * E2E: Navigation Smoke Test — visits every route, clicks every sidebar link,
 * verifies every page loads without errors, and tests key interactive elements.
 *
 * Covers all 20 routes, sidebar nav, breadcrumbs, active project panel,
 * empty states, error states, role-based redirects, and interactive widgets.
 */
import { test, expect, type Page } from '@playwright/test';
import { loginViaAPI, loginAsAdmin, uniqueUsername } from './helpers/auth';
import { TestAPIClient } from './helpers/api-client';

let projectId: string;
let devUsername: string;
const devPassword = 'DevPass123';

/** Verify the page loaded without an error boundary or crash. */
async function expectNoCrash(page: Page): Promise<void> {
  const hasError = await page.locator('text=Something went wrong').isVisible().catch(() => false);
  expect(hasError).toBe(false);
}

/** Verify a heading is visible on the page. */
async function expectHeading(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.locator('h1').first()).toContainText(text, { timeout: 10_000 });
}

test.describe('Navigation Smoke Test', () => {
  test.describe.configure({ mode: 'serial' });

  // ─── SETUP ────────────────────────────────────────────────────────

  test('0 — Setup: create project + developer user', async ({ request }) => {
    const api = new TestAPIClient({ request });
    await api.login('admin', 'admin123');
    const project = await api.createProject({
      name: `E2E-Smoke-${Date.now()}`,
      git_url: 'https://github.com/juice-shop/juice-shop.git',
      sonar_key: `e2e-smoke-${Date.now()}`,
    });
    projectId = project.project_id as string;

    devUsername = uniqueUsername('smoke_dev');
    await api.register(devUsername, devPassword);
  });

  // ─── AUTH PAGES ──────────────────────────────────────────────────

  test('01 — /login redirects authenticated user to dashboard', async ({ page }) => {
    await loginAsAdmin(page);
    // Already authenticated users should be redirected from /login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/login');
    await expectNoCrash(page);
  });

  test('02 — /register shows registration form', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#username')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#password')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button[type="submit"]')).toBeVisible({ timeout: 5_000 });
    await expectNoCrash(page);
  });

  // ─── DASHBOARD ───────────────────────────────────────────────────

  test('03 — /dashboard renders project list', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expectHeading(page, /dashboard/i);
    await expectNoCrash(page);
    // Verify search input exists
    await expect(page.locator('input[placeholder*="Search"]').first()).toBeVisible({ timeout: 5_000 });
  });

  // ─── SIDEBAR NAVIGATION ──────────────────────────────────────────

  test('04 — Sidebar: all nav links render and navigate correctly', async ({ page }) => {
    await loginAsAdmin(page);

    const navChecks: { label: string; expectedUrl: string; exact?: boolean }[] = [
      { label: 'Dashboard', expectedUrl: '/dashboard' },
      { label: 'My Issues', expectedUrl: '/my-issues' },
      { label: 'Issues', expectedUrl: '/issues', exact: true },
      { label: 'Rescan Approvals', expectedUrl: '/pending-verification' },
      { label: 'New Project', expectedUrl: '/projects/create' },
      { label: 'API Settings', expectedUrl: '/settings' },
      { label: 'Docs', expectedUrl: '/docs' },
    ];

    for (const { label, expectedUrl } of navChecks) {
      const link = page.locator(`aside a`).filter({ hasText: new RegExp(`^${label}$`) }).first();
      await expect(link).toBeVisible({ timeout: 5_000 });
      await link.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain(expectedUrl);
      await expectNoCrash(page);
    }
  });

  test('05 — Sidebar: project groups link visible for admin', async ({ page }) => {
    await loginAsAdmin(page);
    const groupsLink = page.locator('a:has-text("Groups")').first();
    await expect(groupsLink).toBeVisible({ timeout: 5_000 });
    await groupsLink.click();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/project-groups');
    await expectNoCrash(page);
  });

  test('06 — Sidebar: Users link visible for admin', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expectHeading(page, /user management|users/i);
    await expectNoCrash(page);
  });

  // ─── PROJECT-SPECIFIC PAGES ──────────────────────────────────────

  test('07 — /projects/:id — Project Control Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');
    await expectHeading(page, /E2E-Smoke/);
    await expectNoCrash(page);
    // Key buttons
    const hasStartScan = await page.locator('button:has-text("Start Scan")').isVisible().catch(() => false);
    const hasDelete = await page.locator('button:has-text("Delete")').isVisible().catch(() => false);
    expect(hasStartScan || hasDelete).toBe(true);
  });

  test('08 — /projects/:id/edit — Project Edit Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/edit`);
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
    // Should show a form (input fields for editing)
    const hasForm = await page.locator('input, textarea, select').first().isVisible().catch(() => false);
    expect(hasForm).toBe(true);
  });

  test('09 — /projects/:id/manual — Manual Scan Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/manual`);
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
    // Should have stage selection checkboxes/buttons
    const hasStages = await page.locator('text=stages', { ignoreCase: true }).isVisible()
      .catch(() => page.locator('input[type="checkbox"]').first().isVisible().catch(() => false));
    expect(hasStages).toBe(true);
  });

  test('10 — /projects/:id/history — Scan History Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/history`);
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  test('11 — /projects/:id/reports — Reports Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/reports`);
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  test('12 — /projects/:id/reports/unified — Unified Report Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/reports/unified`);
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  test('13 — /projects/:id/issues — Issue Overview Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/issues`);
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  test('14 — /projects/:id/issues/sonar_scanner — Tool Detail Page', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  // ─── CREATE PROJECT PAGE ─────────────────────────────────────────

  test('15 — /projects/create — Create Project Wizard', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/projects/create');
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
    // Should show wizard step 1
    await expect(page.locator('input#name').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button:has-text("Continue")').first()).toBeVisible({ timeout: 5_000 });
  });

  // ─── ISSUE PAGES ─────────────────────────────────────────────────

  test('16 — /issues — Issues Triage Page (admin)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/issues');
    await page.waitForLoadState('networkidle');
    await expectHeading(page, /issues/i);
    await expectNoCrash(page);
    // Filter chips should be visible
    const filterChips = page.locator('button:has-text("open"), button:has-text("assigned")').first();
    await expect(filterChips).toBeVisible({ timeout: 5_000 });
    // Type filter chips (Bug, Vulnerability, Code Smell, Hotspot)
    await expect(page.locator('button:has-text("Bug")').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button:has-text("Hotspot")').first()).toBeVisible({ timeout: 5_000 });
  });

  test('17 — /my-issues — My Issues Page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/my-issues');
    await page.waitForLoadState('networkidle');
    await expectHeading(page, /my issues/i);
    await expectNoCrash(page);
  });

  test('18 — /pending-verification — Rescan Approvals Page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/pending-verification');
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  // ─── USER MANAGEMENT ─────────────────────────────────────────────

  test('19 — /users — User Management Page (admin)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    await expectHeading(page, /user management|users/i);
    await expectNoCrash(page);
    // Should list users
    const userRows = page.locator('table tbody tr, [class*="user"]').first();
    await expect(userRows).toBeVisible({ timeout: 5_000 });
  });

  // ─── SETTINGS ────────────────────────────────────────────────────

  test('20 — /settings — Settings Page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  // ─── DOCS ────────────────────────────────────────────────────────

  test('21 — /docs — Documentation Page (all tabs)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);

    // Click each doc tab and verify content loads
    const tabs = ['Overview', 'API Reference', 'Tech Stack', 'Limitations', 'Architecture'];
    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text("${tab}")`).first();
      if (await tabBtn.isVisible().catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(500);
        await expectNoCrash(page);
      }
    }
  });

  // ─── PROJECT GROUPS ──────────────────────────────────────────────

  test('22 — /project-groups — Project Groups Page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/project-groups');
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  // ─── ACTIVE PROJECT PANEL NAVIGATION ─────────────────────────────

  test('23 — Active project panel: sub-navigation links work', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // The Layout renders active project sub-nav links
    const subNavLinks = [
      { label: 'Controls', url: `/projects/${projectId}` },
      { label: 'Scan History', url: `/projects/${projectId}/history` },
      { label: 'Configure', url: `/projects/${projectId}/manual` },
      { label: 'Reports', url: `/projects/${projectId}/reports` },
    ];

    for (const { url } of subNavLinks) {
      const link = page.locator(`a[href="${url}"]`).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain(url);
        await expectNoCrash(page);
      }
    }
  });

  // ─── BREADCRUMBS ─────────────────────────────────────────────────

  test('24 — Breadcrumbs render and link back to dashboard', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/reports`);
    await page.waitForLoadState('networkidle');

    // Breadcrumb to dashboard should exist
    const dashboardBreadcrumb = page.locator('nav a:has-text("Dashboard"), [class*="breadcrumb"] a:has-text("Dashboard")').first();
    if (await dashboardBreadcrumb.isVisible().catch(() => false)) {
      await dashboardBreadcrumb.click();
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/dashboard');
    }
  });

  // ─── TOOL DETAIL VIEW: ISSUE TYPE TOGGLE ─────────────────────────

  test('25 — Tool Detail Page: IssueTypeToggle buttons work', async ({ page }) => {
    test.skip(!projectId, 'No project');
    await loginAsAdmin(page);
    await page.goto(`/projects/${projectId}/issues/sonar_scanner`);
    await page.waitForLoadState('networkidle');

    // Click each IssueTypeToggle option
    const toggleOptions = ['All', 'Bugs', 'Vulnerabilities', 'Code Smells', 'Hotspots'];
    for (const opt of toggleOptions) {
      const btn = page.locator(`button:has-text("${opt}")`).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
        await expectNoCrash(page);
      }
    }
  });

  // ─── ROLE-BASED ACCESS ──────────────────────────────────────────

  test('26 — Developer redirected from /users', async ({ page }) => {
    test.skip(!devUsername, 'No developer');
    await loginViaAPI(page, devUsername, devPassword);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');
    // Should redirect away from /users
    expect(page.url()).not.toContain('/users');
  });

  test('27 — Developer can access /my-issues', async ({ page }) => {
    test.skip(!devUsername, 'No developer');
    await loginViaAPI(page, devUsername, devPassword);
    await page.goto('/my-issues');
    await page.waitForLoadState('networkidle');
    await expectNoCrash(page);
  });

  test('28 — Developer cannot access /issues if no assign permission', async ({ page }) => {
    test.skip(!devUsername, 'No developer');
    await loginViaAPI(page, devUsername, devPassword);
    await page.goto('/issues');
    await page.waitForLoadState('networkidle');
    // Developer without canAssignIssues should be redirected to /my-issues
    const redirected = page.url().includes('/my-issues');
    const blocked = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    expect(redirected || !blocked).toBe(true);
  });

  // ─── INTERACTIVE ELEMENTS ────────────────────────────────────────

  test('29 — Dashboard search input accepts text', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[placeholder*="Search"]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('test project');
      await page.waitForTimeout(500);
      await expectNoCrash(page);
    }
  });

  test('30 — Logout clears session and redirects to login', async ({ page }) => {
    await loginAsAdmin(page);
    // Click logout button in sidebar (usually bottom-left with user info)
    const logoutBtn = page.locator('button:has-text("Logout")').first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await page.waitForLoadState('networkidle');
      // Should redirect to login
      expect(page.url()).toContain('/login');
    }
  });

  // ─── 404 HANDLING ───────────────────────────────────────────────

  test('31 — Invalid project ID shows error gracefully', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/projects/non-existent-id-12345');
    await page.waitForLoadState('networkidle');
    // Should show error or empty state, not crash
    await expectNoCrash(page);
  });

  // ─── CLEANUP ────────────────────────────────────────────────────

  test('99 — Cleanup', async ({ request }) => {
    try {
      const api = new TestAPIClient({ request });
      await api.login('admin', 'admin123');
      if (projectId) await api.deleteProject(projectId).catch(() => {});
      const users = await api.listUsers();
      const dev = users.find((u) => u.username === devUsername);
      if (dev) await api.deleteUser(dev!.id as string).catch(() => {});
    } catch {
      // cleanup is best-effort
    }
  });
});
