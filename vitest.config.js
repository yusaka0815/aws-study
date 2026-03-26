import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',   // localStorage等のブラウザAPIを使えるようにする
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['engine.js', 'storage.js'],
      reporter: ['text', 'html'],
    },
  },
});
