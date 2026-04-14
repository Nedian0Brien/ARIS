import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.MOBILE_OVERFLOW_BASE_URL ?? 'http://127.0.0.1:3305',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        locale: 'ko-KR',
      },
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 13'],
        locale: 'ko-KR',
      },
    },
  ],
});
