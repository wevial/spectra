// Film cursor — holographic "cracked ice" window film with the sun behind it.
// Every shard of the film is a diffraction grating at its own angle and
// pitch. Seen directly, the shards shimmer in pastel tints that shift as the
// sun moves; the light they split fans out around the sun as a burst of short
// rainbow dashes, red outermost. The cursor is the sun. Hold the mouse button
// to brighten it.

import { Program, VERTEX, makeBlit, createStage } from '@spectra/core';
import { FILM } from './shaders';
import { spectrumTable } from './spectrum';
import { dashTable, RINGS } from './dashes';

export { wavelengthToRgb } from './spectrum';

export const DEFAULTS = {
  /** Sun brightness. */
  sun: 1,
  /** Brightness multiplier while the mouse button is held. */
  press: 2.2,
  /** Sun radius, fraction of height. */
  size: 0.035,
  /** Distance from the sun of a mid-pitch shard's green, fraction of height. */
  spread: 0.3,
  /** Dash slots per ring (three rings). */
  rays: 120,
  /** Dash length, × the grating equation's (shorter reads more like dashes). */
  length: 0.5,
  /** Dash width, fraction of height. */
  width: 0.0035,
  /** Shards per screen height. */
  shards: 7,
  /** Pastel iridescence of the film itself. */
  sheen: 1,
  /** Brightness of the crack lines. */
  cracks: 1,
  /** Seconds for the sun to catch up with the cursor. */
  lag: 0.12,
  /** Seconds to drift into a slow wander after the cursor leaves. */
  idle: 4,
  /** Which sheet of film: a new seed reshuffles shards and dashes. */
  seed: 0,
};

export type FilmConfig = typeof DEFAULTS;

export interface FilmHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: FilmConfig;
  /** A new sheet: reshuffles the shards and the dashes they throw. */
  shuffle(): void;
  destroy(): void;
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 the container gets the `film-fallback` class instead.
 */
export function mount(container: HTMLElement, opts: Partial<FilmConfig> = {}): FilmHandle {
  const config: FilmConfig = { ...DEFAULTS, ...opts };

  const stage = createStage(container);
  const shuffle = () => { config.seed = Math.floor(Math.random() * 1000); };
  if (!stage) {
    container.classList.add('film-fallback');
    return { config, shuffle, destroy() {} };
  }
  const { gl, canvas, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const program = new Program(gl, VERTEX, FILM);

  const table = spectrumTable(256);
  const spectrum = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, spectrum);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, table.length / 4, 1, 0, gl.RGBA, gl.FLOAT, table);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // The dash slots, rebuilt when the sheet or the slot count changes.
  const dashes = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, dashes);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  let dashKey = '';
  let ringOffsets: number[] = [];

  // Hold the button to brighten the sun.
  let pressed = false;
  const ac = new AbortController();
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && pointer.active) pressed = true; }, { signal: ac.signal });
  window.addEventListener('pointerup', () => { pressed = false; }, { signal: ac.signal });
  window.addEventListener('blur', () => { pressed = false; }, { signal: ac.signal });

  // The sun eases toward the cursor; with none, it wanders slowly.
  const sun = { x: 0.5, y: 0.55, power: config.sun };
  const anchor = { x: sun.x, y: sun.y };
  let idle = 0;
  let time = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;
    const a = canvas.clientWidth / Math.max(canvas.clientHeight, 1);

    if (pointer.active) {
      idle = 0;
    } else {
      if (idle === 0) { anchor.x = sun.x; anchor.y = sun.y; }
      idle += dt;
    }
    const s = Math.min(idle / Math.max(config.idle, 0.001), 1);
    const settle = s * s * (3 - 2 * s);
    const wx = 0.5 + Math.sin(time * 0.13) * 0.2, wy = 0.55 + Math.sin(time * 0.19 + 1) * 0.12;
    const tx = pointer.active ? pointer.x : anchor.x + (wx - anchor.x) * settle;
    const ty = pointer.active ? pointer.y : anchor.y + (wy - anchor.y) * settle;
    const lag = pointer.active ? config.lag : Math.max(config.lag, 1);
    const k = 1 - Math.exp(-dt / Math.max(lag / 3, 0.001));
    sun.x += (tx - sun.x) * k;
    sun.y += (ty - sun.y) * k;
    sun.power += (config.sun * (pressed ? config.press : 1) - sun.power) * (1 - Math.exp(-dt * 6));

    const rays = Math.max(Math.round(config.rays), 1);
    if (dashKey !== `${rays} ${config.seed}`) {
      const table = dashTable(rays, config.seed);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, dashes);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, rays, RINGS * 2, 0, gl.RGBA, gl.FLOAT, table.texels);
      ringOffsets = table.offsets;
      dashKey = `${rays} ${config.seed}`;
    }

    program.use();
    const u = program.uniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, spectrum);
    gl.uniform1i(u.uSpectrum, 0);
    gl.uniform1f(u.uAspect, a);
    gl.uniform1f(u.uPx, gl.drawingBufferHeight);
    gl.uniform2f(u.uSun, sun.x * a, sun.y);
    gl.uniform1f(u.uPower, sun.power);
    gl.uniform1f(u.uSize, config.size);
    gl.uniform1f(u.uSpread, config.spread);
    gl.uniform1f(u.uRays, rays);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dashes);
    gl.uniform1i(u.uDashes, 1);
    gl.uniform1fv(u['uRingOffset[0]'], ringOffsets);
    gl.uniform1f(u.uWidth, config.width);
    gl.uniform1f(u.uLength, Math.max(config.length, 0.05));
    gl.uniform1f(u.uShards, config.shards);
    gl.uniform1f(u.uSheen, config.sheen);
    gl.uniform1f(u.uCracks, config.cracks);
    gl.uniform1f(u.uSeed, config.seed);
    gl.uniform1f(u.uTime, time);
    blit(null);
  });

  return {
    config,
    shuffle,
    destroy() {
      ac.abort();
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
