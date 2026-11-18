// Written by scripts/capture.ts: seconds into the pointer path (previewPath)
// at which each cursor preview's loop starts.

import type { Effect } from './effects';

export const PATH_START: Partial<Record<Effect, number>> = {
  glitch: 5.7,
  dither: 0.833,
  blackhole: 2.9,
  lens: 2.5,
  mycelium: 1.233,
  nebula: 3.233,
  aurora: 2.1,
  riso: 2,
  filings: 5.967,
  film: 3.533,
  wisp: 1.833,
};
