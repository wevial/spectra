import { mount } from '@spectra/nebula';
import { renderNav, panel } from '../shell';

renderNav();
// ?tier=0..4 locks a quality tier (4 = static fallback); ?perf logs the governor.
const params = new URLSearchParams(location.search);
const tier = params.get('tier');
const fx = mount(document.getElementById('stage')!, {
  tier: tier === null ? undefined : Number(tier),
  debug: params.has('perf'),
});

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

panel((gui) => {
  gui.add(c, 'offsetDecay', 0.1, 4, 0.05).name('heal rate');
  gui.add(c, 'velocityDissipation', 0.1, 5, 0.05).name('wake dissipation');
  gui.add(c, 'splatForce', 200, 8000, 50).name('wake force');
});
