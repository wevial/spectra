import { describe, expect, test } from 'bun:test';
import { AdaptiveResolution, LEVELS } from './resolution';

/** Feed `seconds` of frames at `frameMs` each, with an optional GPU time. */
function run(r: AdaptiveResolution, seconds: number, frameMs: number, gpuMs?: number) {
  let changed = 0;
  for (let t = 0; t < seconds * 1000; t += frameMs) if (r.sample(frameMs, gpuMs)) changed++;
  return changed;
}

describe('AdaptiveResolution, GPU timing', () => {
  test('stays at full resolution when the GPU has headroom', () => {
    const r = new AdaptiveResolution({ budgetMs: 6 });
    run(r, 10, 16.7, 3);
    expect(r.scale).toBe(1);
  });

  test('a brief spike does not demote', () => {
    const r = new AdaptiveResolution({ budgetMs: 6 });
    run(r, 2, 16.7, 3);
    run(r, 0.4, 16.7, 20);
    run(r, 2, 16.7, 3);
    expect(r.scale).toBe(1);
  });

  test('sustained overload jumps straight to a level that fits the budget', () => {
    const r = new AdaptiveResolution({ budgetMs: 6 });
    run(r, 4, 16.7, 15); // 15ms at full; cost scales with pixel count (scale²)
    // 15 * s² <= 6  ->  s <= 0.63
    expect(r.scale).toBeLessThanOrEqual(0.63);
    expect(r.scale).toBeGreaterThanOrEqual(LEVELS[LEVELS.length - 1]);
  });

  test('never goes below the lowest level', () => {
    const r = new AdaptiveResolution({ budgetMs: 6 });
    run(r, 6, 33, 200);
    expect(r.scale).toBe(LEVELS[LEVELS.length - 1]);
  });

  test('climbs back up once the load drops', () => {
    const r = new AdaptiveResolution({ budgetMs: 6 });
    run(r, 4, 16.7, 15);
    const low = r.scale;
    // At the reduced scale the work is now cheap (e.g. the cursor left).
    run(r, 20, 16.7, 0.5);
    expect(r.scale).toBeGreaterThan(low);
    expect(r.scale).toBe(1);
  });

  test('ignores stalls (tab switches, sleep)', () => {
    const r = new AdaptiveResolution({ budgetMs: 6 });
    run(r, 1, 16.7, 3);
    expect(r.sample(5000, 3)).toBe(false);
    run(r, 1, 16.7, 3);
    expect(r.scale).toBe(1);
  });
});

describe('AdaptiveResolution, frame timing only', () => {
  test('a healthy 30Hz display is not overload', () => {
    const r = new AdaptiveResolution();
    run(r, 10, 33.3);
    expect(r.scale).toBe(1);
  });

  test('a 60Hz display dropping to ~30fps steps down', () => {
    const r = new AdaptiveResolution();
    run(r, 3, 16.7);
    run(r, 4, 34);
    expect(r.scale).toBeLessThan(1);
  });

  test('does not promote straight back into a level it just fell out of', () => {
    const r = new AdaptiveResolution();
    run(r, 3, 16.7);
    run(r, 4, 34);
    const low = r.scale;
    run(r, 8, 16.7); // smooth again at the lower level
    expect(r.scale).toBe(low);
  });
});
