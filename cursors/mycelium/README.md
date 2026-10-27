# Mycelium cursor

A colony of agents that blooms from the middle of the page into a branching
network of hyphae, then keeps rerouting itself. Your cursor's trail smells like
food: veins bend toward wherever you've been and thicken along your path.

```js
import { mount } from '@spectra/mycelium';

const mycelium = mount(document.querySelector('#hero'), { palette: 'petri' });
mycelium.config.sensorDist = 20; // live tuning, picked up next frame
mycelium.reset();                // fresh colony
mycelium.destroy();
```

Palettes: `forest`, `spore`, `petri` (see `PALETTES`). See `DEFAULTS` in
`src/index.ts` for every option; `sensorAngle`, `sensorDist` and `turn` shape
the network most.

## How it works

A Physarum transport model ([Jones, 2010](https://doi.org/10.1162/artl.2010.16.2.16202)),
on the GPU. One agent per texel of an RGBA32F texture (position and heading),
about one per two grid cells. Each step:

1. Agents sense the scent field ahead-left, ahead and ahead-right, turn toward
   the strongest, jitter a little and step forward. The cursor trail
   (`@spectra/core`'s `Trail`) is added to what they sense.
2. Every agent is drawn as a point, additively, into the scent field (R16F).
3. The field is blurred 3×3, capped at 1 and decays. The cap keeps a busy vein
   from pulling ever harder, so the net stays fine instead of collapsing into
   a few lanes.

The plate wraps at the edges. The render pass maps scent to a thin lit core
and a fuzzy halo over textured soil.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`mycelium-fallback` class. Mouse only. With `prefers-reduced-motion` the
simulation slows to a crawl.
