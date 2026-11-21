import { defineConfig } from '@playwright/test';
import { SERVER_PORT, SERVER_URL, WEB_PORT } from './e2e/ports';

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
  // There is no offline mode: the game server runs next to the web dev server. The join
  // limit is raised because every spec and its headless bots join from one address.
  webServer: [
    {
      command: 'pnpm --filter @office/server start',
      url: `http://127.0.0.1:${SERVER_PORT}/health`,
      // T-1697: chat messages live CHAT_TTL_SECONDS (60 s shipped) so chat.spec sees expiry quickly.
      env: { PORT: String(SERVER_PORT), JOIN_LIMIT_PER_MINUTE: '1000', CHAT_TTL_SECONDS: '20' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm dev --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      // The fake TV player keeps e2e off youtube.com (T-1140); the e2e render quality keeps
      // costly effects off under software WebGL (T-1146).
      env: { VITE_SERVER_URL: SERVER_URL, VITE_TV_PLAYER: 'fake', VITE_RENDER_QUALITY: 'e2e' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
