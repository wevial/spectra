# Filings cursor

Iron filings scattered on paper, with a bar magnet under it that follows the
cursor and turns to face the way you move. Filings swing into field lines
once the field is strong enough to beat their friction, and stay put when it
fades, so the path you drew stays imprinted. Click to pin a magnet where you
are; pinned fields add up.

```js
import { mount } from '@spectra/filings';

const filings = mount(document.querySelector('#hero'), { paper: '#ffffff' });
filings.config.strength = 5; // live tuning, picked up next frame
filings.shake();             // scatter them again
filings.clear();             // remove pinned magnets
filings.destroy();
```

See `DEFAULTS` in `src/index.ts` for every option.

## How it works

One filing per grid cell, kept in a state texture: its offset within the cell
and its angle. Each frame, an update pass:

- sums the field of every magnet (two opposite 2D point poles each);
- turns each filing toward the field line, the short way round (filings have
  no head or tail), at a rate that is zero below `friction`;
- nudges strong-field filings up the gradient of |B|², the way soft iron
  is pulled toward the poles.

The render pass draws each filing as a rounded needle with a drop shadow and
an angle-dependent metal glint, checking the 5×5 neighboring cells per pixel.
The magnets show faintly through the paper.

With no cursor and nothing pinned (touch, a preview), a ghost magnet wanders
and draws lines on its own. Requires WebGL2 + `EXT_color_buffer_float`;
otherwise the container gets the `filings-fallback` class.
