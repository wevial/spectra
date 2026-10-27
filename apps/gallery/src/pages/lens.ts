import { mount } from '@spectra/lens';
import { renderNav, panel, sourcePicker } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;
const picker = sourcePicker(fx.setSource);

panel((gui) => {
  gui.add(c, 'mass', 0.01, 0.4, 0.005);
  gui.add(c, 'press', 1, 5, 0.1).name('hold boost');
  gui.add(c, 'core', 0, 0.05, 0.001);
  gui.add(c, 'lag', 0, 1, 0.01).name('lag (s)');
  gui.add(c, 'idle', 0.5, 20, 0.5).name('return (s)');
  const source = gui.addFolder('content');
  source.add(picker, 'pick').name('image or video…');
  source.add({ poster: () => void fx.setSource(null) }, 'poster').name('grid poster');
});
