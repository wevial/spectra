// Plume background — the nebula's gas dragged like wet paint. It's the
// nebula cursor without the cursor: a few invisible wanderers pull lanes
// through its fluid sim, so the gas swirls, thins and piles up at the edges,
// then heals back, on its own. Ignores the pointer.

import { mount as mountNebula, PAINTS } from '@spectra/nebula';
import type { NebulaConfig } from '@spectra/nebula';

export type { NebulaConfig };

/** Palettes: four inks (the gas's fringe, middle, core, hot core) over a ground. */
export { PAINTS };

export interface PlumeOptions {
  /** Palette, a key of PAINTS. Default `spectrum`. */
  paint?: keyof typeof PAINTS;
  /** Strength of the ambient currents; 0 leaves only the drift. */
  currents?: number;
  /** Drift speed of the cloud and the currents. */
  speed?: number;
  /** Ground color under the paint, hex. Default the palette's. */
  ground?: string;
  /** Lock a quality tier, 0–3 (4 = static fallback). */
  tier?: number;
  /** Log the quality governor's decisions. */
  debug?: boolean;
}

/**
 * Mount the background into `container` (which should be positioned and
 * sized). `config` is live; `paint`, `currents` and `speed` are the ones to
 * tune. Without WebGL2 + float targets the container gets the
 * `nebula-fallback` class instead.
 */
export function mount(container: HTMLElement, opts: PlumeOptions = {}) {
  return mountNebula(container, { ...opts, paint: opts.paint ?? 'spectrum', cursor: false, look: 'paint' });
}
