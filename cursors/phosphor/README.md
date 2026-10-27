# Phosphor cursor

A vector CRT where the cursor is the electron beam. Where it passes, the
phosphor flashes and then fades through a long afterglow. A lingering beam
burns brighter than a fast one, as on a real scope. Hold the mouse button to
turn the intensity up. With no cursor, the beam traces a slowly turning
Lissajous figure.

```js
import { mount } from '@spectra/phosphor';

const scope = mount(document.querySelector('#hero'), { phosphor: 'p3', scanlines: 0 });
scope.config.persistence = 2; // live tuning, picked up next frame
scope.destroy();
```

Phosphors (see `PHOSPHORS`):

| Name | Flash | Afterglow |
|---|---|---|
| `p7` | blue-white | yellow-green, long |
| `p1` | green | short |
| `p3` | amber | |
| `p4` | white | |

See `DEFAULTS` in `src/index.ts` for every option.

## How it works

- **Beam.** The effect collects every pointer position since the last frame,
  coalesced events included, so fast curves stay curved. It maps them through
  the screen's curvature so the trace lands under the cursor.
- **Persistence.** A two-channel buffer holds the phosphor: a fast flash and
  a slow afterglow, each decaying at its own rate. The beam adds a Gaussian
  integrated along each path segment (an erf across its length), so segments
  and frames tile seamlessly. Energy per frame is spread over the path length,
  so slow strokes burn brighter.
- **Tube.** The persistence is downsampled and blurred for bloom, then drawn
  through barrel distortion with a graticule, optional scanlines, vignette,
  glass reflection and flicker.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`phosphor-fallback` class. Mouse only.
