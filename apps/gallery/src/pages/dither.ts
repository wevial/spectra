import { mount, PALETTES } from '@spectra/dither';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const cursor = gui.addFolder('cursor');
  cursor.add(c, 'radius', 0.03, 0.5, 0.01);
  cursor.add(c, 'fade', 0.1, 4, 0.05).name('fade (s)');
  cursor.add(c, 'glow', 0, 2, 0.05);
  cursor.add(c, 'chunk', 0, 8, 1);
  cursor.add(c, 'follow', 0, 1, 0.01).name('light follow');

  const look = gui.addFolder('look');
  look.add(c, 'palette', Object.keys(PALETTES));
  look.add(c, 'levels', 2, 8, 1);
  look.add(c, 'pixel', 1, 12, 1).name('pixel (px)');
  look.add(c, 'contrast', 0.5, 2.5, 0.05);
});
