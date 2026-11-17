# Plume background

The [nebula](../../cursors/nebula)'s gas, dragged like wet paint. Invisible
brushes wander the box and pull lanes through it: the gas thins where they
pass, piles up at the edges and swirls in their wake, then heals back to its
untouched shape. No cursor.

```js
import { mount } from '@spectra/plume';

const plume = mount(document.querySelector('#hero'), { paint: 'lagoon', currents: 1.5 });
plume.config.paint = 'sunset'; // live tuning, picked up next frame
plume.destroy();
```

Palettes (see `PAINTS`), each four inks over its own ground:

| Name | Inks | Ground |
|---|---|---|
| `rainbow` (default, glows) | a slow rainbow drifting across | near-black |
| `spectrum` (glows) | violet, teal, gold, pink | near-black |
| `prism` (glows) | silver, a spectrum at the edges | near-black |
| `nebula` | blue, violet, pink | cream |
| `marbling` | indigo, ochre, oxblood | parchment |
| `riso` | blue, fluoro pink, yellow | off-white |
| `ink` | near-black, slate | paper |
| `lagoon` | navy, teal, aqua | sand |
| `candy` | sky, lilac, pink | warm white |
| `sunset` | magenta, orange, gold | dark plum |
| `moss` | greens, olive | near-black |

Other options: `ground` (overrides the palette's; changing `paint` resets
it), `currents` (default 1; 0 leaves only the drift), `speed`, and the
nebula's `tier` and `debug`. `config` is the nebula's live config, so its
`offsetDecay` (how fast the gas heals) and `velocityDissipation` apply too.

## How it works

It's `@spectra/nebula`'s `mount` with `cursor: false` and `look: 'paint'`.
The paint look skips the nebula's stars and night sky. Each pixel reads the
gas's hue back from its color (blue fringe, violet middle, pink core, or a
hot core) and takes the palette's ink for it, blending between neighbors. The
gas's density is the ink's coverage over the ground, and the dust lanes
darken it a little, so it reads as paint rather than glowing gas. A paint
with `glow` turns that around and emits light over a dark ground: `spectrum`
glows in its inks, `prism` in silver that fans into a spectrum along the
gas's edges, and `rainbow` in Oklch hues sweeping slowly across the box.
Dense gas burns toward white, dust lanes absorb, and film grain sits on top,
like the other backgrounds.

Where the cursor would write into the fluid sim, three wanderers (the
brushes) do instead: each follows its own slow Lissajous path and drags the
velocity field along behind it with a wide, soft splat. The sim carries that
momentum into eddies, and the displacement field bends the cloud through them
and decays back, exactly as a cursor's wake does. `speed` scales the cloud's
drift and the wanderers together.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`nebula-fallback` class. With `prefers-reduced-motion` the drift and the
currents freeze.
