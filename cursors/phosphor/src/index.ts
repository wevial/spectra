// Phosphor cursor — a vector CRT where the cursor is the electron beam. Where
// it passes the phosphor flashes, then fades through a long afterglow (P7:
// blue-white flash, yellow-green glow). A lingering beam burns brighter than a
// fast one, as the real thing does. Hold the button to turn the intensity up.
// With no cursor the beam traces a slowly turning Lissajous figure.

import { Program, VERTEX, makeBlit, createStage, createFBO, createDoubleFBO } from '@spectra/core';
import type { FBO, DoubleFBO } from '@spectra/core';
import { BEAM, DOWN, BLUR, CRT, MAX_POINTS } from './shaders';

/** fast: flash color, slow: afterglow color, seconds for each to fall to ~5%, afterglow share. */
export const PHOSPHORS = {
  p7: { fast: '#a8c4ff', slow: '#b4ff3c', fastFade: 0.12, slowFade: 3, share: 0.6 },
  p1: { fast: '#7dffa0', slow: '#2bd35a', fastFade: 0.06, slowFade: 0.7, share: 0.6 },
  p3: { fast: '#ffd794', slow: '#ff9a1f', fastFade: 0.06, slowFade: 1.4, share: 0.5 },
  p4: { fast: '#ffffff', slow: '#9fb4ff', fastFade: 0.04, slowFade: 0.35, share: 0.3 },
} satisfies Record<string, { fast: string; slow: string; fastFade: number; slowFade: number; share: number }>;

export type PhosphorName = keyof typeof PHOSPHORS;

export const DEFAULTS = {
  phosphor: 'p7' as PhosphorName,
  /** Beam brightness. */
  intensity: 1,
  /** Intensity multiplier while the mouse button is held. */
  boost: 4,
  /** Scales both fade times. */
  persistence: 1,
  /** Beam width (sigma), CSS px. */
  beam: 1.6,
  /** Screen curvature. */
  curve: 0.06,
  bloom: 1,
  /** Raster lines, 0..1 (a vector scope has none). */
  scanlines: 0.25,
  graticule: 1,
  exposure: 1.2,
};

export type PhosphorConfig = typeof DEFAULTS;

export interface PhosphorHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: PhosphorConfig;
  destroy(): void;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `phosphor-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<PhosphorConfig> = {}): PhosphorHandle {
  const config: PhosphorConfig = { ...DEFAULTS, ...opts };

  let onResize = () => {};
  const stage = createStage(container, { floatTargets: true, dprCap: 1.5, onResize: () => onResize() });
  if (!stage) {
    container.classList.add('phosphor-fallback');
    return { config, destroy() {} };
  }
  const { gl, canvas, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const beam = new Program(gl, VERTEX, BEAM);
  const down = new Program(gl, VERTEX, DOWN);
  const blur = new Program(gl, VERTEX, BLUR);
  const crt = new Program(gl, VERTEX, CRT);

  let persist: DoubleFBO | null = null;
  let bloomA: FBO | null = null;
  let bloomB: FBO | null = null;
  onResize = () => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const next = createDoubleFBO(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    persist?.dispose();
    persist = next;
    bloomA?.dispose();
    bloomB?.dispose();
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    bloomA = createFBO(gl, bw, bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    bloomB = createFBO(gl, bw, bh, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  };
  onResize();

  // Screen → tube space, so the trace lands under the cursor after the
  // curvature (the CRT pass samples the tube at tube(screen uv)).
  const tube = (x: number, y: number): [number, number] => {
    const cx = x * 2 - 1, cy = y * 2 - 1;
    const s = 1 + config.curve * (cx * cx + cy * cy);
    return [cx * s * 0.5 + 0.5, cy * s * 0.5 + 0.5];
  };

  // Every pointer position since the last frame (coalesced events too), so
  // fast curves stay curves instead of straight chords between frames.
  let path: [number, number][] = [];
  let last: [number, number] | null = null;
  let pressed = false;
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    for (const ev of e.getCoalescedEvents?.() ?? [e]) {
      const x = (ev.clientX - r.left) / r.width;
      const y = 1 - (ev.clientY - r.top) / r.height;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) path.push([x, y]);
    }
  }, listen);
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && pointer.active) pressed = true; }, listen);
  window.addEventListener('pointerup', () => { pressed = false; }, listen);
  window.addEventListener('blur', () => { pressed = false; }, listen);

  let idle = 0;
  let time = 0;
  let ghostT = 0;
  const pts = new Float32Array(MAX_POINTS * 2);

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;
    const p = persist!;
    const kind = PHOSPHORS[config.phosphor] ?? PHOSPHORS.p7;

    // This frame's beam path, in screen uv.
    let screen: [number, number][] = [];
    if (pointer.active) {
      idle = 0;
      screen = [...(last ? [last] : []), ...path];
      if (!screen.length) screen = [[pointer.x, pointer.y]];
      last = screen[screen.length - 1];
    } else {
      idle += dt;
      last = null;
      // No cursor: trace a slowly turning 3:2 Lissajous figure.
      if (idle > 1 && !reducedMotion.matches) {
        const t0 = ghostT;
        ghostT += dt;
        for (let i = 0; i <= 24; i++) {
          const t = t0 + (ghostT - t0) * (i / 24);
          const phase = t * 0.15;
          screen.push([0.5 + 0.3 * Math.sin(3 * t * 1.1 + phase), 0.5 + 0.32 * Math.sin(2 * t * 1.1)]);
        }
      }
    }
    path = [];

    // Thin out to what the shader takes, keeping both ends.
    if (screen.length > MAX_POINTS) {
      const step = (screen.length - 1) / (MAX_POINTS - 1);
      screen = Array.from({ length: MAX_POINTS }, (_, i) => screen[Math.round(i * step)]);
    }
    const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
    let length = 0;
    screen.forEach(([x, y], i) => {
      const [tx, ty] = tube(x, y);
      pts[i * 2] = tx;
      pts[i * 2 + 1] = ty;
      if (i) length += Math.hypot((x - screen[i - 1][0]) * aspect, y - screen[i - 1][1]);
    });

    // A lingering beam deposits more (energy per frame is spread over the
    // path), softened so a quick stroke still glows.
    const width = config.beam / Math.max(canvas.clientHeight, 1);
    const dwell = Math.sqrt((width * 4) / (width * 4 + length));
    const energy = config.intensity * (pressed ? config.boost : 1) * dwell * (dt * 60) * 2.5;
    const fade = (seconds: number) => Math.pow(0.05, dt / Math.max(seconds * config.persistence, 0.01));

    beam.use();
    let u = beam.uniforms;
    gl.uniform1i(u.uPersist, p.read.attach(0));
    gl.uniform2fv(u['uPts[0]'], pts);
    gl.uniform1i(u.uCount, screen.length);
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uWidth, width);
    gl.uniform2f(u.uDecay, fade(kind.fastFade), fade(kind.slowFade));
    gl.uniform1f(u.uEnergy, energy);
    gl.uniform1f(u.uSlowShare, kind.share);
    blit(p.write);
    p.swap();

    // Bloom: quarter-res copy, blurred both ways.
    const a = bloomA!, b = bloomB!;
    down.use();
    gl.uniform1i(down.uniforms.uSrc, p.read.attach(0));
    gl.uniform2f(down.uniforms.uTexel, 1 / p.width, 1 / p.height);
    blit(a);
    blur.use();
    gl.uniform1i(blur.uniforms.uSrc, a.attach(0));
    gl.uniform2f(blur.uniforms.uStep, 1 / a.width, 0);
    blit(b);
    gl.uniform1i(blur.uniforms.uSrc, b.attach(0));
    gl.uniform2f(blur.uniforms.uStep, 0, 1 / a.height);
    blit(a);

    const dpr = gl.drawingBufferWidth / Math.max(canvas.clientWidth, 1);
    crt.use();
    u = crt.uniforms;
    gl.uniform1i(u.uPersist, p.read.attach(0));
    gl.uniform1i(u.uBloom, a.attach(1));
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uCurve, config.curve);
    gl.uniform1f(u.uScan, config.scanlines);
    gl.uniform1f(u.uGraticule, config.graticule);
    gl.uniform1f(u.uBloomAmt, config.bloom);
    gl.uniform1f(u.uExposure, config.exposure);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform3fv(u.uFast, hexToRgb(kind.fast));
    gl.uniform3fv(u.uSlow, hexToRgb(kind.slow));
    blit(null);
  });

  return {
    config,
    destroy() {
      ac.abort();
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
