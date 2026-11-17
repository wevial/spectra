# Lava background

A lava lamp, simulated as two fluids on the GPU. The bulb warms the wax
pooled on it; warm wax rises through the liquid in plumes that neck and pinch
off, rounds into blobs, cools near the top and sinks back, fusing with
whatever it meets. Nothing is scripted: budding, stretching, merging and
dripping all come out of the physics. A background, not a cursor effect: it
ignores the pointer.

```js
import { mount } from '@spectra/lava';

const lava = mount(document.querySelector('header'), { palette: 'thermal' });
lava.config.heat = 1.5; // live tuning, picked up next frame
lava.measure();         // where the wax is, how warm, how fast (reads the GPU back; slow)
lava.destroy();
```

Palettes: `rainbow` (default), where wax carries a hue that blends where it
mixes; `thermal`, where wax is colored by its temperature, gold on the bulb
cooling through red to indigo at the top; and `magma`, `lilac`, `acid`,
`ocean`, `rose` (see `PALETTES`). `amount` sets how much wax the lamp holds, `heat` how hard the bulb
heats it, `speed` how fast it all runs. See `DEFAULTS` in `src/index.ts` for
every option, and `P` in `src/fluid.ts` for the physics constants.

## How it works

The box is a grid 160 cells tall (`src/fluid.ts` drives it; each pass is in
`src/shaders.ts`). Wax and liquid share one velocity field. The wax is a
fraction φ per cell, and its heat is stored as φ·T, so a blob's temperature
travels with it instead of blurring into the liquid. Each step:

1. **Advect** velocity and state through the velocity (semi-Lagrangian).
2. **Forces.** Buoyancy φ(T − ½): warm wax is lighter than the liquid, cold
   wax heavier. Surface tension as a continuum force (curvature times the
   edge's slope), which rounds blobs and pinches thin necks into drops.
   Viscosity, much higher in wax than in liquid, so blobs hold together. The
   coil: cool wax resting on the floor stays there and liquid the bulb heats
   rises off it, so the pool never lifts off as a sheet with liquid
   underneath. `LIQUID_LIFT` is liquid's upward acceleration relative to wax,
   fading to zero over twice `FLOOR_HOLD`. It is applied as downward wax
   acceleration: writing the lift as −L(y)φ instead of L(y)(1 − φ) removes
   only a height-dependent pressure gradient. The relative buoyancy still
   drives wax down and displaces liquid from beneath it; omitting that
   gradient avoids a spurious upflow from the discrete pressure solve that
   can leave sinking blobs hovering above the floor. No slip at the glass.
3. **Heat.** A few hot spots wander along the floor over a base warmth.
   Conduction evens out neighboring wax; wax cools toward the liquid's
   temperature (warm low, cool high), slowly in its bulk and faster at its
   surface, so big blobs climb higher than small ones.
4. **Sharpen** the wax's edge back to a couple of cells, with a conservative
   compression flux on the faces between cells. The flux only moves wax in
   proportion to what one cell has and the room the other has, so nothing
   overfills, and heat moves with the wax it carries. Advection still loses a
   little wax at sharp edges, so the GPU averages φ through a mip chain each
   step and real edges grow or shrink a touch to hold the total, without
   reading anything back.
5. **Project** the velocity to be incompressible (Jacobi pressure solve).

The state is stored in full float where the browser can filter it: GPUs may
round half floats toward zero, which erodes wax at every edge.

**Rendering**, at full resolution: the wax is where φ passes ½, sampled
bicubically so outlines stay smooth between cells. A blurred copy of φ gives
a rounded normal for rim light and a highlight, and the glow the wax throws
into the liquid; warm wax glows brighter. Colors mix in Oklab, then a
vignette and film grain (`GRAIN` from `@spectra/core`).

It simulates 3s before its first frame so blobs open settled, then fades the
wax in over 900ms. Requires WebGL2 with float render targets; otherwise the
container gets the `lava-fallback` class. With `prefers-reduced-motion` it
draws one static frame, redrawn only when the config or size changes.
Changing the box's shape refills the lamp.
