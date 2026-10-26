import GUI from 'lil-gui';

export const EFFECTS = ['glitch', 'nebula'] as const;

export function renderNav() {
  const nav = document.querySelector<HTMLElement>('.nav')!;
  const current = nav.dataset.current;
  nav.innerHTML = [
    `<a class="brand" href="/"${current === 'home' ? ' aria-current="page"' : ''}>spectra</a>`,
    ...EFFECTS.map((e) => `<a href="/${e}/"${e === current ? ' aria-current="page"' : ''}>${e}</a>`),
  ].join('');
}

/**
 * Tuning panel over an effect's live config. `copy` puts the values you
 * changed on the clipboard as the options object for `mount()`.
 */
export function panel(build: (gui: GUI) => void) {
  const gui = new GUI({ title: 'tune' });
  build(gui);
  const actions = {
    copy() {
      const changed: Record<string, unknown> = {};
      for (const c of gui.controllersRecursive()) {
        if (c.getValue() !== c.initialValue) changed[c.property] = c.getValue();
      }
      void navigator.clipboard.writeText(JSON.stringify(changed, null, 2));
    },
    reset() { gui.reset(); },
  };
  gui.add(actions, 'copy').name('copy changed options');
  gui.add(actions, 'reset');
  if (matchMedia('(max-width: 640px)').matches) gui.close();
  return gui;
}
