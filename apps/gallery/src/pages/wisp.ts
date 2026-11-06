import { mount, PALETTES } from '@spectra/wisp';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const haze = gui.addFolder('haze');
  haze.add(c, 'palette', [...Object.keys(PALETTES), 'rainbow']);
  haze.add(c, 'intensity', 0, 3, 0.05);
  haze.add(c, 'ambient', 0, 1, 0.01);
  haze.add(c, 'speed', 0, 5, 0.05).name('drift');

  const stir = gui.addFolder('stir');
  stir.add(c, 'stir', 0, 2, 0.05).name('strength');
  stir.add(c, 'fade', 0.5, 12, 0.1).name('settle (s)');
  stir.add(c, 'radius', 0.01, 0.2, 0.005).name('brush');
  stir.add(c, 'stretch', 0, 3, 0.05);

  const finish = gui.addFolder('finish');
  finish.add(c, 'grain', 0, 0.5, 0.01);
});
