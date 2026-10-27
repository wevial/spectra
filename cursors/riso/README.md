# Riso cursor

Any image, canvas or video printed as a risograph: separated into two or
three spot inks, screened as grainy halftones at different angles and
overprinted on warm paper, slightly out of register. Moving the cursor knocks
the ink layers further apart along your path; they settle back as the trail
fades. Without content it prints a sunset poster.

```js
import { mount } from '@spectra/riso';

const riso = mount(document.querySelector('#hero'), { source: '/photo.jpg', inks: 'duo' });
riso.config.dot = 8;         // live tuning, picked up next frame
await riso.setSource(video); // or a canvas, ImageBitmap, URL; null for the poster
riso.destroy();
```

Ink sets: `pop` (fluorescent pink, blue, yellow), `duo`, `grove`, `sunset`,
`mono` (see `INKS`). See `DEFAULTS` in `src/index.ts` for every option.

## How it works

One pass after the shared cursor trail (`@spectra/core`'s `Trail`).

- **Separation.** Colors are converted to optical density relative to the
  paper (−log of linear RGB). Each ink has a density too, and a color is
  approximated as a weighted sum of ink densities. The weights come from a
  least-squares solve, `(AᵀA)⁻¹Aᵀ`, computed once per ink set on the CPU
  (`separation()`, unit-tested).
- **Screening.** Each ink gets a Euclidean-dot halftone at its own angle (15°,
  75°, 45°). The threshold is jittered by speckle and mottling, with slow
  starved bands, which gives the uneven riso drum look.
- **Print.** Layers multiply over paper fibers. Each layer samples the image
  at its own offset: a small resting misregistration plus the cursor push
  along the trail's heading.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`riso-fallback` class. Mouse only.
