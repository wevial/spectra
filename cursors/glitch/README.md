# Glitch cursor

Moving the mouse tears the picture into pixel blocks that slide along your
path with an RGB split, then settle back. Underneath is a procedural retro
still life: a prism light leak, a thin-film bubble, a monitor of scrolling
code, film grain, and a drifting headline.

**Credit:** adapted from the signup section at the bottom of
[macroscope.com](https://macroscope.com/), which is built with
[Unicorn Studio](https://www.unicorn.studio/)'s pixel-trail mouse effect.

```js
import { mount } from '@spectra/glitch';

const glitch = mount(document.querySelector('#signup'), { text: 'Sign up' });
glitch.config.block = 0.04; // live tuning, picked up next frame
glitch.destroy();
```

See `DEFAULTS` in `src/index.ts` for every option.

## How it works

Three passes per frame (`src/shaders.ts`):

| Pass | What it does |
|---|---|
| `TRAIL` | Half-res RG16F ping-pong field. Each frame it decays, then the segment the mouse swept is painted in as its unit direction, weighted by speed and a soft brush. |
| `SCENE` | The backdrop and the headline. The headline is one row drawn with Canvas 2D, tiled and drifting, overlay-blended in black so bright areas glow through. |
| `COMPOSITE` | Reads the trail through a block grid, so whole blocks of the scene shift together (stair-stepped edges instead of a smear), splits RGB along the motion, then adds vignette and film grain. |

The trail and block math are adapted from Macroscope's scene (see Credit
above). Their rainbow look comes from a baked image; this one is generated in
the shader.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`glitch-fallback` class. Mouse only. With `prefers-reduced-motion`, the
ambient drift and grain freeze; the cursor still responds.
