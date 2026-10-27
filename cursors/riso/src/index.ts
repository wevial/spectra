// Riso cursor — any image printed as a risograph: separated into two or three
// spot inks, screened as grainy halftones at different angles and overprinted
// on warm paper, a little out of register. Moving the cursor knocks the ink
// layers further out of register along your path; they settle back as the
// trail fades.

import { Program, VERTEX, Trail, makeBlit, createStage, SourceTexture } from '@spectra/core';
import type { Source } from '@spectra/core';
import { RISO } from './shaders';
import { drawPoster } from './poster';
import { separation, linear } from './separation';

export { separation };

export type RisoSource = Source;

/** Ink sets, in print order. Colors are each ink as printed on white. */
export const INKS = {
  pop: ['#ff48b0', '#0078bf', '#ffe800'],
  duo: ['#ff48b0', '#3d5588'],
  grove: ['#00a95c', '#ff6c2f'],
  sunset: ['#ff665e', '#765ba7', '#ffb511'],
  mono: ['#3d5588'],
} satisfies Record<string, string[]>;

export type InkSet = keyof typeof INKS;

export const DEFAULTS = {
  inks: 'pop' as InkSet,
  paper: '#f4efe4',
  /** Halftone cell, CSS px. */
  dot: 6,
  /** Uneven ink: speckle, mottling, starved bands. */
  grain: 0.45,
  /** Resting misregistration, CSS px. */
  register: 1.5,
  /** How far the cursor knocks layers apart, CSS px. */
  push: 30,
  contrast: 1.1,
  /** Trail brush radius, fraction of height. */
  radius: 0.14,
  /** Seconds for the layers to settle back to ~5%. */
  fade: 1.4,
  font: '"Geist", "Inter", system-ui, sans-serif',
};

export type RisoConfig = typeof DEFAULTS;

export interface RisoHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: RisoConfig;
  /** Swap what's being printed. A string is loaded as an image URL; null restores the poster. */
  setSource(source: RisoSource | null): Promise<void>;
  destroy(): void;
}

/**
 * Mount the print into `container` (which should be positioned and sized).
 * `source` is drawn to cover the container; without one, a sunset poster is
 * used. Without WebGL2 + float targets the container gets the `riso-fallback`
 * class instead.
 */
export function mount(
  container: HTMLElement,
  opts: Partial<RisoConfig> & { source?: RisoSource } = {},
): RisoHandle {
  const { source: initial, ...rest } = opts;
  const config: RisoConfig = { ...DEFAULTS, ...rest };

  let trail: Trail | null = null;
  let posterDirty = true;
  const stage = createStage(container, {
    floatTargets: true,
    onResize: () => { trail?.resize(); posterDirty = true; },
  });
  if (!stage) {
    container.classList.add('riso-fallback');
    return { config, setSource: async () => {}, destroy() {} };
  }
  const { gl, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const program = new Program(gl, VERTEX, RISO);
  trail = new Trail(gl, blit, 0.5);
  const content = new SourceTexture(gl);
  const posterCanvas = document.createElement('canvas');

  async function setSource(next: RisoSource | null) {
    await content.set(next);
    if (next == null) posterDirty = true;
  }
  if (initial) void setSource(initial);
  document.fonts?.load(`500 64px ${config.font}`).then(() => { posterDirty = true; }, () => {});

  // The separation only changes with the inks or paper.
  let sepKey = '';
  let sep: number[][] = [];
  let inkColors: number[] = [];
  let time = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;
    trail!.update(pointer, dt, time, config);

    if (content.source === null) {
      if (posterDirty) {
        // The poster is drawn in CSS px: the print's grain and dots are what's fine, not the art.
        const dpr = stage.dpr;
        drawPoster(posterCanvas, Math.round(gl.drawingBufferWidth / dpr), Math.round(gl.drawingBufferHeight / dpr), config.font);
        content.upload(posterCanvas, posterCanvas.width, posterCanvas.height);
        posterDirty = false;
      }
    } else {
      content.tick();
    }

    const inks = INKS[config.inks] ?? INKS.pop;
    const key = inks.join() + config.paper;
    if (key !== sepKey) {
      sepKey = key;
      sep = separation(inks, config.paper);
      inkColors = inks.flatMap(linear);
    }
    const pad = (rows: number[], size: number) => [...rows, ...Array(Math.max(0, size - rows.length)).fill(0)];

    const dpr = stage.dpr;
    const r = config.register * dpr;
    // Spread: the first and last layers move opposite ways, a middle one stays.
    const spread = inks.length === 1 ? [1] : inks.map((_, i) => i / (inks.length - 1) * 2 - 1);

    program.use();
    const u = program.uniforms;
    gl.uniform1i(u.uSource, content.attach(0));
    gl.uniform1i(u.uTrail, trail!.texture.attach(1));
    gl.uniform4fv(u.uFit, content.cover(gl.drawingBufferWidth, gl.drawingBufferHeight));
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.uDot, Math.max(2, config.dot * dpr));
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform3fv(u.uPaper, linear(config.paper));
    gl.uniform3fv(u['uInk[0]'], pad(inkColors, 9));
    gl.uniform3fv(u['uSep[0]'], pad(sep.flat(), 9));
    gl.uniform2fv(u['uOffset[0]'], [0, 0, r, -r * 0.6, -r * 0.7, r * 0.9]);
    gl.uniform1fv(u['uSpread[0]'], pad(spread, 3));
    gl.uniform1f(u.uInks, inks.length);
    gl.uniform1f(u.uPush, config.push * dpr);
    gl.uniform1f(u.uGrain, config.grain);
    gl.uniform1f(u.uContrast, config.contrast);
    gl.uniform1f(u.uTime, time);
    blit(null);
  });

  return {
    config,
    setSource,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
