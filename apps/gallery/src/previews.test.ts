// Every effect has a card on the home page and a recorded preview within
// budget. Regenerate previews with `bun run capture [effect...]`.

import { expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EFFECTS, PREVIEW } from './effects';

const app = join(import.meta.dir, '..');
const dir = join(app, 'public', PREVIEW.dir);
const home = readFileSync(join(app, 'index.html'), 'utf8');

test.each([...EFFECTS])('%s has a home card and a preview within budget', (effect) => {
  expect(home).toContain(`data-effect="${effect}"`);
  expect(home).toContain(`src="/${PREVIEW.dir}/${effect}.webp"`);
  for (const ext of ['webm', 'mp4', 'webp']) {
    const file = join(dir, `${effect}.${ext}`);
    expect(existsSync(file), `${file} is missing; run bun run capture ${effect}`).toBe(true);
    if (ext !== 'webp') expect(statSync(file).size).toBeLessThanOrEqual(PREVIEW.maxBytes);
  }
  // Fast start: the index comes before the media, so playback starts before the download ends.
  const mp4 = readFileSync(join(dir, `${effect}.mp4`)).toString('latin1');
  expect(mp4.indexOf('moov')).toBeLessThan(mp4.indexOf('mdat'));
});

test('no preview without an effect', () => {
  const names = new Set<string>(EFFECTS);
  const stray = [...new Bun.Glob('*.{webm,mp4,webp}').scanSync(dir)].filter((f) => !names.has(f.replace(/\.\w+$/, '')));
  expect(stray).toEqual([]);
});
