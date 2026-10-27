// Droplet cursor — a drop of water on a phone screen, carried by the cursor.
// It magnifies the panel into its subpixels, fringes into color at the rim,
// stretches as it moves and wobbles when it stops. Click to squish it. Shows
// any image, canvas or video, or a lock-screen poster by default.
//
// The screen beaded with many drops is the rain filter (@spectra/rain),
// built on the same renderer (./water).

import { createStage } from '@spectra/core';
import type { Source } from '@spectra/core';
import { createWater } from './water';
import type { WaterLook } from './water';

export { LAYOUTS } from './water';
export type { Layout } from './water';

export type DropletSource = Source;

export const DEFAULTS = {
  layout: 'lcd' as WaterLook['layout'],
  /** Panel pixel pitch, CSS px. */
  pixel: 2,
  /** Radius of the drop, fraction of height. */
  size: 0.12,
  /** Magnification at the center of the drop. */
  magnify: 10,
  /** Contact angle, degrees. Flatter drops distort less toward the rim. */
  angle: 35,
  /** Color split, × water's real dispersion. */
  dispersion: 2,
  /** Camera sensor pitch, CSS px: the subpixel grid beats against it into moiré bands. */
  sensor: 1.6,
  /** Gaps between pixels outside the drop, 0..1. */
  grid: 0.12,
  /** Blur toward the rim (shallow depth of field), panel px. */
  focus: 0.35,
  /** Reflection of the room and the lamp. */
  gloss: 1,
  /** 0..1: magnified subpixels glow into each other instead of sitting on black. */
  soften: 0.35,
  /** Strength of the star glint. */
  sparkle: 0.5,
  /** Seconds for the drop to catch up with the cursor. */
  lag: 0.12,
  font: '"Geist", "Inter", system-ui, sans-serif',
};

export type DropletConfig = typeof DEFAULTS;

export interface DropletHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: DropletConfig;
  /** Swap what the screen shows. A string is loaded as an image URL; null restores the poster. */
  setSource(source: DropletSource | null): Promise<void>;
  destroy(): void;
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 the container gets the `droplet-fallback` class instead.
 */
export function mount(
  container: HTMLElement,
  opts: Partial<DropletConfig> & { source?: DropletSource } = {},
): DropletHandle {
  const { source: initial, ...rest } = opts;
  const config: DropletConfig = { ...DEFAULTS, ...rest };

  const stage = createStage(container);
  if (!stage) {
    container.classList.add('droplet-fallback');
    return { config, setSource: async () => {}, destroy() {} };
  }
  const { canvas, pointer, reducedMotion } = stage;
  const water = createWater(stage, config, initial);
  const aspect = () => canvas.clientWidth / Math.max(canvas.clientHeight, 1);

  const drop = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, dirX: 1, dirY: 0, speed: 0, stretch: 0, spring: 0 };

  const ac = new AbortController();
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && pointer.active) drop.spring -= 4; // squish
  }, { signal: ac.signal });

  let idle = 0;
  let time = 0;
  const anchor = { x: 0.5, y: 0.5 };

  stage.start((dt) => {
    const still = reducedMotion.matches;
    if (!still) time += dt;
    const a = aspect();

    // Follow the cursor; with none, drift slowly around the screen.
    if (pointer.active) {
      idle = 0;
    } else {
      if (idle === 0) { anchor.x = drop.x; anchor.y = drop.y; }
      idle += dt;
    }
    const s = Math.min(idle / 4, 1);
    const settle = s * s * (3 - 2 * s);
    const wx = 0.5 + Math.sin(time * 0.23) * 0.3, wy = 0.5 + Math.sin(time * 0.31 + 1) * 0.25;
    const tx = pointer.active ? pointer.x : anchor.x + (wx - anchor.x) * settle;
    const ty = pointer.active ? pointer.y : anchor.y + (wy - anchor.y) * settle;
    const k = 1 - Math.exp(-dt / Math.max(config.lag / 3, 0.001));
    drop.x += (tx - drop.x) * k;
    drop.y += (ty - drop.y) * k;

    // Speed stretches it along its heading; a spring wobbles it after.
    const vx = ((drop.x - drop.px) * a) / Math.max(dt, 1e-3), vy = (drop.y - drop.py) / Math.max(dt, 1e-3);
    drop.px = drop.x;
    drop.py = drop.y;
    drop.speed += (Math.hypot(vx, vy) - drop.speed) * (1 - Math.exp(-dt * 12));
    if (drop.speed > 0.05) {
      const m = Math.hypot(vx, vy) || 1;
      const turn = 1 - Math.exp(-dt * 10);
      drop.dirX += (vx / m - drop.dirX) * turn;
      drop.dirY += (vy / m - drop.dirY) * turn;
      const n = Math.hypot(drop.dirX, drop.dirY) || 1;
      drop.dirX /= n;
      drop.dirY /= n;
    }
    if (still) {
      drop.stretch = drop.spring = 0;
    } else {
      const target = Math.min(drop.speed * 0.25, 0.35);
      drop.spring += ((target - drop.stretch) * 160 - drop.spring * 9) * dt;
      drop.stretch = Math.max(drop.stretch + drop.spring * dt, -0.35);
    }
    const sway = still ? 0 : Math.sin(time * 2.1) * 0.015 * Math.min(Math.abs(drop.spring), 1);

    water.draw({
      beads: [],
      lead: { x: drop.x, y: drop.y, r: config.size * (1 + sway), dirX: drop.dirX, dirY: drop.dirY, stretch: drop.stretch },
      // A lamp hovers up and to the left of the drop, so its glint shifts as it moves.
      lamp: [drop.x - 0.12, drop.y + 0.18, 0.35],
      time,
    });
  });

  return {
    config,
    setSource: water.setSource,
    destroy() {
      ac.abort();
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
