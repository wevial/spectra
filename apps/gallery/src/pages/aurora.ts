import { mount, PALETTES } from '@spectra/aurora';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const paint = gui.addFolder('painted curtain');
  paint.add(c, 'palette', Object.keys(PALETTES));
  paint.add(c, 'intensity', 0, 3, 0.05);
  paint.add(c, 'rise', 0.05, 0.8, 0.01);
  paint.add(c, 'radius', 0.01, 0.15, 0.005).name('edge');
  paint.add(c, 'fade', 0.5, 12, 0.1).name('fade (s)');

  const sky = gui.addFolder('sky');
  sky.add(c, 'ambient', 0, 2, 0.05).name('background curtains');
  sky.add(c, 'height', 0.5, 6, 0.1).name('their height');
  sky.add(c, 'speed', 0, 5, 0.05).name('drift');
  sky.add(c, 'stars', 0, 3, 0.05);
  sky.add(c, 'landscape');
  sky.add(c, 'horizon', 0, 0.6, 0.01);
});
