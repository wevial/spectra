# Caustics background

Sunlight through moving water: a web of thin, bright lines around rounded
cells, re-forming as the waves travel. By default it glows on black, the
light splitting into a spectrum at the edges of each line and burning white
at the cores; the other palettes put it on a pool floor. A background, not a
cursor effect: it ignores the pointer.

```js
import { mount } from '@spectra/caustics';

const water = mount(document.querySelector('#hero'), { palette: 'pool', depth: 0.7 });
water.config.speed = 0.3; // live tuning, picked up next frame
water.destroy();
```

Palettes (see `PALETTES`), each a floor in shade and a sunlight color:
`pool`, `lagoon`, `shallows`, `abyss` and `noir`, plus two that draw
glowing light on black: `rainbow` and `prism` (default). Those draw the light as
colored layers instead of seven wavelengths, each the same web phase-shifted
a little further, so the layers split apart at the edges of the lines and
add back up to white at their cores. `rainbow` uses five saturated ribbons
(red, orange, green, blue, violet), so its fringes are distinct bands;
`prism` uses a twelve-step spectrum, so its fringes are one smooth gradient.
In both, `dispersion` sets how far apart the layers drift, and the palette
adds its own contrast so the cells stay black. `depth` sets how
crisp the web is, `sharpness` how thin its lines and how dark its cells,
`scale` the cell size. `dispersion` 1 is real water; the default 7
exaggerates the fringes so they survive the blur. See `DEFAULTS` in
`src/index.ts` for every option.

## How it works

Real caustics, not a noise texture. Three stages:

1. **Light**, at full drawing-buffer resolution into a 4× multisampled
   RGBA16F target with additive blending, then resolved to a texture. The
   water surface is nine travelling sine waves, spread over every direction
   by the golden angle, with wavelengths from 0.32 down to 0.11 units.
   Focusing comes from curvature (steepness × wavenumber), so at equal
   steepness the shortest waves draw a two-axis grid, and a narrow band
   draws a lattice of equal cells. Instead steepness rises with the square
   root of the wavelength, so every wave shapes the cells and they come out
   irregular, 3–4× apart in size. Speeds follow deep-water dispersion, so
   the web keeps re-forming instead of sliding. A dense mesh of the surface
   (one cell per ~3 CSS pixels, overhanging the box so no gap pulls in from
   the edge) is drawn where each vertex's sunbeam lands on the floor after
   refracting. Brightness is 1 / det of that mapping's Jacobian, I + c·H
   with H the waves' analytic Hessian, interpolated per fragment so peaks
   run smoothly along the lines, and softened near zero so a peak tops out
   instead of plateauing. Past the focal depth light folds over itself,
   which is what makes lines cross, double up and pinch into lenses at
   junctions. Left alone, folds grow into wide flat bands with hard edges,
   so focusing is soft-capped with a tanh on the Hessian's most negative
   eigenvalue at 1.5× the fold point: the strongest crests overshoot into
   thin doubled lines, and the rest flattens. The mesh is drawn once per
   wavelength (seven, 420–690 nm), each with water's index of refraction at
   that wavelength (a Cauchy fit) and its share of white light from the CIE
   1931 curves (`wavelengthToRgb` from `@spectra/film`), so flat water
   lights the floor exactly white.
2. **Blur**: a separable Gaussian (σ 0.75 CSS px, linear-sampling taps)
   stands in for the sun's disk and softens what fold edges remain. A
   quarter-resolution copy, clamped and blurred wide (σ ~10 CSS px), is the
   glow; it's far wider than its texels, so it never shows blocks.
3. **Composite**, at full resolution: a mottled floor plus the light through
   a contrast curve (a power, `sharpness`, that thins the lines and sinks
   the cells, plus some linear light to keep the cells lit) and the glow.
   Highlights roll off past a knee toward white, so colored sunlight still
   burns out at the line cores. Then a slight vignette and film grain
   (`GRAIN` from `@spectra/core`).

It mounts drawn in the floor color and fades the light in over 900ms.
Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`caustics-fallback` class. With `prefers-reduced-motion` the water freezes
into one static frame (redrawn only when the config or size changes).
