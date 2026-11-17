import { describe, expect, test } from 'bun:test';
import { patches, seedClusters, gaussianTaps, hexToLinear, prismBands, MAX_PATCHES, MAX_TAPS, PRISM_BANDS } from './params';

describe('patches', () => {
  test('positions wrap into uv and strengths stay 0..1', () => {
    for (let t = 0; t < 2000; t += 7.3) {
      const { count, data } = patches(t, 5, 3);
      for (let i = 0; i < count; i++) {
        const [x, y, r, s] = data.slice(i * 4, i * 4 + 4);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(1);
        expect(r).toBeGreaterThan(0.1);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  test('some food is always around, so the colony never starves', () => {
    for (const seed of [0, 1, 7, 42]) {
      for (let t = 0; t < 3000; t += 1.1) {
        const { count, data } = patches(t, 5, seed);
        let total = 0;
        for (let i = 0; i < count; i++) total += data[i * 4 + 3];
        expect(total).toBeGreaterThan(0.6);
      }
    }
  });

  test('a patch is reborn elsewhere only while it is gone', () => {
    let prev = patches(0, 4, 0).data;
    for (let t = 0.05; t < 600; t += 0.05) {
      const cur = patches(t, 4, 0).data;
      for (let i = 0; i < 4; i++) {
        const jump = Math.hypot(cur[i * 4] - prev[i * 4], cur[i * 4 + 1] - prev[i * 4 + 1]);
        // A jump of more than drift (or the uv wrap) only happens at zero strength.
        if (jump > 0.01 && jump < 0.9) expect(Math.min(cur[i * 4 + 3], prev[i * 4 + 3])).toBeLessThan(0.001);
      }
      prev = cur;
    }
  });

  test('clamps the count and leaves unused slots empty', () => {
    expect(patches(0, 99, 0).count).toBe(MAX_PATCHES);
    expect(patches(0, 0, 0).count).toBe(1);
    expect(patches(10, 3, 0).data.slice(12).every((v) => v === 0)).toBe(true);
  });
});

test('seedClusters keeps clusters inside the plate', () => {
  const { count, data } = seedClusters(Math.random, 4);
  expect(count).toBe(4);
  for (let i = 0; i < 4; i++) {
    expect(data[i * 4]).toBeGreaterThan(0.1);
    expect(data[i * 4]).toBeLessThan(0.9);
  }
});

test('gaussianTaps weights sum to 1', () => {
  for (const sigma of [1, 2.5, 4]) {
    const t = gaussianTaps(sigma);
    let total = t.weights[0];
    for (let i = 1; i < t.count; i++) total += 2 * t.weights[i];
    expect(total).toBeCloseTo(1, 6);
    expect(t.count).toBeLessThanOrEqual(MAX_TAPS);
  }
});

test('hexToLinear', () => {
  expect(hexToLinear('#ffffff')).toEqual([1, 1, 1]);
  expect(hexToLinear('#000000')).toEqual([0, 0, 0]);
  expect(hexToLinear('#808080')[0]).toBeCloseTo(0.2159, 3);
});

test('prismBands runs red to violet and every channel gets light', () => {
  const b = prismBands();
  expect(b.length).toBe(PRISM_BANDS * 3);
  const sum = [0, 0, 0];
  for (let i = 0; i < PRISM_BANDS; i++) for (let c = 0; c < 3; c++) {
    expect(b[i * 3 + c]).toBeGreaterThanOrEqual(0);
    sum[c] += b[i * 3 + c];
  }
  for (const v of sum) expect(v).toBeGreaterThan(0.5);
  expect(b[0]).toBeGreaterThan(b[2]); // first band warm
  const last = (PRISM_BANDS - 1) * 3;
  expect(b[last + 2]).toBeGreaterThan(b[last]); // last band cool
});
