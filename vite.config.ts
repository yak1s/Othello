import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// The audio tuner (brief §10) is a real page during development and must not
// exist in the production bundle. It is only registered as an entry when
// building with `--mode tuner`, which we never do for a release build.
export default defineConfig(({ mode }) => {
  const input: Record<string, string> = { main: resolve(__dirname, 'index.html') };
  if (mode === 'tuner') input.tuner = resolve(__dirname, 'dev/audio/index.html');

  return {
    base: './',
    build: {
      target: 'es2020',
      cssTarget: 'chrome80',
      modulePreload: { polyfill: false },
      assetsInlineLimit: 0,
      reportCompressedSize: true,
      rollupOptions: { input },
    },
    worker: { format: 'es' as const },
    server: { port: 5173, host: true },
    preview: { port: 4173, host: true },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
      testTimeout: 180_000,
    },
  };
});
