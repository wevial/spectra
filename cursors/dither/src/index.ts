// Dither cursor — a ringed planet in ordered (Bayer) dither. The planet is lit
// from wherever the cursor is, so the terminator swings as you move; the
// cursor's trail paints light into the dither and coarsens it into chunky
// pixels that settle back as it fades.

import { Program, VERTEX, Trail, makeBlit, createStage } from '@spectra/core';
import { DITHER } from './shaders';

/** Four stops, dark to light. With `levels: 2` only the ends are used. */
export const PALETTES = {
  spectra: ['#120a1f', '#5c1d5e', '#ff6b4a', '#ffe8a3'],
  moon: ['#0b0a10', '#2c2547', '#8a7fb5', '#efe8ff'],
  phosphor: ['#020805', '#0b3a1c', '#2fbf5a', '#b8ffcc'],
  paper: ['#1a1612', '#5a4f43', '#b9ab93', '#efe6d2'],
} satisfies Record<string, [string, string, string, string]>;

export type PaletteName = keyof typeof PALETTES;

export const DEFAULTS = {
  palette: 'spectra' as PaletteName,
  /** Tones before dithering (2 = 1-bit). */
  levels: 3,
  /** Base dither cell, CSS px. */
  pixel: 3,
  /** Extra cell sizes the trail can add. */
  chunk: 3,
  /** Light the trail paints in. */
  glow: 0.7,
  contrast: 1.15,
  /** Brush radius, fraction of height. */
  radius: 0.16,
  /** Seconds for the trail to fall to ~5%. */
  fade: 1.2,
  /** How far the light swings toward the cursor, 0..1. */
  follow: 0.9,
};

export type DitherConfig = typeof DEFAULTS;

export interface DitherHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: DitherConfig;
  destroy(): void;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `dither-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<DitherConfig> = {}): DitherHandle {
  const config: DitherConfig = { ...DEFAULTS, ...opts };

  let trail: Trail | null = null;
  const stage = createStage(container, { floatTargets: true, onResize: () => trail?.resize() });
  if (!stage) {
    container.classList.add('dither-fallback');
    return { config, destroy() {} };
  }
  const { gl, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const program = new Program(gl, VERTEX, DITHER);
  trail = new Trail(gl, blit, 0.5);

  // Light direction eases toward the cursor; with no cursor it slowly orbits.
  const light = { x: -0.6, y: 0.4 };
  let time = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;
    trail!.update(pointer, dt, time, config);

    const target = pointer.active
      ? { x: (pointer.x - 0.5) * 2.4 * config.follow, y: (pointer.y - 0.5) * 2.4 * config.follow }
      : { x: Math.cos(time * 0.2) * 0.8, y: 0.35 + Math.sin(time * 0.2) * 0.3 };
    const k = 1 - Math.exp(-dt * 4);
    light.x += (target.x - light.x) * k;
    light.y += (target.y - light.y) * k;
    const len = Math.hypot(light.x, light.y, 0.6);

    const dpr = stage.dpr;
    const colors = (PALETTES[config.palette] ?? PALETTES.spectra).flatMap(hexToRgb);

    program.use();
    const u = program.uniforms;
    gl.uniform1i(u.uTrail, trail!.texture.attach(0));
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uPixel, Math.max(1, Math.round(config.pixel * dpr)));
    gl.uniform1f(u.uChunk, config.chunk);
    gl.uniform1f(u.uGlow, config.glow);
    gl.uniform1f(u.uLevels, Math.max(2, Math.round(config.levels)));
    gl.uniform1f(u.uContrast, config.contrast);
    gl.uniform3f(u.uLight, light.x / len, light.y / len, 0.6 / len);
    gl.uniform3fv(u['uPalette[0]'], colors);
    blit(null);
  });

  return {
    config,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
