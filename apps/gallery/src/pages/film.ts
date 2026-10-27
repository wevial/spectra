import { mount } from '@spectra/film';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const sun = gui.addFolder('sun');
  sun.add(c, 'sun', 0.2, 3, 0.05).name('brightness');
  sun.add(c, 'press', 1, 4, 0.1).name('held');
  sun.add(c, 'size', 0.01, 0.1, 0.001);

  const rays = gui.addFolder('rays');
  rays.add(c, 'spread', 0.1, 0.8, 0.01);
  rays.add(c, 'rays', 20, 240, 1).name('slots');
  rays.add(c, 'length', 0.15, 1.2, 0.01);
  rays.add(c, 'width', 0.001, 0.012, 0.0005);

  const film = gui.addFolder('film');
  film.add(c, 'shards', 1, 16, 0.5);
  film.add(c, 'sheen', 0, 3, 0.05);
  film.add(c, 'cracks', 0, 3, 0.05);
  film.add(c, 'seed', 0, 999, 1).listen();
  film.add(fx, 'shuffle');
});
