// Rain filter — a phone screen beaded with water. Every drop is a small lens
// over the panel: mid-size ones swirl with moiré rainbows or show the image
// upside down, tiny ones shrink it to a pale blur. New rain lands now and
// then; drops that touch coalesce (a neck forms and the smaller drains into
// the bigger), and all of them slowly dry. Shows any image, canvas or
// video, or a lock-screen poster by default. No cursor: it's a filter.
//
// The renderer is shared with the droplet cursor (@spectra/droplet/water).

import { createStage } from '@spectra/core';
import type { Source } from '@spectra/core';
import { createWater, LAYOUTS, MAX_DROPS } from '@spectra/droplet/water';
import type { Bead, WaterLook } from '@spectra/droplet/water';

export { LAYOUTS };
export type RainSource = Source;

export const DEFAULTS = {
  layout: 'lcd' as WaterLook['layout'],
  /** Panel pixel pitch, CSS px. */
  pixel: 2,
  /** Radius of the biggest drops, fraction of height: a drop this size magnifies `magnify`×. */
  size: 0.12,
  magnify: 10,
  /** Contact angle, degrees. Flatter drops distort less toward the rim. */
  angle: 35,
  /** Color split, × water's real dispersion. */
  dispersion: 4,
  /** Camera sensor pitch, CSS px: the subpixel grid beats against it into moiré bands. */
  sensor: 1.6,
  /** Gaps between pixels outside the drops, 0..1. */
  grid: 0.18,
  /** Blur toward a drop's rim (shallow depth of field), panel px. */
  focus: 0.35,
  /** Reflection of the room and the lamp. */
  gloss: 1,
  /** 0..1: magnified subpixels glow into each other instead of sitting on black. */
  soften: 0,
  /** Strength of the star glint on big drops. */
  sparkle: 1,
  /** Drops on the screen (per unit of width/height). */
  scatter: 55,
  /** New drops landing per second, while there are fewer than `scatter`. */
  rain: 1.5,
  font: '"Geist", "Inter", system-ui, sans-serif',
};

export type RainConfig = typeof DEFAULTS;

export interface RainHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: RainConfig;
  /** Swap what the screen shows. A string is loaded as an image URL; null restores the poster. */
  setSource(source: RainSource | null): Promise<void>;
  /** Wipe the screen dry (rain refills it). */
  wipe(): void;
  destroy(): void;
}

interface Drop extends Bead {
  grow: number;  // 0..1 as it lands, back to 0 as it's removed
  dying: boolean;
  into?: Drop;   // draining into this drop
  r0?: number;   // radius when it started to drain
}

/**
 * Mount the filter into `container` (which should be positioned and sized).
 * Without WebGL2 the container gets the `rain-fallback` class instead.
 */
export function mount(
  container: HTMLElement,
  opts: Partial<RainConfig> & { source?: RainSource } = {},
): RainHandle {
  const { source: initial, ...rest } = opts;
  const config: RainConfig = { ...DEFAULTS, ...rest };

  const stage = createStage(container);
  if (!stage) {
    container.classList.add('rain-fallback');
    return { config, setSource: async () => {}, wipe() {}, destroy() {} };
  }
  const { canvas, reducedMotion } = stage;
  const water = createWater(stage, config, initial);
  const aspect = () => canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot((ax - bx) * aspect(), ay - by);

  // Mostly fine mist, a few big drops.
  let drops: Drop[] = [];
  const alive = () => drops.filter((d) => !d.dying);
  const mistSize = () => config.size * (0.04 + 0.5 * Math.random() ** 2);
  const land = (x: number, y: number, r: number, grow: number) =>
    drops.push({ x, y, r, grow, dying: false, seed: Math.random(), flat: 1 });
  // The first scatter is spaced out, as if it had settled; later rain lands
  // anywhere, and coalesces with whatever it touches.
  for (let n = Math.round(config.scatter * aspect()), tries = 0; n > 0 && tries < n * 20; tries++) {
    const x = Math.random(), y = Math.random(), r = mistSize();
    if (alive().some((d) => dist(x, y, d.x, d.y) < (r + d.r) * 1.15)) continue;
    land(x, y, r, 1);
    n--;
  }

  let time = 0;
  let rainDue = 0;

  stage.start((dt) => {
    const still = reducedMotion.matches;
    if (!still) time += dt;

    if (!still) {
      // Rain tops the screen back up.
      rainDue += dt * config.rain;
      if (alive().length >= Math.round(config.scatter * aspect())) rainDue = 0;
      for (; rainDue >= 1; rainDue--) land(Math.random(), Math.random(), mistSize(), 0);

      // Drops that touch coalesce: the smaller drains through the neck where
      // it sits, and the bigger leans toward it as the water arrives.
      const resting = drops.filter((d) => !d.dying && !d.into && d.grow >= 1);
      for (let i = 0; i < resting.length; i++) {
        for (let j = i + 1; j < resting.length; j++) {
          const u = resting[i], v = resting[j];
          if (u.into || v.into || dist(u.x, u.y, v.x, v.y) > (u.r + v.r) * 0.95) continue;
          const [small, big] = u.r < v.r ? [u, v] : [v, u];
          small.into = big;
          small.r0 = small.r;
        }
      }
      for (const d of drops) {
        const t = d.into;
        if (d.dying || !t) continue;
        if (t.dying) { d.into = undefined; continue; }
        const k = 1 - Math.exp(-dt * 0.6);
        d.x += (t.x - d.x) * k;
        d.y += (t.y - d.y) * k;
        const r = d.r * Math.exp(-dt * 1.3);
        const flow = d.r ** 3 - r ** 3;
        d.r = r;
        const share = flow / (t.r ** 3 + flow);
        t.x += (d.x - t.x) * share;
        t.y += (d.y - t.y) * share;
        t.r = Math.cbrt(t.r ** 3 + flow);
        if (d.r < (d.r0 ?? d.r) * 0.2 || dist(t.x, t.y, d.x, d.y) + d.r < t.r * 0.9) {
          t.r = Math.cbrt(t.r ** 3 + d.r ** 3);
          d.dying = true;
          d.grow = 0;
        }
      }

      // Everything slowly dries; the smallest vanish.
      for (const d of drops) {
        d.r *= Math.exp(-dt / 90);
        if (d.r < config.size * 0.02) d.dying = true;
      }
    }

    // Landing drops swell in; removed ones shrink away. Over capacity, the
    // oldest dry off.
    const live = alive();
    for (let i = 0; i < live.length - (MAX_DROPS - 1); i++) live[i].dying = true;
    for (const d of drops) d.grow = d.dying ? d.grow - dt * 6 : Math.min(d.grow + dt * 5, 1);
    drops = drops.filter((d) => !d.dying || d.grow > 0);

    water.draw({
      beads: drops.map((d) => ({ ...d, r: d.r * Math.sin((Math.min(Math.max(d.grow, 0), 1) * Math.PI) / 2) })),
      // A window light up and to the left, drifting a little.
      lamp: [0.3 + 0.08 * Math.sin(time * 0.07), 0.95, 0.6],
      time,
    });
  });

  return {
    config,
    setSource: water.setSource,
    wipe() {
      for (const d of drops) d.dying = true;
    },
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
