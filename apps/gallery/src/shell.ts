import GUI from 'lil-gui';

/** Every effect by kind: cursor effects react to the mouse, backgrounds don't. */
export const GROUPS = {
  cursors: ['glitch', 'dither', 'blackhole', 'lens', 'mycelium', 'nebula', 'aurora', 'riso', 'filings', 'phosphor', 'film', 'wisp'],
  backgrounds: ['haze', 'paint-drift'],
} as const;

export const EFFECTS = [...GROUPS.cursors, ...GROUPS.backgrounds];

const LABELS: Partial<Record<(typeof EFFECTS)[number], string>> = { blackhole: 'black hole', film: 'rainbow film', 'paint-drift': 'paint drift' };

/**
 * The top bar: the brand, and on an effect page that effect's name, which
 * opens a menu of every effect by kind. Stays two items wide at any screen
 * width. Home needs no menu: the page is the index.
 */
export function renderNav() {
  const nav = document.querySelector<HTMLElement>('.nav')!;
  const current = nav.dataset.current as (typeof EFFECTS)[number] | 'home';
  if (current === 'home') {
    nav.innerHTML = `<a class="brand" href="/" aria-current="page">spectra</a>`;
    return;
  }
  nav.innerHTML = `<a class="brand" href="/">spectra</a>`
    + `<button class="current" popovertarget="effects">${LABELS[current] ?? current}`
    + `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" /></svg></button>`;

  // The menu lives on body: popovers render in the top layer, but keeping it
  // out of the bar's blur and overflow keeps its positioning plain.
  const menu = document.createElement('div');
  menu.id = 'effects';
  menu.className = 'menu';
  menu.popover = 'auto';
  menu.innerHTML = Object.entries(GROUPS).map(([kind, group]) =>
    `<section><h2>${kind}</h2>${group.map((e) =>
      `<a href="/${e}/"${e === current ? ' aria-current="page"' : ''}>${LABELS[e] ?? e}</a>`).join('')}</section>`,
  ).join('');
  document.body.appendChild(menu);
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

/**
 * Feeds an effect any image or video, from a file picker or dropped on the
 * page. Files stay local (object URLs). Returns `pick()` to open the picker.
 */
export function sourcePicker(setSource: (src: string | HTMLVideoElement) => Promise<void>) {
  let objectUrl = '';
  async function useFile(file: File | undefined) {
    if (!file) return;
    URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const video = Object.assign(document.createElement('video'), {
        src: objectUrl, muted: true, loop: true, playsInline: true,
      });
      await video.play();
      await setSource(video);
    } else {
      await setSource(objectUrl);
    }
  }

  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,video/*' });
  input.addEventListener('change', () => void useFile(input.files?.[0]));
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    void useFile(e.dataTransfer?.files[0]);
  });
  return { pick: () => input.click() };
}
