import { mount, PALETTES } from '@spectra/ribbons';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const ribbons = gui.addFolder('ribbons');
  ribbons.add(c, 'palette', Object.keys(PALETTES));
  ribbons.add(c, 'count', 1, 6, 1);
  ribbons.add(c, 'amplitude', 0, 0.8, 0.01);
  ribbons.add(c, 'thickness', 0.01, 0.25, 0.005);
  ribbons.add(c, 'spread', 0, 1, 0.01);
  ribbons.add(c, 'placement', ['center', 'full', 'fill']);
  ribbons.add(c, 'speed', 0, 5, 0.05).name('drift');
  ribbons.add(c, 'seed', 0, 100, 1);

  const form = gui.addFolder('form');
  form.add(c, 'depth', 0, 1, 0.01);
  form.add(c, 'sheen', 0, 1, 0.01);
  form.add(c, 'glints', 0, 2, 0.05);
  form.add(c, 'pulsing').name('pulse');

  const light = gui.addFolder('light');
  light.add(c, 'intensity', 0, 3, 0.05);
  light.add(c, 'glow', 0, 3, 0.05);
  light.add(c, 'grain', 0, 0.2, 0.005);
  light.add(c, 'grainPeriod', 0, 10, 0.1).name('grain morph (s)');
});
