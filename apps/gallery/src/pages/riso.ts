import { mount, INKS } from '@spectra/riso';
import { renderNav, panel, sourcePicker } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;
const picker = sourcePicker(fx.setSource);

panel((gui) => {
  const print = gui.addFolder('print');
  print.add(c, 'inks', Object.keys(INKS));
  print.addColor(c, 'paper');
  print.add(c, 'dot', 2, 16, 0.5).name('dot (px)');
  print.add(c, 'grain', 0, 1.5, 0.05);
  print.add(c, 'register', 0, 8, 0.1).name('misregister (px)');
  print.add(c, 'contrast', 0.5, 2, 0.05);

  const cursor = gui.addFolder('cursor');
  cursor.add(c, 'push', 0, 80, 1).name('push (px)');
  cursor.add(c, 'radius', 0.03, 0.5, 0.01);
  cursor.add(c, 'fade', 0.1, 5, 0.05).name('fade (s)');

  const source = gui.addFolder('content');
  source.add(picker, 'pick').name('image or video…');
  source.add({ poster: () => void fx.setSource(null) }, 'poster').name('sunset poster');
});
