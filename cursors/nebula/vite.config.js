import { defineConfig } from 'vite';

// Served from https://wevial.github.io/nebula-cursor/ on GitHub Pages, so the
// built asset URLs need that base. Local dev/preview stay at '/'.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/nebula-cursor/' : '/',
});
