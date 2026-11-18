# spectra

WebGL2 cursor effects and ambient backgrounds, plus a gallery for testing them.

**[Gallery →](https://spectra.kovial.co)** (desktop, move your mouse through it)

### Cursors

React to the mouse.

| Effect | |
|---|---|
| [`cursors/glitch`](cursors/glitch) | Pixel-block tearing with an RGB split over a retro rainbow still life. Adapted from [macroscope.com](https://macroscope.com/) |
| [`cursors/dither`](cursors/dither) | A ringed planet in Bayer dither, lit from the cursor; the trail adds light and chunky pixels |
| [`cursors/blackhole`](cursors/blackhole) | Drag a black hole across a starfield: ray-marched lensing, photon ring, lensed accretion disk |
| [`cursors/lens`](cursors/lens) | An invisible mass under the cursor that gravitationally lenses any image, canvas or video |
| [`cursors/mycelium`](cursors/mycelium) | A Physarum network blooms into branching hyphae; your cursor trail is food it reroutes toward |
| [`cursors/nebula`](cursors/nebula) | A fluid-sim nebula you part with the mouse; it always heals back |
| [`backgrounds/caustics`](backgrounds/caustics) | Sunlight through moving water: a web of white-hot lines on black that split into a spectrum at their edges, or on a pool floor |
| [`cursors/aurora`](cursors/aurora) | Paint the northern lights: your trail becomes a curtain of rising, shimmering rays over a lake |
| [`cursors/riso`](cursors/riso) | Any image as a risograph print: spot-ink halftones on paper; the cursor knocks the layers out of register |
| [`cursors/filings`](cursors/filings) | Iron filings swing into field lines around a magnet you carry; click to pin magnets and combine fields |
| [`cursors/film`](cursors/film) | Holographic cracked-ice window film with the cursor as the sun: pastel shards and a burst of spectral rainbow dashes |
| [`cursors/wisp`](cursors/wisp) | The interactive haze: your cursor stirs smoky rainbow haze, pushing it along the stroke and lighting it where you pass |

### Backgrounds

No cursor.

| Effect | |
|---|---|
| [`backgrounds/haze`](backgrounds/haze) | An ambient smoky glow after the AgentMail console header: two leaning bands of rainbow smoke over warm black, film grain, edge fades |
| [`backgrounds/plume`](backgrounds/plume) | The nebula's gas as wet paint in eight palettes: invisible brushes pull lanes through it on their own, and it always heals back |
| [`backgrounds/ribbons`](backgrounds/ribbons) | Translucent ribbons of colored light ripple across black, pinched at both ends, crossing and adding up to white where they overlap |
| [`backgrounds/lava`](backgrounds/lava) | A lava lamp simulated as two fluids: heated wax rises in plumes that neck and pinch off, rounds into blobs, cools, drips and sinks back |
| [`backgrounds/hyphae`](backgrounds/hyphae) | The mycelium network on its own: a glowing fungal web on near-black grows toward drifting, invisible food, fuses, thins and retreats |

Every effect exports `mount(container, options) → { config, destroy }`. `config`
is live: change a field and the next frame uses it.

Backgrounds also take `transparent: true` (fixed at mount): instead of painting
their own ground they draw over whatever page sits behind the canvas, with
alpha from the light at each pixel. On a dark page they look the same; on a
light one their colors tint it (white light on a white page vanishes). The
gallery's `page` folder toggles it and switches the page between dark and light.

## Run

```sh
bun install
bun run dev        # gallery at http://localhost:5173
bun run typecheck
bun test
bun run capture    # re-record home-page previews (all, or name some)
bun run build      # static site -> dist/
bun run deploy     # build + wrangler deploy (Cloudflare)
```

The gallery has a page per effect with a tuning panel. "copy changed options"
puts your tweaks on the clipboard as the options object for `mount()`.

## Layout

```
packages/core   WebGL2 helpers, stage (canvas, pointer, render loop, adaptive resolution), cursor trail, GLSL chunks (noise, smoke, Oklab, film grain), content sources
cursors/*       one package per cursor effect
backgrounds/*   one package per ambient background (no pointer)
apps/gallery    Vite multi-page site, one page per effect
```

Adding an effect: create `cursors/<name>` (or `backgrounds/`) exporting `mount`, add
`apps/gallery/<name>/index.html` and `src/pages/<name>.ts`, register it in
`vite.config.ts` and `src/effects.ts`, add its card to `index.html`, and record
its preview with `bun run capture <name>`.

The home page shows each effect as a recorded loop (`apps/gallery/public/previews`)
and mounts the real one only while its card is hovered, so it never holds
more than one WebGL context. `bun run capture` records them deterministically in
headless Chromium (needs FFmpeg with libvpx and libx264); `bun test` checks every
effect has one within budget.

## License

MIT
