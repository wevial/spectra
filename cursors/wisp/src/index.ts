// Wisp cursor — the interactive haze. Smoky haze drifts over the dark, and
// moving the cursor stirs it: the haze is pushed along the stroke and lit
// where you pass, then settles back. A still cursor leaves no mark.

import { Program, VERTEX, Trail, makeBlit, createStage, createFBO, setGrain } from '@spectra/core';
import type { FBO, Pointer } from '@spectra/core';
import { PALETTES, RAINBOW_BASE } from '@spectra/haze';
import { HAZE, COMPOSITE } from './shaders';

/**
 * Haze's palettes: base, mid (the haze), highlight (where it's lit). Plus
 * `rainbow`, whose colors are a drifting Oklch hue sweep over RAINBOW_BASE.
 */
export { PALETTES, RAINBOW_BASE };

export type PaletteName = keyof typeof PALETTES | 'rainbow';

export const DEFAULTS = {
  palette: 'rainbow' as PaletteName,
  /** Haze and light opacity; past 1 the brightest light burns toward white. */
  intensity: 1,
  /** How bright the haze is everywhere. */
  ambient: 0.4,
  /** How much moving the cursor pushes and lights the haze. */
  stir: 1,
  /** Seconds for a stroke to settle, to ~5%. */
  fade: 3,
  /** Width of a stroke, fraction of height. */
  radius: 0.06,
  /** How far a stroke smears along its direction. */
  stretch: 1,
  /** Drift and morph speed. */
  speed: 1,
  /** Film grain; same scale as haze's. */
  grain: 0.04,
};

export type WispConfig = typeof DEFAULTS;

export interface WispHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: WispConfig;
  destroy(): void;
}

/** Seconds per grain pattern, as haze's default. */
const GRAIN_PERIOD = 2.5;
/** Seconds without a cursor before the ghost takes over. */
const IDLE = 1;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `wisp-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<WispConfig> = {}): WispHandle {
  const config: WispConfig = { ...DEFAULTS, ...opts };

  let trail: Trail | null = null;
  let resizeLight = () => {};
  const stage = createStage(container, {
    floatTargets: true,
    onResize: () => { trail?.resize(); resizeLight(); },
  });
  if (!stage) {
    container.classList.add('wisp-fallback');
    return { config, destroy() {} };
  }
  const { gl, canvas, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const haze = new Program(gl, VERTEX, HAZE);
  const composite = new Program(gl, VERTEX, COMPOSITE);
  trail = new Trail(gl, blit, 0.5);

  // The haze is soft, so it renders at half CSS resolution regardless of DPR.
  let light: FBO | null = null;
  resizeLight = () => {
    light?.dispose();
    const w = Math.max(1, Math.round(canvas.clientWidth / 2));
    const h = Math.max(1, Math.round(canvas.clientHeight / 2));
    light = createFBO(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  };
  resizeLight();

  // With no cursor (touch, or a preview card) a ghost wanders and stirs, so
  // the haze is never still. It starts right away: mounting counts as idle.
  const ghost: Pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, active: false };
  let idle = IDLE;
  let time = 0;
  let grainClock = 0;

  stage.start((dt, rawDtMs) => {
    const still = reducedMotion.matches;
    if (!still) {
      time += dt * config.speed;
      grainClock += rawDtMs / 1000 / GRAIN_PERIOD;
    }
    idle = pointer.active ? 0 : idle + dt;
    if (idle >= IDLE && !still) {
      const t = time * 0.5;
      const x = 0.5 + 0.36 * Math.sin(t * 0.61) * Math.cos(t * 0.23);
      const y = 0.5 + 0.3 * Math.sin(t * 0.47 + 1.3);
      ghost.dx = ghost.active ? x - ghost.x : 0;
      ghost.dy = ghost.active ? y - ghost.y : 0;
      ghost.x = x;
      ghost.y = y;
      ghost.active = true;
    } else {
      ghost.active = false;
    }
    trail!.update(ghost.active ? ghost : pointer, dt, time, config);

    const rainbow = config.palette === 'rainbow';
    const colors = rainbow ? [RAINBOW_BASE, RAINBOW_BASE, RAINBOW_BASE] : PALETTES[config.palette as keyof typeof PALETTES] ?? PALETTES.ember;
    const [base, mid, high] = colors.map(hexToRgb);

    haze.use();
    let u = haze.uniforms;
    gl.uniform1i(u.uTrail, trail!.texture.attach(0));
    gl.uniform1f(u.uAspect, (canvas.clientWidth || 1) / (canvas.clientHeight || 1));
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uStretch, config.stretch);
    gl.uniform1f(u.uAmbient, config.ambient);
    gl.uniform1f(u.uStir, config.stir);
    blit(light);

    composite.use();
    u = composite.uniforms;
    gl.uniform1i(u.uLight, light!.attach(1));
    gl.uniform3fv(u.uBase, base);
    gl.uniform3fv(u.uMid, mid);
    gl.uniform3fv(u.uHigh, high);
    gl.uniform1f(u.uIntensity, config.intensity);
    gl.uniform1f(u.uRainbow, rainbow ? 1 : 0);
    gl.uniform1f(u.uHue, time * 0.08);
    setGrain(gl, u, config.grain, grainClock);
    blit(null);
  });

  return {
    config,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
