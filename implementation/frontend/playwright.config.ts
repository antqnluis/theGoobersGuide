import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

const localEnv = loadEnv('development', process.cwd(), 'VITE_')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      VITE_SUPABASE_URL: localEnv.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY:
        localEnv.VITE_SUPABASE_PUBLISHABLE_KEY || 'e2e-local-publishable-key',
    },
  },
})
