import { describe, expect, test } from 'bun:test';
import { separation, linear } from './separation';

const PAPER = '#f4efe4';

function densityOf(hex: string) {
  const p = linear(PAPER);
  return linear(hex).map((v, c) => Math.max(-Math.log(Math.max(v, 0.01) / p[c]), 0));
}

const amounts = (rows: number[][], d: number[]) => rows.map((r) => r[0] * d[0] + r[1] * d[1] + r[2] * d[2]);

describe('separation', () => {
  const inks = ['#ff48b0', '#0078bf', '#ffe800'];
  const rows = separation(inks, PAPER);

  test('one row per ink', () => {
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toHaveLength(3);
  });

  test('bare paper needs no ink', () => {
    for (const a of amounts(rows, densityOf(PAPER))) expect(Math.abs(a)).toBeLessThan(1e-9);
  });

  test('each ink alone separates to itself', () => {
    inks.forEach((ink, i) => {
      const a = amounts(rows, densityOf(ink));
      a.forEach((v, j) => (i === j ? expect(v).toBeGreaterThan(0.95) : expect(Math.abs(v)).toBeLessThan(0.05)));
    });
  });

  test('two inks project colors onto their own plane', () => {
    const duo = separation(['#ff48b0', '#3d5588'], PAPER);
    expect(duo).toHaveLength(2);
    const a = amounts(duo, densityOf('#3d5588'));
    expect(a[1]).toBeGreaterThan(0.95);
    expect(Math.abs(a[0])).toBeLessThan(0.05);
  });
});
