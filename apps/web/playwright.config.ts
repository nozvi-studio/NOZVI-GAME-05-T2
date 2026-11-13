import { defineConfig } from '@playwright/test';

// Dedicated ports so e2e never reuses another project's dev server (5173) or game server (2567).
const WEB_PORT = 5180;
const SERVER_PORT = 2580;

export default defineConfig({
  testDir: 'e2e',
  // Each test renders the furnished room and avatars with software WebGL; parallel workers
  // starve each other (and low-RAM machines) into timeouts.
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    viewport: { width: 1280, height: 720 },
    // Headless Chromium has no GPU here; force SwiftShader WebGL so Three.js can render.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  // There is no offline mode: the game server runs next to the web dev server. Its join
  // rate limit is 10 joins per minute per address, so keep the suite's joins under that.
  webServer: [
    {
      command: 'pnpm --filter @office/server start',
      url: `http://127.0.0.1:${SERVER_PORT}/health`,
      env: { PORT: String(SERVER_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm dev --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { VITE_SERVER_URL: `http://127.0.0.1:${SERVER_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
