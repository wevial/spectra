# Droplet cursor

A drop of water on a phone screen, carried by the cursor. It magnifies the
panel into its red, green and blue subpixels, bulges them like a real lens,
and fringes into color at the rim. It stretches as it moves and wobbles when
it stops; click to squish it. Shows any image, canvas or video, or a lock
screen by default.

For a screen beaded with many drops, see the rain filter
([`filters/rain`](../../filters/rain)), built on the same renderer.

```js
import { mount } from '@spectra/droplet';

const screen = mount(document.querySelector('#hero'), { layout: 'oled', source: '/photo.jpg' });
screen.config.magnify = 14; // live tuning, picked up next frame
screen.destroy();
```

Layouts: `lcd` (RGB stripes) and `oled` (diamond pentile). See `DEFAULTS` in
`src/index.ts` for every option.

## How it works

The renderer lives in `src/water.ts` (exported as `@spectra/droplet/water`)
and `src/shaders.ts`.

- **Panel.** The content is sampled once per panel pixel (`pixel` CSS px),
  then split into subpixel shapes that each emit one channel. That's the
  same light, concentrated, so it averages back to the image from afar.
  `soften` lets the subpixels glow into each other up close.
- **Water.** One surface over cover glass above the pixels. Each drop is a
  low dome; neighbours blend through a smooth max sized to the smaller dome,
  so drops fuse only once they touch.
- **Optics.** Each dome is a plano-convex lens. View rays refract at its
  surface and land on the panel, traced per channel with exaggerated
  dispersion. The glass thickness is set so a drop of `size` magnifies
  `magnify`× at its apex; the cursor's drop keeps that as it stretches.
- **Moiré.** Subpixels too fine to resolve alias against a virtual camera
  sensor (`sensor` CSS px): the stripe pattern's fundamental shows up at the
  frequency left after removing whole cycles per sensor pixel, and its phase
  picks which channel lights.
- **Surface.** Fresnel reflection of a dim room and a soft window, a rim that
  bends away from the light, and shallow depth of field. A lamp hovers by the
  drop: its reflection is a hot core with bloom and a faint four-point star.
- **Cost.** Drops are binned into screen tiles (a small integer texture), so
  each pixel only checks the drops near it.

Requires WebGL2; otherwise the container gets the `droplet-fallback` class.
Mouse only.
