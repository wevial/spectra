// Paint drift background — the nebula's gas dragged like wet paint. It's the
// nebula cursor without the cursor: a few invisible wanderers pull lanes
// through its fluid sim, so the gas swirls, thins and piles up at the edges,
// then heals back, on its own. Ignores the pointer.

import { mount as mountNebula } from '@spectra/nebula';
import type { NebulaConfig } from '@spectra/nebula';

export type { NebulaConfig };

export interface PaintDriftOptions {
  /** Strength of the ambient currents; 0 leaves only the drift. */
  currents?: number;
  /** Drift speed of the cloud and the currents. */
  speed?: number;
  /** Lock a quality tier, 0–3 (4 = static fallback). */
  tier?: number;
  /** Log the quality governor's decisions. */
  debug?: boolean;
}

/**
 * Mount the background into `container` (which should be positioned and
 * sized). `config` is live; `currents` and `speed` are the ones to tune.
 * Without WebGL2 + float targets the container gets the `nebula-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: PaintDriftOptions = {}) {
  return mountNebula(container, { ...opts, cursor: false });
}
