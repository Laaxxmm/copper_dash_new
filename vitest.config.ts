import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Next runtime markers not resolvable under vitest — stub them out.
      'server-only': fileURLToPath(new URL('./tests/empty-module.js', import.meta.url)),
      'client-only': fileURLToPath(new URL('./tests/empty-module.js', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
