import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(() => {
  const isStryker = process.env.STRYKER_MUTATION === '1';

  return {
    plugins: [react({ jsxRuntime: 'automatic' })],
    esbuild: {
      sourcemap: isStryker ? false : undefined,
    },
    build: {
      sourcemap: isStryker ? false : undefined,
      rollupOptions: isStryker ? {
        output: {
          sourcemap: false,
        }
      } : undefined,
    },
    optimizeDeps: {
      esbuildOptions: {
        sourcemap: isStryker ? false : undefined,
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: isStryker
        ? ['./src/tests/stryker-vite-shim.ts', './src/tests/setup.ts']
        : ['./src/tests/setup.ts'],
      // Use threads pool for Stryker to avoid birpc race conditions
      pool: isStryker ? 'threads' : 'forks',
      poolOptions: {
        forks: {
          singleFork: false,
        },
        threads: {
          singleThread: isStryker ? true : false,
        },
      },
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: [
          'src/**/*.test.ts',
          'src/**/*.test.tsx',
          'src/tests/**',
          'src/vite-env.d.ts',
          'src/manifest.json',
        ],
        thresholds: {
          lines: 40,
          functions: 40,
          branches: 30,
          statements: 40,
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
  };
});
