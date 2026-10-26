import { mount as glitch } from '@spectra/glitch';
import { mount as nebula } from '@spectra/nebula';
import { renderNav } from '../shell';

renderNav();
const mounts = { glitch, nebula } as const;
for (const card of document.querySelectorAll<HTMLElement>('[data-effect]')) {
  mounts[card.dataset.effect as keyof typeof mounts]?.(card);
}
