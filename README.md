# spectra

WebGL2 cursor effects and image filters, plus a gallery for testing them.

**[Gallery →](https://spectra.kovial.co)** (desktop, move your mouse through it)

| Effect | |
|---|---|
| [`cursors/glitch`](cursors/glitch) | Pixel-block tearing with an RGB split over a retro rainbow still life. Adapted from [macroscope.com](https://macroscope.com/) |
| [`cursors/dither`](cursors/dither) | A ringed planet in Bayer dither, lit from the cursor; the trail adds light and chunky pixels |
| [`cursors/nebula`](cursors/nebula) | A fluid-sim nebula you part with the mouse; it always heals back |

Every effect exports `mount(container, options) → { config, destroy }`. `config`
is live: change a field and the next frame uses it.

## Run

```sh
bun install
bun run dev        # gallery at http://localhost:5173
bun run typecheck
bun run build      # static site -> dist/
bun run deploy     # build + wrangler deploy (Cloudflare)
```

The gallery has a page per effect with a tuning panel. "copy changed options"
puts your tweaks on the clipboard as the options object for `mount()`.

## Layout

```
packages/core   WebGL2 helpers, stage (canvas, pointer, render loop), cursor trail, GLSL noise
cursors/*       one package per cursor effect
apps/gallery    Vite multi-page site, one page per effect
```

Adding an effect: create `cursors/<name>` exporting `mount`, add
`apps/gallery/<name>/index.html` and `src/pages/<name>.ts`, register it in
`vite.config.ts` and `EFFECTS` in `src/shell.ts`.

## License

MIT
