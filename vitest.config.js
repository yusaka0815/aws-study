import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/engine.js', 'src/storage.js'],
      reporter: ['text', 'html'],
    },
  },
});
