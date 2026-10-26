import { mount } from '@spectra/blackhole';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const hole = gui.addFolder('hole');
  hole.add(c, 'size', 0.02, 0.2, 0.005).name('shadow size');
  hole.add(c, 'lag', 0, 2, 0.05).name('lag (s)');
  hole.add(c, 'wake', 0, 4, 0.05);
  hole.add(c, 'fade', 0.1, 4, 0.05).name('wake fade (s)');
  hole.add(c, 'radius', 0.03, 0.5, 0.01).name('wake radius');

  const disk = gui.addFolder('disk');
  disk.add(c, 'disk', 0, 3, 0.05).name('brightness');
  disk.add(c, 'tilt', -0.6, 0.6, 0.01);
  disk.add(c, 'spin', 0, 4, 0.05);

  const sky = gui.addFolder('sky');
  sky.add(c, 'stars', 0, 3, 0.05);
  sky.add(c, 'nebula', 0, 3, 0.05);
  sky.add(c, 'exposure', 0.2, 4, 0.05);
});
