# Aurora cursor

Paint the northern lights. Your cursor's trail becomes the lower edge of an
aurora curtain: rays rise from your path, green at the base and pink higher up,
then shimmer, sway and slowly fade. Faint ambient curtains drift behind, over a
dark lake and a spruce treeline that reflect it all.

```js
import { mount } from '@spectra/aurora';

const aurora = mount(document.querySelector('#hero'), { palette: 'violet', landscape: false });
aurora.config.rise = 0.5; // live tuning, picked up next frame
aurora.destroy();
```

Palettes: `boreal`, `violet`, `ice` (see `PALETTES`). Set `ambient: 0` for only
what you paint. See `DEFAULTS` in `src/index.ts` for every option.

## How it works

Two passes after the shared cursor trail (`@spectra/core`'s `Trail`):

1. **Aurora**, at half CSS resolution. Painted curtain: each pixel looks
   straight down for trail energy below it, so the curtain is the trail
   extruded upward. Samples bunch up near the base for a crisp lower edge;
   height sets the color and a falloff; drifting noise in x makes the rays.
   Ambient curtains: thin vertical sheets standing on wavy lines across the
   ground. The view ray's crossing with each sheet is solved by fixed-point
   iteration; the altitude there sets the color, and grazing angles (looking
   along a fold) glow brightest.
2. **Composite**, at full resolution: sky gradient, twinkling stars,
   mountains and procedural spruces, the aurora on top, and everything above
   the horizon mirrored into the lake with ripples.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`aurora-fallback` class. Mouse only. With `prefers-reduced-motion` the drift
and shimmer freeze; painting still works.
