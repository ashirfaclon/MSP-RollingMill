import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/** Unit tests for the process twins' model, signal quality and geometry (`*.unit.test.ts`). */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@contracts': fileURLToPath(new URL('../backend/src/contracts/index.ts', import.meta.url)),
    },
  },
  test: { include: ['src/**/*.unit.test.ts'], environment: 'node' },
});
