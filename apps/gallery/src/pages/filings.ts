import { mount } from '@spectra/filings';
import { renderNav, panel } from '../shell';

renderNav();
const fx = mount(document.getElementById('stage')!);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  const magnet = gui.addFolder('magnet');
  magnet.add(c, 'strength', 0.5, 10, 0.1);
  magnet.add(c, 'gap', 20, 200, 1).name('pole gap (px)');
  magnet.add(c, 'turn', 0, 2, 0.05).name('turn (s)');
  magnet.add(c, 'pins', 0, 7, 1).name('click pins');
  magnet.add({ clear: () => fx.clear() }, 'clear').name('remove pins');

  const filings = gui.addFolder('filings');
  filings.add(c, 'friction', 0.002, 0.05, 0.001);
  filings.add(c, 'spin', 0.5, 20, 0.5);
  filings.add(c, 'pull', 0, 10, 0.1);
  filings.add(c, 'density', 0.1, 1, 0.01);
  filings.add(c, 'length', 0.5, 3, 0.05);
  filings.add(c, 'cell', 3, 12, 1).name('cell (px)');
  filings.add({ shake: () => fx.shake() }, 'shake').name('shake the paper');

  const look = gui.addFolder('look');
  look.addColor(c, 'paper');
  look.addColor(c, 'ink');
  look.add(c, 'shadow', 0, 1, 0.01);
  look.add(c, 'hint', 0, 3, 0.05).name('magnet hint');
});
