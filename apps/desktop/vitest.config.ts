import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../../packages/shared/src') },
  },
  test: {
    name: 'desktop',
    environment: 'node',
    globals: true,
  },
});
