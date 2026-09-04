import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    // Some tests shell out to real git (git-diff-tracer) or probe remotes
    // (source-resolver); 5s is too tight on slower machines and flakes under
    // parallel load. Give them headroom so the suite is reliably green.
    testTimeout: 20000,
    globalSetup: ['./tests/setup.ts'],
  },
});
