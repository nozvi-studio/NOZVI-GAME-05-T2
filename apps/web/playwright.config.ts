import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  // Each test renders the furnished room and avatars with software WebGL; parallel workers
  // starve each other (and low-RAM machines) into timeouts.
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    viewport: { width: 1280, height: 720 },
    // Headless Chromium has no GPU here; force SwiftShader WebGL so Three.js can render.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    // Dedicated port so e2e never reuses another project's dev server on 5173.
    command: 'pnpm dev --host 127.0.0.1 --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
