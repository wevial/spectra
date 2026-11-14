import { describe, expect, test } from 'bun:test';
import { gaussianTaps, ribbonParams, ribbonFrames, ribbonColors, PALETTES, MAX_RIBBONS, MAX_TAPS } from './params';

describe('gaussianTaps', () => {
  test('weights cover both sides and sum to 1', () => {
    for (const sigma of [0.5, 2.5, 4, 10]) {
      const t = gaussianTaps(sigma);
      let total = t.weights[0];
      for (let i = 1; i < t.count; i++) total += 2 * t.weights[i];
      expect(total).toBeCloseTo(1, 6);
      expect(t.count).toBeLessThanOrEqual(MAX_TAPS);
    }
  });
});

describe('ribbonParams', () => {
  const opts = { placement: 'center' as const, depth: 0.6, count: 4, amplitude: 0.3, thickness: 0.08, spread: 0.2, seed: 0 };

  test('clamps the count and leaves unused slots empty', () => {
    expect(ribbonParams({ ...opts, count: 9 }, 0).count).toBe(MAX_RIBBONS);
    expect(ribbonParams({ ...opts, count: 0 }, 0).count).toBe(1);
    const r = ribbonParams(opts, 3);
    expect(r.shape.slice(4 * 4).every((v) => v === 0)).toBe(true);
  });

  test('is deterministic and drifts with time', () => {
    expect(ribbonParams(opts, 5).wave).toEqual(ribbonParams(opts, 5).wave);
    expect(ribbonParams(opts, 5).wave).not.toEqual(ribbonParams(opts, 6).wave);
  });

  test('every ribbon stays positive in amplitude and thickness', () => {
    for (let t = 0; t < 200; t += 7) {
      const r = ribbonParams({ ...opts, count: 6 }, t);
      for (let i = 0; i < 6; i++) {
        expect(r.shape[i * 4]).toBeGreaterThan(0);
        expect(r.shape[i * 4 + 2]).toBeGreaterThan(0);
      }
    }
  });
});

test('ribbonColors cycles a palette into every slot', () => {
  const c = ribbonColors(['#ffffff']);
  expect(c.length).toBe(MAX_RIBBONS * 3);
  expect([...c].every((v) => v === 1)).toBe(true);
  for (const p of Object.values(PALETTES)) expect(ribbonColors(p).every((v) => v >= 0 && v <= 1)).toBe(true);
});

describe('ribbonFrames', () => {
  const opts = { placement: 'center' as const, depth: 0.6, count: 5, amplitude: 0.3, thickness: 0.08, spread: 0.4, seed: 0 };
  const box = [2, 1.25] as const;

  test('centered and full-bleed share one identity frame', () => {
    for (const placement of ['center', 'full'] as const) {
      const f = ribbonFrames({ ...opts, placement }, box, 10);
      for (let i = 0; i < 6; i++) expect([...f.slice(i * 4, i * 4 + 4)]).toEqual([0, 0, 0, 1]);
    }
  });

  test('fill spreads ribbons over the height, tilted toward the middle', () => {
    for (let t = 0; t < 300; t += 13) {
      const f = ribbonFrames({ ...opts, placement: 'fill' }, box, t);
      const ys = [0, 1, 2, 3, 4].map((i) => f[i * 4 + 1]);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(box[1] * 0.4);
      for (const y of ys) expect(Math.abs(y)).toBeLessThan(box[1] / 2);
      // Top and bottom lanes lean opposite ways.
      expect(Math.sign(f[2])).not.toBe(Math.sign(f[4 * 4 + 2]));
      for (let i = 0; i < 5; i++) expect(f[i * 4 + 3]).toBeGreaterThan(box[0] / 2 * 0.85);
    }
  });
});
