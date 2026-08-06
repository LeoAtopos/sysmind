import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  base: './',
  resolve: {
    // motion/react must share the renderer's React singleton or its hooks fail at runtime.
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Keep Tauri development separate from the root project's Vite server.
    port: 1420,
    host: '127.0.0.1',
    strictPort: true,
  },
});
