/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1',
    // Tomas's data core (FastAPI). If it is down, src/data/http.ts falls back to the static files.
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
    // bundle the heavy deps up front and pre-transform the station so the first load is fast
    warmup: { clientFiles: ['./src/main.tsx', './src/station/StationApp.tsx', './src/station/frame.tsx', './src/station/BodyCanvas.tsx'] },
  },
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei', 'framer-motion', 'react', 'react-dom', 'react-router-dom', 'zustand'],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
