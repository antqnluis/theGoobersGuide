import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

const localEnv = loadEnv('development', process.cwd(), 'VITE_')

// Performance runs measure the production bundle, one test at a time, so numbers are not
// disturbed by neighbouring workers. The mocked API (e2e/support/campMocks.ts) allows the
// preview origin below, so the port matches the main config.
export default defineConfig({
  testDir: './e2e/perf',
  testMatch: '*.perf.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 240_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: localEnv.VITE_SUPABASE_URL || 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY:
        localEnv.VITE_SUPABASE_PUBLISHABLE_KEY || 'e2e-local-publishable-key',
    },
  },
})
