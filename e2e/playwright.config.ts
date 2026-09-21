import { defineConfig, devices } from '@playwright/test';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:7201';
const API = process.env.E2E_API_URL ?? 'http://localhost:7200';

// Ten sam zestaw testów puszczamy też na wdrożonej aplikacji:
//   E2E_WEB_URL=https://druzynada.example.com E2E_API_URL=https://druzynada.example.com npm run e2e
// Wtedy nie ma czego uruchamiać lokalnie — serwery już stoją po drugiej stronie.
const local = WEB.includes('localhost') || WEB.includes('127.0.0.1');

/**
 * Testy uruchamiają się na żywej aplikacji: backend 7200, front 7201.
 * Jeśli usługi już chodzą (`docker compose up` albo `npm run dev`), Playwright
 * je reużywa zamiast startować własne.
 */
export default defineConfig({
  testDir: './tests',
  // Gra jest jedna i globalna, więc równoległe pliki deptałyby sobie po stanie
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: local
    ? [
    {
      command: 'npm run dev --workspace=@cue/backend',
      url: `${API}/api/health`,
      cwd: '..',
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm run dev --workspace=@cue/frontend',
      url: WEB,
      cwd: '..',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ]
    : [],
});
