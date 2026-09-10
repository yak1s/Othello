import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// This environment ships a Chromium older than the build @playwright/test pins,
// so point at it rather than downloading a second copy.
const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome']
  .find((p) => existsSync(p));

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: CHROME ? { executablePath: CHROME } : {},
    // The manual peer-to-peer test needs two real WebRTC endpoints in one
    // browser, which is what these let it do without a camera or a prompt.
    permissions: [],
  },
  webServer: {
    // The service worker only exists in a production build, and the offline
    // test is meaningless without it.
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
