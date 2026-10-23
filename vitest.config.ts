import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Las pruebas de base de datos comparten una sola base: no correr archivos en paralelo.
    fileParallelism: false,
  },
});
