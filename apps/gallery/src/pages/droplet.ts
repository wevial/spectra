import { mount, LAYOUTS } from '@spectra/droplet';
import { renderNav, panel, sourcePicker } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;
const picker = sourcePicker(fx.setSource);

panel((gui) => {
  const water = gui.addFolder('water');
  water.add(c, 'size', 0.04, 0.3, 0.005);
  water.add(c, 'magnify', 1.5, 30, 0.5);
  water.add(c, 'angle', 10, 70, 1).name('contact angle');
  water.add(c, 'dispersion', 0, 15, 0.1);
  water.add(c, 'gloss', 0, 3, 0.05);
  water.add(c, 'scatter', 0, 70, 1);
  water.add(c, 'rain', 0, 10, 0.1).name('rain (/s)');
  water.add({ wipe: fx.wipe }, 'wipe');

  const screen = gui.addFolder('screen');
  screen.add(c, 'layout', Object.keys(LAYOUTS));
  screen.add(c, 'pixel', 1, 6, 0.25).name('pixel (px)');
  screen.add(c, 'sensor', 0.3, 4, 0.05).name('sensor (px)');
  screen.add(c, 'grid', 0, 1, 0.01);
  screen.add(c, 'focus', 0, 2, 0.05);
  screen.add(picker, 'pick').name('image or video…');
  screen.add({ poster: () => void fx.setSource(null) }, 'poster').name('lock screen');
});
