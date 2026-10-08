import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /<repo-name>/ — set by the deploy workflow.
  base: process.env.VITE_BASE_PATH || '/',
  server: { port: 5173 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
