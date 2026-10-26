// Lens cursor — an invisible point mass under the cursor that gravitationally
// lenses whatever it's mounted on: an image, a canvas, a video, or the default
// grid poster. Lines bow into arcs, things behind the lens become an Einstein
// ring, and inside the ring you see a small mirrored image. Hold the mouse
// button to add mass.

import { Program, VERTEX, makeBlit, createStage } from '@spectra/core';
import { LENS } from './shaders';
import { drawPoster } from './poster';

export type LensSource = string | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

export const DEFAULTS = {
  /** Einstein radius, fraction of height. */
  mass: 0.12,
  /** Mass multiplier while the mouse button is held. */
  press: 2.2,
  /** Softening at the center, fraction of height (keeps the core from sparkling). */
  core: 0.006,
  /** Seconds for the lens to catch up with the cursor. */
  lag: 0.15,
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

  const tex = gl.createTexture()!;
  const posterCanvas = document.createElement('canvas');
  let source: Exclude<LensSource, string> | null = null; // null = poster
  let size = { w: 1, h: 1 };

  function upload(el: TexImageSource, w: number, h: number) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // Mipmaps: the lens squeezes content hard near the ring.
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // Rays from inside the ring reach far outside the frame; mirror so they
    // still land on content.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    size = { w, h };
  }

  function drawPosterNow() {
    drawPoster(posterCanvas, gl.drawingBufferWidth, gl.drawingBufferHeight, config.font);
    upload(posterCanvas, posterCanvas.width, posterCanvas.height);
    posterDirty = false;
  }

  function dims(el: Exclude<LensSource, string>) {
    if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight };
    if (el instanceof HTMLImageElement) return { w: el.naturalWidth, h: el.naturalHeight };
    return { w: el.width, h: el.height };
  }

  async function setSource(next: LensSource | null) {
    if (next == null) {
      source = null;
      posterDirty = true;
      return;
    }
    let el: Exclude<LensSource, string>;
    if (typeof next === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = next;
      await img.decode();
      el = img;
    } else {
      el = next;
      if (el instanceof HTMLImageElement && !el.complete) await el.decode();
    }
    source = el;
    if (!(el instanceof HTMLVideoElement)) {
      const d = dims(el);
      upload(el, d.w, d.h);
    }
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
  let time = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;

    if (source === null) {
      if (posterDirty) drawPosterNow();
    } else if (source instanceof HTMLVideoElement && source.readyState >= 2) {
      upload(source, source.videoWidth, source.videoHeight);
    }

    const target = pointer.active
      ? { x: pointer.x, y: pointer.y }
      : { x: 0.5 + Math.sin(time * 0.21) * 0.12, y: 0.45 + Math.sin(time * 0.29) * 0.08 };
    const k = 1 - Math.exp(-dt / Math.max(config.lag / 3, 0.001));
    lens.x += (target.x - lens.x) * k;
    lens.y += (target.y - lens.y) * k;
    const targetMass = config.mass * (pressed ? config.press : 1);
    lens.mass += (targetMass - lens.mass) * (1 - Math.exp(-dt * 5));

    // Cover: fill the stage, crop the longer side of the content.
    const sa = gl.drawingBufferWidth / gl.drawingBufferHeight;
    const ca = size.w / Math.max(size.h, 1);
    const fit = sa > ca
      ? [1, ca / sa, 0, 0.5 - 0.5 * (ca / sa)]
      : [sa / ca, 1, 0.5 - 0.5 * (sa / ca), 0];

    program.use();
    const u = program.uniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(u.uSource, 0);
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
