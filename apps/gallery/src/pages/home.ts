import { mount as glitch } from '@spectra/glitch';
import { mount as dither } from '@spectra/dither';
import { mount as blackhole } from '@spectra/blackhole';
import { mount as lens } from '@spectra/lens';
import { mount as mycelium } from '@spectra/mycelium';
import { mount as nebula } from '@spectra/nebula';
import { mount as aurora } from '@spectra/aurora';
import { mount as riso } from '@spectra/riso';
import { renderNav } from '../shell';

renderNav();
const mounts = { glitch, dither, blackhole, lens, mycelium, nebula, aurora, riso } as const;
for (const card of document.querySelectorAll<HTMLElement>('[data-effect]')) {
  mounts[card.dataset.effect as keyof typeof mounts]?.(card);
}
