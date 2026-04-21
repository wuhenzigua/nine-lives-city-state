import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoBase = '/nine-lives-city-state/';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves the production site under /<repo>/, while local
  // development should stay at the root path for convenience.
  base: command === 'build' ? repoBase : '/',
  plugins: [react()],
}));
