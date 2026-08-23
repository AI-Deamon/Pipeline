import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Configuration for Sentinel DevSecOps Platform.
 *
 * Usage:
 *   npx playwright test                          # Run all E2E tests
 *   npx playwright test e2e/rbac.spec.ts         # Run single suite
 *   npx playwright test --headed                 # Watch in browser
 *   npx playwright test --reporter=html          # Generate HTML report
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,                // Serial by default — tests share state
  retries: 0,                          // Fail fast for CI triage
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e/playwright-report' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Uncomment to auto-start the dev server before tests:
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  */
});
