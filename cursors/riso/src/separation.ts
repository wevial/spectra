// Spot-ink separation: how much of each ink to lay down for a given color.

/** sRGB hex to linear RGB. */
export function linear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map((v) => Math.pow(v, 2.2)) as [number, number, number];
}

/**
 * Rows r_i such that ink amount i = r_i · density: the least-squares solve of
 * density ≈ Σ amount_i · inkDensity_i, i.e. (AᵀA)⁻¹Aᵀ for the ink density
 * columns A. A small ridge keeps nearly parallel inks stable.
 */
export function separation(inks: string[], paper: string): number[][] {
  const p = linear(paper);
  const A = inks.map((hex) => linear(hex).map((v, c) => Math.max(-Math.log(Math.max(v, 0.01) / p[c]), 0)));
  const n = A.length;
  const ata = A.map((a) => A.map((b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  for (let i = 0; i < n; i++) ata[i][i] += 0.02;
  const inv = invert(ata);
  return inv.map((row) => [0, 1, 2].map((c) => row.reduce((s, v, j) => s + v * A[j][c], 0)));
}

function invert(m: number[][]): number[][] {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...m.map((_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const d = a[col][col];
    for (let c = 0; c < 2 * n; c++) a[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row) => row.slice(n));
}
