import { describe, expect, test } from 'bun:test';
import { dashTable, RINGS } from './dashes';

describe('dashTable', () => {
  const rays = 120;
  const { offsets, texels } = dashTable(rays, 7);

  test('one row pair per ring', () => {
    expect(offsets).toHaveLength(RINGS);
    expect(texels.length).toBe(rays * RINGS * 2 * 4);
  });

  test('same seed, same sheet; new seed, new sheet', () => {
    expect(dashTable(rays, 7).texels).toEqual(texels);
    expect(dashTable(rays, 8).texels).not.toEqual(texels);
  });

  test('each dash points within its own slot', () => {
    for (let ring = 0; ring < RINGS; ring++) {
      for (let i = 0; i < rays; i++) {
        const slot = (texels[(ring * 2 * rays + i) * 4] / (Math.PI * 2)) * rays - offsets[ring];
        expect(Math.floor(slot)).toBe(i);
      }
    }
  });

  test('some slots are empty, most are not', () => {
    let empty = 0;
    for (let ring = 0; ring < RINGS; ring++) {
      for (let i = 0; i < rays; i++) if (texels[(ring * 2 * rays + i) * 4 + 3] === 0) empty++;
    }
    const share = empty / (rays * RINGS);
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.6);
  });
});
