import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: !process.env.HEADED ? false : false,
    viewport: { width: 1280, height: 800 },
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
