// Every effect in the gallery, by kind, and how to load each one on demand.
// No DOM or GL here: tests and the capture script import it too.

/** Cursor effects react to the mouse, backgrounds don't. */
export const GROUPS = {
  cursors: ['glitch', 'dither', 'blackhole', 'lens', 'mycelium', 'nebula', 'aurora', 'riso', 'filings', 'film', 'wisp'],
  backgrounds: ['haze', 'plume', 'caustics', 'ribbons', 'lava', 'hyphae'],
} as const;

export type Effect = (typeof GROUPS)[keyof typeof GROUPS][number];

export const EFFECTS: readonly Effect[] = [...GROUPS.cursors, ...GROUPS.backgrounds];

export const LABELS: Partial<Record<Effect, string>> = { blackhole: 'black hole', film: 'rainbow film' };

export const isCursor = (e: Effect) => (GROUPS.cursors as readonly Effect[]).includes(e);

// `any`: each effect takes its own options.
export type Mount = (container: HTMLElement, opts?: any) => { destroy(): void };

/** Each effect's module, loaded only when it is about to run. */
export const LOADERS: Record<Effect, () => Promise<{ mount: Mount }>> = {
  glitch: () => import('@spectra/glitch'),
  dither: () => import('@spectra/dither'),
  blackhole: () => import('@spectra/blackhole'),
  lens: () => import('@spectra/lens'),
  mycelium: () => import('@spectra/mycelium'),
  nebula: () => import('@spectra/nebula'),
  aurora: () => import('@spectra/aurora'),
  riso: () => import('@spectra/riso'),
  filings: () => import('@spectra/filings'),
  film: () => import('@spectra/film'),
  wisp: () => import('@spectra/wisp'),
  haze: () => import('@spectra/haze'),
  plume: () => import('@spectra/plume'),
  caustics: () => import('@spectra/caustics'),
  ribbons: () => import('@spectra/ribbons'),
  lava: () => import('@spectra/lava'),
  hyphae: () => import('@spectra/hyphae'),
};

/** Previews: short looping videos and a first-frame poster per effect, in public/previews. */
export const PREVIEW = {
  dir: 'previews',
  width: 640,
  height: 400,
  fps: 30,
  /** Largest each video may be, bytes. */
  maxBytes: 500_000,
  /** Seconds a cursor preview's pointer path takes to close; its loop length. */
  period: 6,
} as const;

/** The pointer in a cursor preview, `t` seconds into its path: a figure eight through the middle (uv, y up). */
export function previewPath(t: number) {
  const a = (t / PREVIEW.period) * Math.PI * 2;
  return { x: 0.5 + 0.24 * Math.sin(a), y: 0.5 + 0.16 * Math.sin(2 * a) };
}
