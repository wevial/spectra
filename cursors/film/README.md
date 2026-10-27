# Film cursor

Holographic "cracked ice" window film with the sun behind it. The cursor is
the sun. The film's shards shimmer in pastel tints that shift as the sun
moves, and the light they split fans out around the sun as a burst of short
rainbow dashes, red outermost. Hold the mouse button to brighten the sun.

```js
import { mount } from '@spectra/film';

const film = mount(document.querySelector('#hero'), { shards: 10 });
film.config.spread = 0.4; // live tuning, picked up next frame
film.shuffle();           // a new sheet: new shards, new dashes
film.destroy();
```

See `DEFAULTS` in `src/index.ts` for every option.

## How it works

- **Gratings.** Every shard is a diffraction grating with its own axis and
  pitch. Light through it splits along the axis by the grating equation,
  sin θ = mλ/d: the zero order stays white on the sun, the first and second
  orders fan out as spectra, red farthest. With the axes random, all the
  spectra together make a sunburst. Finer pitches throw longer dashes farther
  out, and the dashes are shortened from the grating equation's (`length`)
  to read like the photos.
- **Spectra.** Colors come from the CIE 1931 color matching functions
  (Wyman, Sloan & Shirley's Gaussian fit), converted to linear sRGB, pulled
  partway toward gray to fit the gamut, and white-balanced so a whole spectrum
  adds back up to white. That's baked into a small table; each dash samples
  it a few times across the sun's size, so wavelengths smear like they do
  from a real sun.
- **Dashes.** Three rings of slots around the sun, each slot one shard's
  spectrum or empty. The slots are built on the CPU from a seeded PRNG and
  read by the shader; a pixel only looks at the slots its angle falls in.
  As the sun moves, the rings turn at different rates and directions, so the
  dashes swing past each other, and the burst stretches toward the screen's
  center the nearer the sun is to an edge, like light coming in at a slant.
- **Film.** Voronoi shards, stretched into slivers, some split again by
  finer cracks that fade out partway. Each shard is tinted by the wavelength
  its grating sends toward the eye, so the tints shift as the sun moves, and
  flares when its axis points at the sun. Cracks scatter white; specks of the
  embossing catch the light.

Requires WebGL2; otherwise the container gets the `film-fallback` class.
Mouse only.
