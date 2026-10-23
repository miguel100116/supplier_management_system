import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: '4173', NODE_ENV: 'production',
      VITE_SUPABASE_URL: 'http://127.0.0.1:4174', SUPABASE_URL: 'http://127.0.0.1:4174',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-key',
      SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
      VITE_AZURE_CLIENT_ID: '', VITE_AZURE_TENANT_ID: '', VITE_AZURE_REDIRECT_URI: '',
      VITE_DEPLOYMENT_ENV: 'staging',
    },
  },
});
