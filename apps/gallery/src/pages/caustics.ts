import { mount, PALETTES } from '@spectra/caustics';
import { renderNav, panel, surface } from '../shell';

renderNav();
const page = surface();
const stage = document.getElementById('stage')!;
const open = (transparent: boolean) => mount(stage, { transparent });
let fx = open(page.transparent);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const water = gui.addFolder('water');
  water.add(c, 'palette', Object.keys(PALETTES));
  water.add(c, 'depth', 0.1, 1.2, 0.01);
  water.add(c, 'choppiness', 0, 2.5, 0.01);
  water.add(c, 'scale', 0.3, 3, 0.05).name('size');
  water.add(c, 'speed', 0, 2, 0.01);
  water.add(c, 'seed', 0, 100, 1);

  const light = gui.addFolder('light');
  light.add(c, 'intensity', 0, 1.5, 0.01);
  light.add(c, 'sharpness', 0.5, 4, 0.05);
  light.add(c, 'dispersion', 0, 12, 0.1);
  light.add(c, 'grain', 0, 0.5, 0.01);
  light.add(c, 'grainPeriod', 0, 10, 0.1).name('grain morph (s)');

  page.add(gui, fx, (transparent) => (fx = open(transparent)));
});
