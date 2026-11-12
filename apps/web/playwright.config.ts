import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  // Each test renders the furnished room and avatars with software WebGL; parallel workers
  // starve each other (and low-RAM machines) into timeouts.
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
    // Headless Chromium has no GPU here; force SwiftShader WebGL so Three.js can render.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
