import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  }
});
