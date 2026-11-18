import { mount, PALETTES } from '@spectra/hyphae';
import type { PaletteName } from '@spectra/hyphae';
import { renderNav, panel, surface } from '../shell';

renderNav();
const page = surface();
// ?palette=<name> picks a palette, so each has its own link.
const palette = new URLSearchParams(location.search).get('palette');
const fx = mount(document.getElementById('stage')!, {
  ...(palette !== null && palette in PALETTES ? { palette: palette as PaletteName } : {}),
  transparent: page.transparent,
});

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const look = gui.addFolder('look');
  look.add(c, 'palette', Object.keys(PALETTES));
  look.add(c, 'gain', 0.3, 3, 0.05);
  look.add(c, 'glow', 0, 3, 0.05);
  look.add(c, 'grain', 0, 0.2, 0.005);
  look.add(c, 'grainPeriod', 0, 10, 0.1).name('grain morph (s)');

  const food = gui.addFolder('food');
  food.add(c, 'food', 1, 8, 1).name('patches');
  food.add(c, 'cycle', 10, 200, 1).name('cycle (s)');
  food.add(c, 'appetite', 0, 3, 0.05);
  food.add(c, 'barren', 0, 1, 0.01);
  food.add(c, 'spores', 0, 0.05, 0.001);
  food.add(c, 'seed', 0, 100, 1);

  const growth = gui.addFolder('growth');
  growth.add(c, 'speed', 0, 4, 0.05);
  growth.add(c, 'density', 0.05, 2, 0.05);
  growth.add(c, 'cell', 1, 4, 0.25);
  growth.add(c, 'sensorAngle', 0.05, 1.5, 0.01);
  growth.add(c, 'sensorDist', 1, 40, 0.5);
  growth.add(c, 'turn', 0.05, 1.5, 0.01);
  growth.add(c, 'wander', 0, 1, 0.01);
  growth.add(c, 'deposit', 0.01, 0.5, 0.005);
  growth.add(c, 'decay', 0.5, 0.99, 0.005);
  growth.add({ reset: () => fx.reset() }, 'reset').name('regrow');

  page.add(gui);
});
