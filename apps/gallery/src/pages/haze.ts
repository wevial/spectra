import { mount, PALETTES } from '@spectra/haze';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const smoke = gui.addFolder('smoke');
  smoke.add(c, 'palette', [...Object.keys(PALETTES), 'rainbow']);
  smoke.add(c, 'intensity', 0, 3, 0.05);
  smoke.add(c, 'scale', 0.3, 3, 0.05).name('size');
  smoke.add(c, 'warp', 0, 1.5, 0.05).name('smokiness');
  smoke.add(c, 'speed', 0, 5, 0.05).name('drift');
  smoke.add(c, 'seed', 0, 100, 1);

  const finish = gui.addFolder('finish');
  finish.add(c, 'grain', 0, 0.5, 0.01);
  finish.add(c, 'grainPeriod', 0, 10, 0.1).name('grain morph (s)');
  finish.add(c, 'fadeBottom', 0, 1, 0.01).name('fade bottom');
  finish.add(c, 'fadeSide', -1, 1, 0.01).name('fade side');
});
