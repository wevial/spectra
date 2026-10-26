# Black hole cursor

The cursor drags a black hole across a starfield. Light bends around it: a
black shadow, a thin photon ring, stars smeared into arcs, and an accretion
disk whose far side is lensed into an arc over and under the hole. The side of
the disk orbiting toward you is brighter (Doppler beaming). Moving fast leaves
a wake that drags the stars along your path.

```js
import { mount } from '@spectra/blackhole';

const hole = mount(document.querySelector('#hero'), { size: 0.1, tilt: 0.1 });
hole.config.disk = 1.5; // live tuning, picked up next frame
hole.destroy();
```

See `DEFAULTS` in `src/index.ts` for every option.

## How it works

One pass after the shared cursor trail (`@spectra/core`'s `Trail`), in units
of the Schwarzschild radius:

- **Near the hole** (impact parameter under 14), each pixel's ray is marched
  through the Schwarzschild photon equation `a = -1.5 h² r / |r|⁵`. The shadow,
  photon ring and lensed disk all come out of the integration. Disk crossings
  are composited front to back with differential rotation, a blackbody-ish
  temperature ramp, and Doppler beaming (`g³`).
- **Far from it**, the deflection is analytic to second order
  (`2/b + 15π/16 · 1/b²`), which meets the marched rays without a seam.
- **Escaping rays** sample a procedural sky (nebula + three star layers) by
  direction; the cursor trail offsets that lookup for the wake.

It's the heaviest effect in spectra, so the stage caps DPR at 1.5.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`blackhole-fallback` class. Mouse only; with no cursor the hole drifts near
center. With `prefers-reduced-motion`, the disk spin and twinkle freeze; the
hole still follows the cursor.
