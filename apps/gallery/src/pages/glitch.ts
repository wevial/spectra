import { mount } from '@spectra/glitch';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const cursor = gui.addFolder('cursor');
  cursor.add(c, 'radius', 0.05, 0.8, 0.01);
  cursor.add(c, 'fade', 0.1, 3, 0.05).name('fade (s)');
  cursor.add(c, 'strength', 0, 4, 0.01);
  cursor.add(c, 'block', 0.004, 0.1, 0.001);
  cursor.add(c, 'split', 0, 4, 0.05).name('rgb split');

  const look = gui.addFolder('look');
  look.add(c, 'grain', 0, 0.4, 0.005);
  look.add(c, 'fringe', 0, 4, 0.05);
  look.add(c, 'leak', 0, 2, 0.05).name('light leak');
  look.add(c, 'hue', 0, 1, 0.01);

  const text = gui.addFolder('headline');
  text.add(c, 'text');
  text.add(c, 'textOpacity', 0, 1, 0.01).name('opacity');
  text.add(c, 'line', 0.15, 1, 0.01).name('row height');
  text.add(c, 'drift', -0.3, 0.3, 0.005);
});
