import GUI from 'lil-gui';

import { GROUPS, LABELS } from './effects';
import type { Effect } from './effects';

export { GROUPS, EFFECTS } from './effects';

/**
 * The top bar: the brand, and on an effect page that effect's name, which
 * opens a menu of every effect by kind. Stays two items wide at any screen
 * width. Home needs no menu: the page is the index.
 */
export function renderNav() {
  const nav = document.querySelector<HTMLElement>('.nav')!;
  const current = nav.dataset.current as Effect | 'home';
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

const surfaceState = { transparent: false, page: 'dark' as 'dark' | 'light' };

/**
 * The page under a background, for judging it on dark and light pages.
 * `?transparent` mounts the effect over the page instead of its own ground;
 * `?page=light` puts a light page behind it. Returns the mount option, and
 * `add(gui)` for the toggles: the page color switches live, transparency
 * reloads, since it's fixed at mount.
 */
export function surface() {
  const params = new URLSearchParams(location.search);
  surfaceState.transparent = params.has('transparent');
  surfaceState.page = params.get('page') === 'light' ? 'light' : 'dark';
  const apply = () => { document.documentElement.dataset.page = surfaceState.page; };
  const setParam = (key: string, on: boolean, value = '') => {
    const url = new URL(location.href);
    if (on) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    return url;
  };
  apply();
  return {
    transparent: surfaceState.transparent,
    add(gui: GUI) {
      const page = gui.addFolder('page');
      page.add(surfaceState, 'transparent').onChange((on: boolean) => {
        location.href = setParam('transparent', on).href;
      });
      page.add(surfaceState, 'page', ['dark', 'light']).name('color').onChange((color: string) => {
        history.replaceState(null, '', setParam('page', color === 'light', 'light'));
        apply();
      });
    },
  };
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
        // The page color isn't the effect's; transparency is a mount option whenever it's on.
        if (c.object === surfaceState) {
          if (c.property === 'transparent' && c.getValue()) changed.transparent = true;
        } else if (c.getValue() !== c.initialValue) changed[c.property] = c.getValue();
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
