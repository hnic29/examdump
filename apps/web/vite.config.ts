import { defineConfig } from 'vite';
// The @shared alias resolver settings drop export-map info for this CJS/ESM interop package.
// eslint-disable-next-line import/default
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../../packages/shared/src') },
  },
  server: {
    port: 5183,
  },
});
