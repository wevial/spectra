# Lens cursor

An invisible point mass under the cursor that gravitationally lenses whatever
it's mounted on. Straight lines bow into arcs, anything right behind the lens
becomes an Einstein ring, and inside the ring you see a small mirrored image
of the scene. Hold the mouse button to add mass.

```js
import { mount } from '@spectra/lens';

const lens = mount(document.querySelector('#hero'), { source: '/photo.jpg' });
lens.config.mass = 0.2;                         // live tuning
await lens.setSource(document.querySelector('video')); // image, canvas, video, ImageBitmap or URL
await lens.setSource(null);                     // back to the grid poster
lens.destroy();
```

Content is drawn to cover the container. Video is re-uploaded every frame.
Without a source it lenses a grid poster, which shows the distortion best.
See `DEFAULTS` in `src/index.ts` for every option.

Live HTML can't be lensed directly (WebGL can't read DOM pixels); render it to
a canvas or image first.

## How it works

The thin-lens equation for a point mass, softened at the core: a pixel at
offset θ from the lens shows the content at
`β = θ − θE² θ / (|θ|² + core²)`, where θE (`mass`) is the Einstein radius.
Gravity is achromatic, so there's no color split. Rays from inside the ring
reach far outside the frame, so the texture mirrors at its edges, and it's
mipmapped because the lens squeezes content hard near the ring.

Requires WebGL2; otherwise the container gets the `lens-fallback` class.
Mouse only; with no cursor the lens drifts near center.
