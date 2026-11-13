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
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium needs a software renderer on machines without an exposed GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    // Opt-in engines: `npm run test:e2e:browsers` (needs `npx playwright install firefox webkit`).
    ...(process.env.PW_ALL
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          // The wider suite assumes a mouse and a wheel; phones run the touch spec only.
          {
            name: 'mobile-safari',
            testMatch: /camp-touch\.spec\.ts/,
            use: { ...devices['iPhone 14'] },
          },
        ]
      : []),
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
