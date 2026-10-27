// The dash slots. Each of RINGS rings splits the circle around the sun into
// `rays` slots, offset per ring; a slot either holds one shard's spectrum or
// is empty. Built from a seeded PRNG, so the shader looks a slot up instead of
// hashing per pixel.

export const RINGS = 3;
/** Share of slots left empty, so the burst has gaps like the real thing. */
const EMPTY = 0.45;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DashTable {
  /** Per ring, the slot grid's offset in slots (0..1). */
  offsets: number[];
  /**
   * RGBA float texels, `rays` wide × RINGS·2 tall. Row 2·ring:
   * (direction in radians, pitch scale, sideways offset −1..1, brightness);
   * row 2·ring+1: (width scale, twinkle rate, twinkle phase, 0). Empty slots
   * have brightness 0.
   */
  texels: Float32Array;
}

export function dashTable(rays: number, seed: number): DashTable {
  const rand = mulberry32(seed * 7919 + 1);
  const offsets = Array.from({ length: RINGS }, () => rand());
  const texels = new Float32Array(rays * RINGS * 2 * 4);
  for (let ring = 0; ring < RINGS; ring++) {
    for (let i = 0; i < rays; i++) {
      const dir = ((i + offsets[ring] + 0.5 + (rand() - 0.5) * 0.8) / rays) * Math.PI * 2;
      const empty = rand() < EMPTY;
      const a = (ring * 2 * rays + i) * 4;
      texels.set([dir, 0.3 + 1.5 * rand(), rand() * 2 - 1, empty ? 0 : 0.35 + 0.65 * rand()], a);
      texels.set([0.6 + 0.9 * rand(), 0.7 + 1.6 * rand(), rand() * Math.PI * 2, 0], a + rays * 4);
    }
  }
  return { offsets, texels };
}
