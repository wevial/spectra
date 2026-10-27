import { mount, PHOSPHORS } from '@spectra/phosphor';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const beam = gui.addFolder('beam');
  beam.add(c, 'phosphor', Object.keys(PHOSPHORS));
  beam.add(c, 'intensity', 0.1, 4, 0.05);
  beam.add(c, 'boost', 1, 10, 0.1).name('hold boost');
  beam.add(c, 'persistence', 0.1, 5, 0.05);
  beam.add(c, 'beam', 0.5, 6, 0.1).name('width (px)');

  const tube = gui.addFolder('tube');
  tube.add(c, 'curve', 0, 0.25, 0.005);
  tube.add(c, 'bloom', 0, 3, 0.05);
  tube.add(c, 'exposure', 0.2, 4, 0.05);
  tube.add(c, 'scanlines', 0, 1, 0.01);
  tube.add(c, 'graticule', 0, 2, 0.05);
});
