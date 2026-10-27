// Lens cursor — an invisible point mass under the cursor that gravitationally
// lenses whatever it's mounted on: an image, a canvas, a video, or the default
// grid poster. Lines bow into arcs, things behind the lens become an Einstein
// ring, and inside the ring you see a small mirrored image. Hold the mouse
// button to add mass.

import { Program, VERTEX, makeBlit, createStage, SourceTexture } from '@spectra/core';
import type { Source } from '@spectra/core';
import { LENS } from './shaders';
import { drawPoster } from './poster';

export type LensSource = Source;

export const DEFAULTS = {
  /** Einstein radius, fraction of height. */
  mass: 0.12,
  /** Mass multiplier while the mouse button is held. */
  press: 2.2,
  /** Softening at the center, fraction of height (keeps the core from sparkling). */
  core: 0.006,
  /** Seconds for the lens to catch up with the cursor. */
  lag: 0.15,
  /** Seconds to drift back toward center after the cursor leaves. */
  idle: 6,
  font: '"Geist", "Inter", system-ui, sans-serif',
};

export type LensConfig = typeof DEFAULTS;

export interface LensHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: LensConfig;
  /** Swap what's being lensed. A string is loaded as an image URL; null restores the poster. */
  setSource(source: LensSource | null): Promise<void>;
  destroy(): void;
}

/**
 * Mount the lens into `container` (which should be positioned and sized).
 * `source` is drawn to cover the container; without one, a grid poster is
 * used. Without WebGL2 the container gets the `lens-fallback` class.
 */
export function mount(
  container: HTMLElement,
  opts: Partial<LensConfig> & { source?: LensSource } = {},
): LensHandle {
  const { source: initial, ...rest } = opts;
  const config: LensConfig = { ...DEFAULTS, ...rest };

  let posterDirty = true;
  const stage = createStage(container, { onResize: () => { posterDirty = true; } });
  if (!stage) {
    container.classList.add('lens-fallback');
    return { config, setSource: async () => {}, destroy() {} };
  }
  const { gl, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const program = new Program(gl, VERTEX, LENS);

  // Rays from inside the ring reach far outside the frame; mirror so they
  // still land on content.
  const content = new SourceTexture(gl, gl.MIRRORED_REPEAT);
  const posterCanvas = document.createElement('canvas');

  async function setSource(next: LensSource | null) {
    await content.set(next);
    if (next == null) posterDirty = true;
  }
  if (initial) void setSource(initial);
  // Redraw the poster once the web font arrives (first draw may use a fallback).
  document.fonts?.load(`500 64px ${config.font}`).then(() => { posterDirty = true; }, () => {});

  // Hold the button to add mass.
  let pressed = false;
  const ac = new AbortController();
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && pointer.active) pressed = true; }, { signal: ac.signal });
  window.addEventListener('pointerup', () => { pressed = false; }, { signal: ac.signal });
  window.addEventListener('blur', () => { pressed = false; }, { signal: ac.signal });

  // The lens eases toward the cursor; with no cursor it drifts near center.
  const lens = { x: 0.5, y: 0.5, mass: config.mass };
  const anchor = { x: 0.5, y: 0.5 }; // where the lens was when the cursor left
  let idleTime = 0;
  let time = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;

    if (content.source === null) {
      if (posterDirty) {
        drawPoster(posterCanvas, gl.drawingBufferWidth, gl.drawingBufferHeight, config.font);
        content.upload(posterCanvas, posterCanvas.width, posterCanvas.height);
        posterDirty = false;
      }
    } else {
      content.tick();
    }

    // When the cursor leaves, the lens stays put, then over `idle` seconds
    // eases into a slow wander around center instead of snapping there.
    if (pointer.active) {
      idleTime = 0;
    } else {
      if (idleTime === 0) { anchor.x = lens.x; anchor.y = lens.y; }
      idleTime += dt;
    }
    const wander = { x: 0.5 + Math.sin(time * 0.21) * 0.12, y: 0.45 + Math.sin(time * 0.29) * 0.08 };
    const s = Math.min(idleTime / Math.max(config.idle, 0.001), 1);
    const settle = s * s * (3 - 2 * s);
    const target = pointer.active
      ? { x: pointer.x, y: pointer.y }
      : { x: anchor.x + (wander.x - anchor.x) * settle, y: anchor.y + (wander.y - anchor.y) * settle };
    const lag = pointer.active ? config.lag : Math.max(config.lag, 1);
    const k = 1 - Math.exp(-dt / Math.max(lag / 3, 0.001));
    lens.x += (target.x - lens.x) * k;
    lens.y += (target.y - lens.y) * k;
    const targetMass = config.mass * (pressed ? config.press : 1);
    lens.mass += (targetMass - lens.mass) * (1 - Math.exp(-dt * 5));

    const fit = content.cover(gl.drawingBufferWidth, gl.drawingBufferHeight);

    program.use();
    const u = program.uniforms;
    gl.uniform1i(u.uSource, content.attach(0));
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(u.uLens, lens.x, lens.y);
    gl.uniform1f(u.uMass, lens.mass);
    gl.uniform1f(u.uCore, config.core);
    gl.uniform4f(u.uFit, fit[0], fit[1], fit[2], fit[3]);
    blit(null);
  });

  return {
    config,
    setSource,
    destroy() {
      ac.abort();
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
