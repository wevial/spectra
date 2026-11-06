# Paint drift background

The [nebula](../../cursors/nebula)'s gas, dragged like wet paint. Invisible
brushes wander the box and pull lanes through it: the gas thins where they
pass, piles up bright at the edges and swirls in their wake, then heals back
to its untouched shape. No cursor.

```js
import { mount } from '@spectra/paint-drift';

const sky = mount(document.querySelector('#hero'), { currents: 1.5 });
sky.config.speed = 0.5; // live tuning, picked up next frame
sky.destroy();
```

Options: `currents` (default 1; 0 leaves only the drift), `speed`, and the
nebula's `tier` and `debug`. `config` is the nebula's live config, so its
`offsetDecay` (how fast the gas heals) and `velocityDissipation` apply too.

## How it works

It's `@spectra/nebula`'s `mount` with `cursor: false`. Where the cursor
would write into the fluid sim, three wanderers (the brushes) do instead: each follows its
own slow Lissajous path and drags the velocity field along behind it with a
wide, soft splat. The sim carries that momentum into eddies, the displacement
field bends the cloud through them and decays back, exactly as a cursor's
wake does. `speed` scales the cloud's drift and the wanderers together.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`nebula-fallback` class. With `prefers-reduced-motion` the drift and the
currents freeze.
