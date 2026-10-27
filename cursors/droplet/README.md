# Droplet cursor

Water on a phone screen. The cursor carries a big drop that magnifies the
panel into its red, green and blue subpixels. The screen around it is beaded
with smaller drops that swirl with moiré rainbows or show the screen upside
down. The big drop swallows the drops it runs over, sheds the extra water
behind it as it moves, and wobbles when it stops. Click to flick a spray of
new drops. Shows any image, canvas or video, or a lock screen by default.

```js
import { mount } from '@spectra/droplet';

const screen = mount(document.querySelector('#hero'), { layout: 'oled', source: '/photo.jpg' });
screen.config.magnify = 14; // live tuning, picked up next frame
screen.wipe();
screen.destroy();
```

Layouts: `lcd` (RGB stripes) and `oled` (diamond pentile). See `DEFAULTS` in
`src/index.ts` for every option.

## How it works

- **Panel.** The content is sampled once per panel pixel (`pixel` CSS px),
  then split into subpixel shapes that each emit one channel. That's the
  same light, concentrated, so it averages back to the image from afar.
- **Drops.** Each drop is a spherical cap on cover glass above the pixels: a
  plano-convex lens. View rays refract at its surface and land on the panel,
  traced per channel with exaggerated dispersion. The glass thickness is set
  so the cursor's drop magnifies `magnify`×. Smaller drops on the same glass
  overshoot focus, so they invert and shrink the image. The cursor's drop
  uses an idealized magnifier instead: even magnification across the middle,
  compressing at the rim, where the colors split.
- **Moiré.** Subpixels too fine to resolve alias against a virtual camera
  sensor (`sensor` CSS px). The stripe pattern's fundamental shows up at
  the frequency left after removing whole cycles per sensor pixel, and its
  phase picks which channel lights. The result is soft rainbow bands that
  shift as the drops move.
- **Surface.** Fresnel reflection of a dim room and a soft sunlit window,
  a rim that bends away from the light, and shallow depth of field. Each drop
  mirrors the sun where its normal is halfway between sun and eye, drawn as a
  hot core with bloom and, on big drops, a twinkling four-point star. Moving
  the cursor tilts the light a little, so every glint slides.
- **Cost.** Drops are binned into screen tiles (a small integer texture), so
  each pixel only checks the drops near it.

Requires WebGL2; otherwise the container gets the `droplet-fallback` class.
Mouse only.
