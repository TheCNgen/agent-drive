import { defineConfig, devices } from '@playwright/test';
import { config as appConfig } from 'dotenv';
appConfig({ path: '.env' });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // run sequentially to avoid auth race conditions during setup
  reporter: 'html',
  use: {
    baseURL: process.env.NEXT_PUBLIC_HOST_NAME || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: process.env.NEXT_PUBLIC_HOST_NAME || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
