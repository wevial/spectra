import { describe, expect, test } from 'bun:test';
import { wavelengthToRgb, spectrumTable, NM_MIN, NM_MAX } from './spectrum';

const argmax = (v: number[]) => v.indexOf(Math.max(...v));

describe('wavelengthToRgb', () => {
  test('primaries land in the right channel', () => {
    expect(argmax(wavelengthToRgb(650))).toBe(0);
    expect(argmax(wavelengthToRgb(530))).toBe(1);
    expect(argmax(wavelengthToRgb(450))).toBe(2);
  });

  test('hue runs blue, green, red with rising wavelength', () => {
    const order: number[] = [];
    for (let nm = 420; nm <= 680; nm += 5) {
      const c = argmax(wavelengthToRgb(nm));
      if (order.at(-1) !== c) order.push(c);
    }
    expect(order).toEqual([2, 1, 0]);
  });

  test('dark outside the visible range', () => {
    for (const nm of [300, 360, 800, 900]) {
      for (const v of wavelengthToRgb(nm)) expect(v).toBeLessThan(0.01);
    }
  });

  test('never negative', () => {
    for (let nm = 350; nm <= 820; nm += 1) {
      for (const v of wavelengthToRgb(nm)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('spectrumTable', () => {
  const n = 128;
  const t = spectrumTable(n);

  test('averages to white', () => {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += t[i * 4 + c];
      expect(sum / n).toBeCloseTo(1, 6);
    }
  });

  test('spans the visible range end to end', () => {
    const at = (nm: number) => Math.round(((nm - NM_MIN) / (NM_MAX - NM_MIN)) * (n - 1));
    expect(argmax([...t.subarray(at(680) * 4, at(680) * 4 + 3)])).toBe(0);
    expect(argmax([...t.subarray(at(440) * 4, at(440) * 4 + 3)])).toBe(2);
  });
});
