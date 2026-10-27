// Rain filter — rain on a phone screen. Drops land on fogged glass, creep and
// lurch down it, leave trails of smaller drops, swallow what they run into
// and speed up, and wipe a clear track through the condensation that slowly
// fogs over again. Every drop is a small lens over the panel: moiré
// rainbows, upside-down glimpses, magnified subpixels. Shows any image,
// canvas or video, or a lock-screen poster by default. No cursor.
//
// The drop simulation follows Lucas Bebber's Rain & Water Effect (Codrops,
// 2015, https://github.com/codrops/RainEffect): stick-slip falling, trail
// drops, momentum-boosting collisions, and drops clearing the condensation.
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
  size: 0.055,
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
  /** Drops landing per second. */
  rain: 5,
  /** How readily drops slide down. */
  gravity: 1,
  /** How many trail drops a sliding drop leaves. */
  trail: 1,
  /** Condensation on the glass, 0..1. */
  mist: 1,
  font: '"Geist", "Inter", system-ui, sans-serif',
};

export type RainConfig = typeof DEFAULTS;

export interface RainHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: RainConfig;
  /** Swap what the screen shows. A string is loaded as an image URL; null restores the poster. */
  setSource(source: RainSource | null): Promise<void>;
  /** Wipe the glass: drops dry up and the condensation clears, then the rain comes back. */
  wipe(): void;
  destroy(): void;
}

// Distances are in reference pixels (1/768 of the height), speeds in those
// per 60 Hz frame, so the simulation's constants read like the original's.
const PX = 1 / 768;
const MIST_CELL = 7; // CSS px between condensation droplets
const MIST_SCALE = 8; // CSS px per mist-mask pixel

interface Drop {
  x: number;          // uv
  y: number;
  r: number;          // px
  momentum: number;   // px/frame, downward
  momentumX: number;
  spreadY: number;    // splash on landing, stretch while trailing
  lastSpawn: number;  // distance slid since the last trail drop
  nextSpawn: number;
  parent: Drop | null;
  isNew: boolean;
  killed: boolean;
  shrink: number;
  seed: number;
  grow: number;       // 0..1 as it lands
}

const rand = (a = 1, b?: number, curve: (n: number) => number = (n) => n) => {
  const [lo, hi] = b === undefined ? [0, a] : [a, b];
  return lo + curve(Math.random()) * (hi - lo);
};
const chance = (p: number) => Math.random() <= p;

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

  // Condensation coverage, low-res: drops paint it clear as they slide.
  const mist = document.createElement('canvas');
  const mctx = mist.getContext('2d')!;
  const fogAll = () => {
    mist.width = Math.max(1, Math.ceil(canvas.clientWidth / MIST_SCALE));
    mist.height = Math.max(1, Math.ceil(canvas.clientHeight / MIST_SCALE));
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, mist.width, mist.height);
  };
  fogAll();
  let refog = 0;

  const maxR = () => config.size / PX;
  const minR = () => maxR() * 0.25;
  let drops: Drop[] = [];
  const make = (o: Partial<Drop>): Drop | null =>
    drops.length >= MAX_DROPS - 1 ? null : {
      x: 0, y: 0, r: 0, momentum: 0, momentumX: 0, spreadY: 0, lastSpawn: 0, nextSpawn: 0,
      parent: null, isNew: true, killed: false, shrink: 0, seed: Math.random(), grow: 0, ...o,
    };

  // Start with some drops already resting on the glass.
  for (let i = 0; i < 30 * aspect(); i++) {
    const d = make({ x: Math.random(), y: Math.random(), r: rand(minR(), maxR(), (n) => n ** 3), grow: 1 });
    if (d) drops.push(d);
  }

  let time = 0;

  stage.start((dt) => {
    const still = reducedMotion.matches;
    if (!still) time += dt;
    if (mist.width !== Math.ceil(canvas.clientWidth / MIST_SCALE) || mist.height !== Math.ceil(canvas.clientHeight / MIST_SCALE)) fogAll();

    if (!still) {
      const ts = Math.min(dt * 60, 2); // in 60 Hz frames
      const a = aspect();
      const lo = minR(), hi = maxR(), span = hi - lo;
      const born: Drop[] = [];

      // Rain lands anywhere, splashing a little.
      for (let n = config.rain * dt * a; n > 0; n--) {
        if (!chance(n)) break;
        const r = rand(lo, hi, (v) => v ** 3);
        const d = make({ x: Math.random(), y: rand(0.05, 1.1), r, momentum: 1 + (r - lo) * 0.1 + rand(2), spreadY: 1.5 });
        if (d) born.push(d);
      }

      for (const drop of drops) {
        if (drop.killed) continue;
        drop.grow = Math.min(drop.grow + dt * 6, 1);

        // Stick-slip: the bigger the drop, the likelier it breaks free and
        // lurches down; friction stops it again.
        if (chance((drop.r - lo) * (0.1 / span) * ts * config.gravity)) {
          drop.momentum += rand((drop.r / hi) * 4);
        }
        // Small drops dry up.
        if (drop.r <= lo && chance(0.05 * ts)) drop.shrink += 0.01;
        drop.r -= drop.shrink * ts;
        if (drop.r <= 0) { drop.killed = true; continue; }

        // A sliding drop leaves smaller drops behind, shrinking as it goes.
        drop.lastSpawn += drop.momentum * ts * config.trail;
        if (config.trail > 0 && drop.lastSpawn > drop.nextSpawn) {
          const t = make({
            x: drop.x + (rand(-drop.r, drop.r) * 0.1 * PX) / a,
            y: drop.y + drop.r * 0.01 * PX,
            r: drop.r * rand(0.2, 0.5),
            spreadY: drop.momentum * 0.1,
            parent: drop,
            grow: 1,
          });
          if (t) {
            born.push(t);
            drop.r *= Math.pow(0.97, ts);
            drop.lastSpawn = 0;
            drop.nextSpawn = rand(lo, hi) - drop.momentum * 2 * config.trail + (hi - drop.r);
          }
        }

        drop.spreadY *= Math.pow(0.7, ts);
        const moved = drop.momentum > 0;
        if (moved) {
          drop.y -= drop.momentum * ts * PX;
          drop.x += (drop.momentumX * ts * PX) / a;
          if (drop.y < -drop.r * PX) drop.killed = true;
        }

        // A moving (or new) drop swallows smaller drops it runs into, and the
        // added water speeds it up.
        if ((moved || drop.isNew) && !drop.killed) {
          for (const other of drops) {
            if (other === drop || other.killed || drop.r <= other.r || drop.parent === other || other.parent === drop) continue;
            const dx = ((other.x - drop.x) * a) / PX, dy = -(other.y - drop.y) / PX;
            if (Math.hypot(dx, dy) >= (drop.r + other.r) * (0.65 + drop.momentum * 0.01 * ts)) continue;
            const r = Math.min(Math.sqrt(drop.r ** 2 + other.r ** 2 * 0.8), hi);
            drop.r = r;
            drop.momentumX += dx * 0.1;
            drop.spreadY = 0;
            other.killed = true;
            drop.momentum = Math.max(other.momentum, Math.min(40, drop.momentum + r * 0.05 + 1));
          }
        }
        drop.isNew = false;

        drop.momentum = Math.max(drop.momentum - Math.max(1, lo * 0.5 - drop.momentum) * 0.1 * ts, 0);
        drop.momentumX *= Math.pow(0.7, ts);

        // It wipes the condensation where it slides.
        if (moved && !drop.killed) {
          const w = mist.width, h = mist.height, rr = drop.r * 0.43 * PX * h;
          mctx.globalCompositeOperation = 'destination-out';
          mctx.beginPath();
          mctx.ellipse(drop.x * w, (1 - drop.y) * h, Math.max(rr, 0.5), Math.max(rr * 1.5, 0.5), 0, 0, Math.PI * 2);
          mctx.fill();
          mctx.globalCompositeOperation = 'source-over';
        }
      }
      drops = drops.filter((d) => !d.killed).concat(born);

      // The glass fogs up again, slowly.
      refog += dt;
      if (refog > 0.5) {
        refog = 0;
        mctx.globalCompositeOperation = 'source-over';
        mctx.fillStyle = 'rgba(255,255,255,0.05)';
        mctx.fillRect(0, 0, mist.width, mist.height);
      }
    }

    water.draw({
      beads: drops.map((d): Bead => ({
        x: d.x,
        y: d.y,
        r: d.r * PX * Math.sin((d.grow * Math.PI) / 2),
        flat: 1,
        seed: d.seed,
        stretch: Math.min(d.momentum * 0.03 + d.spreadY * 0.2, 0.6),
      })),
      // A window light up and to the left, drifting a little.
      lamp: [0.3 + 0.08 * Math.sin(time * 0.07), 0.95, 0.6],
      time,
      mist: { mask: mist, cell: MIST_CELL, amount: config.mist },
    });
  });

  return {
    config,
    setSource: water.setSource,
    wipe() {
      for (const d of drops) d.shrink = 0.1 + rand(0.5);
      mctx.clearRect(0, 0, mist.width, mist.height);
    },
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
