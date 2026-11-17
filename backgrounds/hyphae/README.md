# Hyphae background

A glowing fungal network on near-black. It blooms from a few spots, reaches
toward food you can't see, thickens into bright hubs where it feeds, fuses
into loops, then thins and retreats as the food runs out and moves on. It
never settles into a still web and never fills the screen. A background, not
a cursor effect: it ignores the pointer. It's the
[mycelium cursor](../../cursors/mycelium)'s sim, with drifting food doing the
cursor's job.

```js
import { mount } from '@spectra/hyphae';

const hyphae = mount(document.querySelector('header'), { palette: 'ember' });
hyphae.config.food = 7; // live tuning, picked up next frame
hyphae.reset();         // clear the plate and bloom a fresh colony
hyphae.destroy();
```

Palettes: `spectral` (default), a rainbow that drifts across the plate;
`foxfire`, bioluminescent green; `ember`, warm orange; `spore`, violet;
`frost`, silver-blue (see `PALETTES`). `food`, `cycle`, `appetite`, `barren` and
`spores` shape how restless the network is; the sim knobs match the cursor's.
See `DEFAULTS` in `src/index.ts` for every option.

## How it works

1. **Agents.** Hundreds of thousands of agents walk a scent field, one per two grid
   cells (a cell is a CSS px, coarser on very large screens). Each senses
   ahead-left, ahead and ahead-right, turns toward the strongest, steps and
   drops scent; the field blurs and evaporates. Shared paths reinforce into
   veins and unused ones fade (Physarum, Jeff Jones 2010). The step, the
   point deposit and the blur are `@spectra/mycelium`'s own shaders.
2. **Food.** Where the cursor effect reads its trail, this one reads a food
   texture: up to eight soft nutrient patches with ragged edges, drawn at an
   eighth of CSS resolution. Each patch swells in from nothing over a
   `cycle` (70s), peaks, fades, and is reborn somewhere else; the patches
   share the cycle at evenly staggered phases, so the total food stays
   steady while its place keeps changing. Live patches drift slowly.
3. **Growth and retreat.** Agents lay full scent on food and only `barren`
   (30%) of it elsewhere, so veins that feed stay bright and the rest starve
   and thin out. As a patch fades its hub dissolves, and the network
   reroutes toward the next one.
4. **Spores.** A few agents a second (0.4%) give up and land somewhere at
   random. Without them, and with still food, Physarum shrinks to a bare
   tree between the patches; with them, fresh branches keep sprouting.
5. **Light.** Scent maps to light in linear color: a faint haze of
   exploring agents, strands whose brightness climbs steeply with density
   (fine branches stay dim, trunks carry the light) and are brighter on
   food, and white-hot cores where veins converge on a patch. Four taps
   half a cell apart soften the strands' pixel noise; light is linear in
   those three weights, so the taps average weights and color once.
6. **Bloom.** The same shading, averaged over 4×4 cells into a quarter-CSS
   resolution target, seeds two separable Gaussian blurs: a tight halo there
   and a wide glow at eighth resolution. Both are blurred well past their
   texel size, so upsampling never shows blocks.
7. **Finish.** A near-black ground with a faint slow mottle (computed with
   the food, at an eighth of the resolution), a soft
   shoulder on highlights, a light vignette and film grain (`GRAIN` from
   `@spectra/core`).

The field and bloom targets are sized from CSS pixels, so the stage's
adaptive resolution only changes the final pass and the colony survives it
untouched. Agents live in uv space and survive a resize; only the scent
restarts.

It mounts on the bare ground, fades the network in over 1.5s as the first
blooms grow, and keeps the plate wrapping at the edges. Requires WebGL2 +
`EXT_color_buffer_float`; otherwise the container gets the `hyphae-fallback`
class, for example:

```css
.hyphae-fallback {
  background:
    radial-gradient(30% 40% at 35% 45%, rgba(120, 200, 255, 0.14), transparent 70%),
    radial-gradient(25% 35% at 68% 58%, rgba(255, 140, 210, 0.12), transparent 70%),
    repeating-conic-gradient(from 10deg at 45% 50%, rgba(220, 220, 255, 0.05) 0 1deg, transparent 1deg 13deg),
    #040406;
}
```

With `prefers-reduced-motion` the colony grows unseen for ~25s of sim time
(50 steps a frame), food and spores included, then holds one still frame,
redrawn only when the config or size changes.
