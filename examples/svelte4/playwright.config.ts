import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4567',
    trace: 'on-first-retry',
    testIdAttribute: 'data-test-id',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm run story:preview',
    url: 'http://localhost:4567',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
