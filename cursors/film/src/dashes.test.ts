import { describe, expect, test } from 'bun:test';
import { dashTable, ringTurns, RINGS } from './dashes';

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

describe('ringTurns', () => {
  test('still at the center', () => {
    for (const t of ringTurns(0, 0)) expect(t).toBe(0);
  });

  test('one turn per ring, not all the same way', () => {
    const turns = ringTurns(0.3, 0);
    expect(turns).toHaveLength(RINGS);
    expect(turns.some((t) => t > 0) && turns.some((t) => t < 0)).toBe(true);
  });

  test('swing scales the turn', () => {
    expect(ringTurns(0.2, -0.1, 2)).toEqual(ringTurns(0.2, -0.1).map((t) => t * 2));
  });
});
