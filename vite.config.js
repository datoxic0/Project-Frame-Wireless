import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Important for Electron to resolve paths correctly
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
