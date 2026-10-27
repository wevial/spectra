# Rain filter

A phone screen beaded with water. Every drop is a small lens over the panel:
mid-size ones swirl with moiré rainbows or show the image upside down, tiny
ones shrink it to a pale blur, and big ones magnify the subpixels. New rain
lands now and then; drops that touch coalesce (a neck forms and the smaller
drains into the bigger), and all of them slowly dry. Shows any image, canvas
or video, or a lock screen by default. No cursor.

```js
import { mount } from '@spectra/rain';

const screen = mount(document.querySelector('#hero'), { source: '/photo.jpg', scatter: 40 });
screen.config.rain = 4; // live tuning, picked up next frame
screen.wipe();
screen.destroy();
```

See `DEFAULTS` in `src/index.ts` for every option.

## How it works

The drawing is the droplet cursor's renderer (`@spectra/droplet/water`): the
same panel, optics, moiré and glints. This package only runs the drops:

- **Beads.** Mostly fine mist and a few big drops, spaced out at first as if
  they had settled. Bigger ones get a slightly lumpy, pinned outline.
- **Rain.** New drops land anywhere while there are fewer than `scatter`.
- **Coalescence.** Drops that touch drain into the bigger one where they sit,
  and the bigger leans toward the water as it arrives.
- **Drying.** Every drop shrinks slowly; the smallest vanish.
- **Light.** A window up and to the left, drifting a little, so the glints
  move.

Requires WebGL2; otherwise the container gets the `rain-fallback` class.
