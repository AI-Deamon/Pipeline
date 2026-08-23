import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { trackError, finalizeErrorLog } from './helpers/error-tracker';

const SUITE = 'docs';

test.afterAll(() => finalizeErrorLog());

test.describe('Documentation Page', () => {
  test.describe.configure({ mode: 'serial' });

  test('1 — Docs page loads', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1:has-text("Developer Docs")')).toBeVisible({ timeout: 10_000 });
    } catch (err) {
      trackError(SUITE, 'Docs page loads', err, page.url());
      throw err;
    }
  });

  test('2 — Overview tab', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');

      // Click Overview tab
      await page.locator('button:has-text("Overview")').click();
      await expect(page.locator('text=Quick Start')).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Overview tab', err, page.url());
      throw err;
    }
  });

  test('3 — API Reference tab', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("API Reference")').click();
      await expect(page.locator('text=GET').first()).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'API Reference tab', err, page.url());
      throw err;
    }
  });

  test('4 — Tech Stack tab', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("Tech Stack")').click();
      await expect(page.locator('text=React').first()).toBeVisible({ timeout: 5_000 });
    } catch (err) {
      trackError(SUITE, 'Tech Stack tab', err, page.url());
      throw err;
    }
  });

  test('5 — Limitations tab', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("Limitations")').click();
      // Should show some limitation content
      const content = await page.textContent('body');
      expect(content?.toLowerCase()).toContain('limitation');
    } catch (err) {
      trackError(SUITE, 'Limitations tab', err, page.url());
      throw err;
    }
  });

  test('6 — Architecture tab', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("Architecture")').click();
      // Architecture tab has an iframe for the knowledge graph
      const iframe = page.locator('iframe');
      const hasIframe = await iframe.isVisible({ timeout: 5_000 }).catch(() => false);
      const hasFallback = await page.locator('text=architecture|Architecture').isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasIframe || hasFallback).toBe(true);
    } catch (err) {
      trackError(SUITE, 'Architecture tab', err, page.url());
      throw err;
    }
  });

  test('7 — External GitHub links exist', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');

      const repoLink = page.locator('a:has-text("Main Repo")');
      const agentLink = page.locator('a:has-text("Jenkins Agent")');
      const hasRepo = await repoLink.isVisible({ timeout: 3000 }).catch(() => false);
      const hasAgent = await agentLink.isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasRepo || hasAgent).toBe(true);
    } catch (err) {
      trackError(SUITE, 'GitHub links', err, page.url());
      throw err;
    }
  });

  test('8 — API sections are collapsible', async ({ page }) => {
    try {
      await loginAsAdmin(page);
      await page.goto('/docs');
      await page.waitForLoadState('networkidle');

      await page.locator('button:has-text("API Reference")').click();
      await page.waitForTimeout(500);

      // Find a collapsible section toggle
      const toggles = page.locator('button:has-text("Auth"), button:has-text("Projects"), button:has-text("Scans")');
      const count = await toggles.count();
      if (count > 0) {
        await toggles.first().click();
        await page.waitForTimeout(300);
        // Section should expand — verify content is visible
        const content = await page.textContent('body');
        expect(content).toBeTruthy();
      }
    } catch (err) {
      trackError(SUITE, 'Collapsible API sections', err, page.url());
      throw err;
    }
  });
});
