# spectra

WebGL2 cursor effects and image filters, plus a gallery for testing them.

**[Gallery →](https://spectra.kovial.co)** (desktop, move your mouse through it)

| Effect | |
|---|---|
| [`cursors/glitch`](cursors/glitch) | Pixel-block tearing with an RGB split over a retro rainbow still life. Adapted from [macroscope.com](https://macroscope.com/) |
| [`cursors/dither`](cursors/dither) | A ringed planet in Bayer dither, lit from the cursor; the trail adds light and chunky pixels |
| [`cursors/blackhole`](cursors/blackhole) | Drag a black hole across a starfield: ray-marched lensing, photon ring, lensed accretion disk |
| [`cursors/lens`](cursors/lens) | An invisible mass under the cursor that gravitationally lenses any image, canvas or video |
| [`cursors/mycelium`](cursors/mycelium) | A Physarum network blooms into branching hyphae; your cursor trail is food it reroutes toward |
| [`cursors/nebula`](cursors/nebula) | A fluid-sim nebula you part with the mouse; it always heals back |
| [`cursors/aurora`](cursors/aurora) | Paint the northern lights: your trail becomes a curtain of rising, shimmering rays over a lake |
| [`cursors/riso`](cursors/riso) | Any image as a risograph print: spot-ink halftones on paper; the cursor knocks the layers out of register |
| [`cursors/filings`](cursors/filings) | Iron filings swing into field lines around a magnet you carry; click to pin magnets and combine fields |
| [`cursors/phosphor`](cursors/phosphor) | A vector CRT where the cursor is the electron beam: phosphor flash, long afterglow, bloom |

Every effect exports `mount(container, options) → { config, destroy }`. `config`
is live: change a field and the next frame uses it.

## Run

```sh
bun install
bun run dev        # gallery at http://localhost:5173
bun run typecheck
bun test
bun run build      # static site -> dist/
bun run deploy     # build + wrangler deploy (Cloudflare)
```

The gallery has a page per effect with a tuning panel. "copy changed options"
puts your tweaks on the clipboard as the options object for `mount()`.

## Layout

```
packages/core   WebGL2 helpers, stage (canvas, pointer, render loop, adaptive resolution), cursor trail, GLSL noise, content sources
cursors/*       one package per cursor effect
apps/gallery    Vite multi-page site, one page per effect
```

Adding an effect: create `cursors/<name>` exporting `mount`, add
`apps/gallery/<name>/index.html` and `src/pages/<name>.ts`, register it in
`vite.config.ts` and `EFFECTS` in `src/shell.ts`.

## License

MIT
