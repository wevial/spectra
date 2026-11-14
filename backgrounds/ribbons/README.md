# Ribbons background

A few translucent ribbons of colored light ripple across a black field. Each
pinches to a point at both ends, they cross over each other, and where they
overlap the light adds up toward white. They glow and breathe slowly. A
background, not a cursor effect: it ignores the pointer.

```js
import { mount } from '@spectra/ribbons';

const ribbons = mount(document.querySelector('header'), { palette: 'silver', placement: 'full' });
ribbons.config.count = 5; // live tuning, picked up next frame
ribbons.destroy();
```

Palettes: `flare` (default), warm red and orange against cool blue and cyan;
`spectrum`, hues around the wheel; `silver`, near-white with faint spectral
edges; `lagoon`; `orchid` (see `PALETTES`). `placement: 'center'` keeps the
ribbons in a band in the middle of the box; `'full'` runs them edge to edge.
See `DEFAULTS` in `src/index.ts` for every option.

## How it works

Everything is analytic: no geometry and no ribbon textures, just a function
of the pixel's position, evaluated per pixel.

1. **Ribbons.** x runs -1..1 between two pinch points. A lens envelope
   e(x) = 1 − x² carries both the centerline (two sines, `amplitude` tall,
   fanned apart by `spread`) and the thickness (e^1.25, plus a slow swell
   running along the ribbon), so each ribbon is thickest in the middle and
   tapers to nothing at the shared ends. Frequencies, phases and drift
   speeds differ per ribbon and are incommensurate, so the braid keeps
   re-forming; amplitude and thickness breathe on 10–30s periods.
2. **Cross-section.** The distance to a ribbon is its vertical offset
   divided by √(1 + slope²), the perpendicular distance to first order, so
   steep stretches keep their width. The profile is soft-edged and brighter
   toward the rim than the middle, like light grazing the edge of a
   translucent tube. Every edge is smoothed over `fwidth` of that distance,
   one pixel, so nothing aliases at any size or DPR; a ribbon thinner than a
   pixel is drawn a pixel wide and dimmed in proportion, so the pinched ends
   fade out instead of crawling.
3. **Light.** Ribbons add in linear light. Where they overlap, an extra
   white term grows with the overlap; a shoulder rolls highlights off and
   bleeds what spills past one channel into the others, so hot crossings go
   white, not neon, while lone ribbons stay saturated. Red rides a touch
   above each centerline and blue a touch below: a faint prism fringe on the
   edges that whitens out in the middle (stronger for `silver`).
4. **Bloom.** The same function, drawn at quarter CSS resolution, seeds two
   separable Gaussian blurs: a tight halo there (σ ≈ 10 CSS px) and a wide
   glow at eighth resolution (σ ≈ 45 CSS px). Both are blurred well past
   their texel size, so bilinear upsampling never shows blocks. Sized from
   CSS pixels, the glow looks the same at any DPR.
5. **Finish.** Pure black under film grain (`GRAIN` from `@spectra/core`).

It mounts black and fades the ribbons in over 1.2s. Requires WebGL2 +
`EXT_color_buffer_float`; otherwise the container gets the
`ribbons-fallback` class, for example:

```css
.ribbons-fallback {
  background:
    radial-gradient(34% 7% at 46% 47%, rgba(255, 70, 30, 0.55), transparent 70%),
    radial-gradient(34% 7% at 54% 53%, rgba(40, 120, 255, 0.55), transparent 70%),
    radial-gradient(20% 4% at 50% 50%, rgba(255, 255, 255, 0.5), transparent 70%),
    radial-gradient(45% 20% at 50% 50%, rgba(120, 90, 160, 0.18), transparent 70%),
    #000;
}
```

With `prefers-reduced-motion` the drift, breathing and grain freeze into one
static frame (redrawn only when the config or size changes) and the fade-in
is skipped.
