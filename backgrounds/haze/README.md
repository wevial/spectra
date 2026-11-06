# Haze background

An ambient smoky glow, after the [AgentMail](https://console.agentmail.to)
console's page header. Two soft bands of smoke lean across a near-black warm
brown, bent by a slow wave and billowed by noise, under film grain, fading out
toward the edges. A background, not a cursor effect: it ignores the pointer.

```js
import { mount } from '@spectra/haze';

const haze = mount(document.querySelector('header'), { palette: 'dusk', fadeSide: 0 });
haze.config.warp = 0.8; // live tuning, picked up next frame
haze.destroy();
```

Palettes: `rainbow` (default), whose bands take a hue that sweeps across the
box and drifts over time; `ember`, the AgentMail look; `rose`, `teal`, and the
two-color `dusk` and `lagoon` (see `PALETTES`). `warp: 0` gives the original's
clean sine bands. See `DEFAULTS` in `src/index.ts` for every option.

## How it works

The original is a stack of [`shaders`](https://shaders.com) components on
three.js: two `SineWave` bands over a solid base, a `WaveDistortion` with
mirrored edges, and `FilmGrain`, with DOM scrims for the fades. This ports
that math to two WebGL2 passes:

1. **Glow**, at half CSS resolution into an RGBA16F target. Each band is a
   sine curve rotated to a lean, `thickness` wide with `smoothstep` edges
   `softness` wide; the bands slide along their sines at different speeds, so
   they morph over 15–60s. Before sampling them the uv is displaced twice: by
   the original's slow sine wave, and by fbm warped by fbm (`SMOKE` from
   `@spectra/core`), scaled by `warp`, which turns smooth bends into billows.
   Lengths are in units of the box height, capped at a quarter of its longer
   side, so a short wide header matches the original and a full screen still
   shows two bands rather than one.
2. **Composite**, at full resolution: the back band, then the front band,
   laid over the base in Oklab. Fades thin the result back to the base in
   Oklab too: an eased `pow` curve up from the bottom and a `pow` ramp from one
   side, shaped like the original's scrims. Then a slight vignette and film
   grain (`GRAIN` from `@spectra/core`): a per-pixel hash added in linear light and weighted toward the
   darks, so it reads as grain in the shadows without graying the smoke. It
   doesn't flicker per frame: two patterns crossfade over `grainPeriod`
   seconds, rescaled so the grain stays equally strong mid-fade.

The `ember` colors are what the header actually displays. The original hands
`#a83205` and `#e85d05` through a P3 conversion that lightens and softens them
on an sRGB canvas, so the palette stores the softened values.

It mounts drawn in the base color and fades the smoke in over 700ms.
Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`haze-fallback` class, for example:

```css
.haze-fallback {
  background:
    radial-gradient(28% 90% at 38% 30%, rgba(216, 102, 42, 0.5), transparent 70%),
    radial-gradient(25% 70% at 72% 55%, rgba(155, 59, 26, 0.45), transparent 70%),
    linear-gradient(transparent 30%, #120602 100%),
    #120602;
}
```

With `prefers-reduced-motion` the drift and grain freeze into one static
frame (redrawn only when the config or size changes) and the fade-in is
skipped.
