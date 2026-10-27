import GUI from 'lil-gui';

export const EFFECTS = ['glitch', 'dither', 'blackhole', 'lens', 'mycelium', 'nebula', 'aurora', 'riso', 'filings', 'phosphor', 'droplet'] as const;

const LABELS: Partial<Record<(typeof EFFECTS)[number], string>> = { blackhole: 'black hole' };

export function renderNav() {
  const nav = document.querySelector<HTMLElement>('.nav')!;
  const current = nav.dataset.current;
  nav.innerHTML = [
    `<a class="brand" href="/"${current === 'home' ? ' aria-current="page"' : ''}>spectra</a>`,
    ...EFFECTS.map((e) => `<a href="/${e}/"${e === current ? ' aria-current="page"' : ''}>${LABELS[e] ?? e}</a>`),
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
