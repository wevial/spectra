# Wisp cursor

The interactive [haze](../../backgrounds/haze). Smoky rainbow haze drifts
over the dark, and your cursor stirs it: the haze is pushed along the stroke and
lit where you pass, then settles back. A still cursor leaves no mark.

```js
import { mount } from '@spectra/wisp';

const wisp = mount(document.querySelector('#hero'), { palette: 'rose', stir: 1.5 });
wisp.config.ambient = 0.6; // live tuning, picked up next frame
wisp.destroy();
```

Palettes are haze's: `rainbow` (default), whose hue sweeps across the box,
drifts over time and bends along the smoke; `ember`, `rose`, `teal`, `dusk`
and `lagoon` (see `PALETTES`). The base is the dark, the mid color is the haze
and the highlight is where it's lit. See `DEFAULTS` in `src/index.ts` for every
option.

## How it works

The cursor paints the shared cursor trail (`@spectra/core`'s `Trail`, at half
resolution): direction in xy, energy in z. Two passes follow:

1. **Haze**, at half CSS resolution into an RGBA16F target. The haze is
   haze's smoke noise, fbm warped by fbm drifting with `speed` (`SMOKE` from
   `@spectra/core`), at `ambient` brightness. The trail acts on it twice:
   - *Push.* The noise is read from behind along the stroke, so the haze
     is shoved forward, `stir` times as far, and settles back as the trail
     fades over `fade` seconds.
   - *Light.* The trail is read through two displacements. Older strokes
     have drifted, so the lookup steps back along the stroke and across the
     noise, further the more they've faded: the light travels and curls as
     it dies. Then it's smeared along the stroke's direction (`stretch`), so
     a straight fast stroke reads long. The haze is lit where that lands,
     its filaments (the noise's ridges) most, so a stroke shows the shape of
     the smoke it passed through. Slow strokes lay down little energy, so
     the lows are lifted.
2. **Composite**, at full resolution: haze, then light, over the base in
   Oklab. The brightest light goes slightly past the palette toward white. A
   slight vignette follows, then haze's film grain (`GRAIN` from
   `@spectra/core`): per pixel, in linear light, weighted toward the darks,
   and morphing between patterns every 2.5s instead of flickering.

After 1s with no cursor (on touch, or in a preview card), a ghost takes over.
It wanders the box and stirs, so the haze is never still. Mouse only.

Requires WebGL2 + `EXT_color_buffer_float`; otherwise the container gets the
`wisp-fallback` class, for example:

```css
.wisp-fallback {
  background:
    radial-gradient(40% 35% at 35% 40%, rgba(155, 59, 26, 0.35), transparent 70%),
    radial-gradient(35% 30% at 70% 60%, rgba(155, 59, 26, 0.3), transparent 70%),
    #120602;
}
```

With `prefers-reduced-motion` the drift and grain freeze and there's no
ghost. Moving the cursor still stirs.
