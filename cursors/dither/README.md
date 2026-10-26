# Dither cursor

A ringed planet over a starfield, rendered in ordered (8×8 Bayer) dither to a
four-stop palette. The light follows your cursor, so the terminator swings as
you move. The cursor's trail paints light into the dither and coarsens the
cells into chunky pixels that settle back as it fades.

```js
import { mount } from '@spectra/dither';

const dither = mount(document.querySelector('#hero'), { palette: 'paper', levels: 2 });
dither.config.pixel = 4; // live tuning, picked up next frame
dither.destroy();
```

Palettes: `spectra`, `moon`, `phosphor`, `paper` (see `PALETTES`). `levels: 2`
is 1-bit; higher values dither between more tones. See `DEFAULTS` in
`src/index.ts` for every option.

## How it works

One pass after the shared cursor trail (`@spectra/core`'s `Trail`). Each
pixel finds its dither cell: the base cell grows by whole steps where the
trail's energy is high. The scene (haze, stars, banded planet, ring) is
evaluated once per cell at its center, lit by the eased cursor direction, then
quantized with the Bayer threshold for that cell and mapped through the
palette.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`dither-fallback` class. Mouse only. With `prefers-reduced-motion`, the spin,
twinkle and idle light orbit freeze; the cursor still responds.
