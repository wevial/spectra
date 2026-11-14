import { describe, expect, test } from 'bun:test';
import { gaussianTaps, ribbonParams, ribbonColors, PALETTES, MAX_RIBBONS, MAX_TAPS } from './params';

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
  const opts = { count: 4, amplitude: 0.3, thickness: 0.08, spread: 0.2, seed: 0 };

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
