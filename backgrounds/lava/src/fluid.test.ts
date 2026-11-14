import { describe, expect, test } from 'bun:test';
import { placeSpots, type Spot } from './fluid';

describe('lava hot spots', () => {
  const spots = (n: number): Spot[] => Array.from({ length: n }, (_, k) => ({ x: 0, phase: k * 1.7, speed: 0.05 + k * 0.01, strength: 0 }));

  test('stay on the bulb and keep some warmth', () => {
    const s = spots(4);
    for (let t = 0; t < 2000; t += 0.5) {
      placeSpots(s, t);
      for (const p of s) {
        expect(p.x).toBeGreaterThanOrEqual(0.05);
        expect(p.x).toBeLessThanOrEqual(0.95);
        expect(p.strength).toBeGreaterThanOrEqual(0.1);
      }
    }
  });

  test('wander, so plumes rise from different places', () => {
    const s = spots(3);
    const seen = s.map(() => [1, 0]);
    for (let t = 0; t < 600; t += 1) {
      placeSpots(s, t);
      s.forEach((p, k) => { seen[k][0] = Math.min(seen[k][0], p.x); seen[k][1] = Math.max(seen[k][1], p.x); });
    }
    for (const [lo, hi] of seen) expect(hi - lo).toBeGreaterThan(0.15);
  });
});
