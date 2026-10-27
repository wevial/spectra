import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// One HTML entry per effect, so every effect has a real URL (/glitch/, /nebula/)
// and the deployed site needs no SPA fallback.
export default defineConfig({
  // Reachable over the tailnet (tailscale serve) from other devices.
  server: { allowedHosts: ['.ts.net'] },
  preview: { allowedHosts: ['.ts.net'] },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: page('index.html'),
        glitch: page('glitch/index.html'),
        dither: page('dither/index.html'),
        blackhole: page('blackhole/index.html'),
        lens: page('lens/index.html'),
        mycelium: page('mycelium/index.html'),
        nebula: page('nebula/index.html'),
        aurora: page('aurora/index.html'),
        riso: page('riso/index.html'),
        filings: page('filings/index.html'),
        phosphor: page('phosphor/index.html'),
        droplet: page('droplet/index.html'),
      },
    },
  },
});
