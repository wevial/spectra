# Rain filter

Rain on a phone screen. Drops land on fogged glass, creep and lurch down it,
leave trails of smaller drops, swallow what they run into and speed up, and
wipe a clear track through the condensation that slowly fogs over again.
Every drop is a small lens over the panel: moiré rainbows, upside-down
glimpses, magnified subpixels. Shows any image, canvas or video, or a lock
screen by default. No cursor.

```js
import { mount } from '@spectra/rain';

const screen = mount(document.querySelector('#hero'), { source: '/photo.jpg', rain: 8 });
screen.config.gravity = 2; // live tuning, picked up next frame
screen.wipe();
screen.destroy();
```

See `DEFAULTS` in `src/index.ts` for every option.

## How it works

The drop simulation follows Lucas Bebber's
[Rain & Water Effect](https://github.com/codrops/RainEffect) (Codrops, 2015);
the drawing is the droplet cursor's renderer (`@spectra/droplet/water`).

- **Stick-slip.** Each frame a drop may break free and lurch down, more
  likely the bigger it is; friction slows it to a stop again.
- **Trails.** A sliding drop leaves smaller drops behind, shrinking as it
  goes, so its path is beaded with a vertical chain.
- **Collisions.** A moving drop swallows smaller drops it runs into; the
  added water speeds it up and nudges it sideways.
- **Condensation.** A fine field of tiny droplets over the glass. Sliding
  drops wipe a clear track through it (a low-res mask), which fogs over again.
- **Shape.** Resting drops are domes with lumpy, pinned outlines; sliding
  ones are drawn out into teardrops with the tail up.
- **Light.** A window up and to the left, drifting a little, so the glints
  move.

Requires WebGL2; otherwise the container gets the `rain-fallback` class.
