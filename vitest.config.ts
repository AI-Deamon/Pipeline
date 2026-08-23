import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Only unit/component tests under src/. The e2e/ directory holds Playwright specs,
    // which must NOT be collected by vitest (their `test.afterAll` etc. throw here).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'e2e/**', 'playwright.config.*'],
  },
})
