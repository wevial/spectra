import { mount, PALETTES } from '@spectra/lava';
import { renderNav, panel, surface } from '../shell';

renderNav();
const page = surface();
const fx = mount(document.getElementById('stage')!, { transparent: page.transparent });

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const lamp = gui.addFolder('lamp');
  lamp.add(c, 'palette', ['rainbow', 'thermal', ...Object.keys(PALETTES)]);
  lamp.add(c, 'amount', 0.05, 0.35, 0.01).name('wax');
  lamp.add(c, 'heat', 0, 3, 0.05);
  lamp.add(c, 'speed', 0, 5, 0.05);
  lamp.add(c, 'glow', 0, 3, 0.05);
  lamp.add(c, 'seed', 0, 100, 1);

  const finish = gui.addFolder('finish');
  finish.add(c, 'grain', 0, 0.5, 0.01);
  finish.add(c, 'grainPeriod', 0, 10, 0.1).name('grain morph (s)');

  page.add(gui);
});
