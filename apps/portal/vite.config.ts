import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite builds the React UI into dist/web. The Express server (in dist/server)
// serves dist/web statically in production. During dev, this Vite dev server
// proxies API calls to the Express process on :3001.
export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/web'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
});
