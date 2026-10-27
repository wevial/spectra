# Droplet cursor

Water on a phone screen. The cursor carries a big drop that magnifies the
panel into its red, green and blue subpixels. The screen around it is beaded
with smaller drops that swirl with moiré rainbows or show the screen upside
down. Drops that touch coalesce: a neck forms, the smaller drains into the
bigger over a second or so, and the blob leans toward it before rounding
out; pull away first and they separate. As it moves it leaves a wet streak,
like rain running down a window, that pinches into a chain of uneven beads,
plus bigger drops while it carries swallowed water. It wobbles when it
stops. Click to flick a spray of
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
- **Water.** One surface over cover glass above the pixels. Each drop is a
  low dome with a slightly lumpy, pinned outline, and neighbours blend through
  a smooth max sized to the smaller dome, so drops fuse only once they touch.
  The streak is a ridge along the drop's path in the same surface, narrowing
  between its points as it ages until it is turned into beads.
  Each dome is a plano-convex lens. View rays refract at its surface and land on the panel,
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
  mirrors a lamp hovering by the cursor where its normal is halfway between
  lamp and eye, drawn as a hot core with bloom and, on big drops, a twinkling
  four-point star. Every drop sees the lamp from its own angle, so glints
  swing around the drops as you move, and far drops catch it on the rim.
- **Cost.** Drops are binned into screen tiles (a small integer texture), so
  each pixel only checks the drops near it.

Requires WebGL2; otherwise the container gets the `droplet-fallback` class.
Mouse only.
