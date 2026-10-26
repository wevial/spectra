import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// One HTML entry per effect, so every effect has a real URL (/glitch/, /nebula/)
// and the deployed site needs no SPA fallback.
export default defineConfig({
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: page('index.html'),
        glitch: page('glitch/index.html'),
        nebula: page('nebula/index.html'),
      },
    },
  },
});
