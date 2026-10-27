import { mount, PALETTES } from '@spectra/mycelium';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const growth = gui.addFolder('growth');
  growth.add(c, 'sensorAngle', 0.1, 1.5, 0.01).name('sensor angle');
  growth.add(c, 'sensorDist', 2, 40, 0.5).name('sensor reach');
  growth.add(c, 'turn', 0.05, 1.5, 0.01);
  growth.add(c, 'wander', 0, 1, 0.01);
  growth.add(c, 'speed', 0.25, 3, 0.05);
  growth.add(c, 'steps', 0, 6, 1).name('steps / frame');
  growth.add(c, 'decay', 0.5, 0.99, 0.005);
  growth.add(c, 'density', 0.1, 2, 0.05).name('agents / cell');
  growth.add(c, 'cell', 1, 6, 1).name('cell (px)');
  growth.add({ reset: () => fx.reset() }, 'reset').name('new colony');

  const cursor = gui.addFolder('cursor');
  cursor.add(c, 'attract', 0, 4, 0.05);
  cursor.add(c, 'radius', 0.02, 0.3, 0.01);
  cursor.add(c, 'fade', 0.2, 8, 0.1).name('fade (s)');

  const look = gui.addFolder('look');
  look.add(c, 'palette', Object.keys(PALETTES));
  look.add(c, 'gain', 0.2, 4, 0.05);
  look.add(c, 'glow', 0, 1.5, 0.05);
});
