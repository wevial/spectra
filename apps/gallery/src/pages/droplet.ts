import { mount, LAYOUTS } from '@spectra/droplet';
import { renderNav, panel, sourcePicker } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;
const picker = sourcePicker(fx.setSource);

panel((gui) => {
  const drop = gui.addFolder('drop');
  drop.add(c, 'size', 0.04, 0.3, 0.005);
  drop.add(c, 'magnify', 1.5, 30, 0.5);
  drop.add(c, 'angle', 10, 70, 1).name('contact angle');
  drop.add(c, 'dispersion', 0, 15, 0.1);
  drop.add(c, 'soften', 0, 1, 0.01);
  drop.add(c, 'gloss', 0, 3, 0.05);
  drop.add(c, 'sparkle', 0, 2, 0.05);
  drop.add(c, 'lag', 0, 1, 0.01).name('lag (s)');

  const screen = gui.addFolder('screen');
  screen.add(c, 'layout', Object.keys(LAYOUTS));
  screen.add(c, 'pixel', 1, 6, 0.25).name('pixel (px)');
  screen.add(c, 'sensor', 0.3, 4, 0.05).name('sensor (px)');
  screen.add(c, 'grid', 0, 1, 0.01);
  screen.add(c, 'focus', 0, 2, 0.05);
  screen.add(picker, 'pick').name('image or video…');
  screen.add({ poster: () => void fx.setSource(null) }, 'poster').name('lock screen');
});
