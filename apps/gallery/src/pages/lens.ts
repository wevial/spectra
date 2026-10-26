import { mount } from '@spectra/lens';
import { renderNav, panel } from '../shell';

renderNav();
const stage = document.getElementById('stage')!;
const fx = mount(stage);

// Handle on window for poking at it from devtools.
(window as unknown as { fx: typeof fx }).fx = fx;
const c = fx.config;

// Any image or video, from the picker or dropped on the page. Files stay local.
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
    await fx.setSource(video);
  } else {
    await fx.setSource(objectUrl);
  }
}

const picker = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,video/*' });
picker.addEventListener('change', () => void useFile(picker.files?.[0]));
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  void useFile(e.dataTransfer?.files[0]);
});

panel((gui) => {
  gui.add(c, 'mass', 0.01, 0.4, 0.005);
  gui.add(c, 'press', 1, 5, 0.1).name('hold boost');
  gui.add(c, 'core', 0, 0.05, 0.001);
  gui.add(c, 'lag', 0, 1, 0.01).name('lag (s)');
  gui.add(c, 'idle', 0.5, 20, 0.5).name('return (s)');
  const source = gui.addFolder('content');
  source.add({ pick: () => picker.click() }, 'pick').name('image or video…');
  source.add({ poster: () => void fx.setSource(null) }, 'poster').name('grid poster');
});
