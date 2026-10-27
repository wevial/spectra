// Filings cursor — iron filings scattered on paper, with a bar magnet under
// it that follows the cursor (turning to face the way you move). Filings
// swing into field lines once the field beats their friction, and stay put
// when it fades, so the path you drew stays imprinted. Click to pin a magnet;
// pinned fields add up.

import { Program, VERTEX, makeBlit, createStage, createDoubleFBO } from '@spectra/core';
import type { DoubleFBO } from '@spectra/core';
import { INIT, UPDATE, RENDER } from './shaders';

export const DEFAULTS = {
  /** Grid cell, CSS px; one filing per cell at most. */
  cell: 5,
  /** Share of cells holding a filing. */
  density: 0.45,
  /** Filing length, cells. */
  length: 1.7,
  /** Magnet strength. */
  strength: 3,
  /** Pole separation, CSS px. */
  gap: 70,
  /** Field a filing needs before it turns; higher keeps them lazier. */
  friction: 0.012,
  /** How fast filings swing. */
  spin: 6,
  /** How hard strong fields drag filings toward the poles. */
  pull: 2,
  /** Seconds for the magnet to turn toward the way you move. */
  turn: 0.25,
  /** Magnets you can pin with clicks; the oldest goes first. */
  pins: 6,
  paper: '#eee8db',
  ink: '#29292e',
  shadow: 0.3,
  /** How visible the magnets are through the paper. */
  hint: 1,
};

export type FilingsConfig = typeof DEFAULTS;

export interface FilingsHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: FilingsConfig;
  /** Scatter the filings again, as if the paper were shaken. */
  shake(): void;
  /** Remove pinned magnets. */
  clear(): void;
  destroy(): void;
}

interface Magnet { x: number; y: number; angle: number }

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

const MAGNETS = 8;

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `filings-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<FilingsConfig> = {}): FilingsHandle {
  const config: FilingsConfig = { ...DEFAULTS, ...opts };

  let onResize = () => {};
  const stage = createStage(container, { floatTargets: true, onResize: () => onResize() });
  if (!stage) {
    container.classList.add('filings-fallback');
    return { config, shake() {}, clear() {}, destroy() {} };
  }
  const { gl, canvas, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const init = new Program(gl, VERTEX, INIT);
  const update = new Program(gl, VERTEX, UPDATE);
  const render = new Program(gl, VERTEX, RENDER);

  let state: DoubleFBO | null = null;
  let cell = 0;

  function shake() {
    cell = config.cell;
    const w = Math.max(1, Math.ceil(canvas.clientWidth / cell));
    const h = Math.max(1, Math.ceil(canvas.clientHeight / cell));
    if (!state || state.width !== w || state.height !== h) {
      state?.dispose();
      state = createDoubleFBO(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
    }
    init.use();
    gl.uniform1f(init.uniforms.uSeed, Math.random() * 1000);
    blit(state.read);
  }
  onResize = shake;
  shake();

  const pinned: Magnet[] = [];
  // The carried magnet: where the cursor is, turned toward the way it moves.
  const carried: Magnet = { x: 0.5, y: 0.5, angle: 0 };
  const ghost: Magnet = { x: 0.5, y: 0.5, angle: 0 };
  let idle = 0;
  let time = 0;

  const ac = new AbortController();
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !pointer.active) return;
    pinned.push({ ...carried });
    while (pinned.length > Math.max(0, Math.min(config.pins, MAGNETS - 1))) pinned.shift();
  }, { signal: ac.signal });

  function turnToward(m: Magnet, dx: number, dy: number, dt: number) {
    if (Math.hypot(dx, dy) < 1e-5) return;
    // A heading, not an axis: which pole leads matters once fields combine.
    let d = Math.atan2(dy, dx) - m.angle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.angle += d * (1 - Math.exp(-dt / Math.max(config.turn / 3, 0.001)));
  }

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;
    if (config.cell !== cell) shake();
    const s = state!;
    const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);

    if (pointer.active) {
      idle = 0;
      carried.x = pointer.x;
      carried.y = pointer.y;
      turnToward(carried, pointer.dx * aspect, pointer.dy, dt);
    } else {
      idle += dt;
    }

    // No cursor and nothing pinned (touch, a preview card): a ghost magnet
    // wanders and draws lines on its own.
    const magnets: Magnet[] = [...pinned];
    if (pointer.active) magnets.push(carried);
    else if (!pinned.length && idle > 1 && !reducedMotion.matches) {
      const t = time * 0.35;
      const x = 0.5 + 0.34 * Math.sin(t * 0.9) * Math.cos(t * 0.31);
      const y = 0.5 + 0.3 * Math.sin(t * 0.67 + 0.8);
      turnToward(ghost, (x - ghost.x) * aspect, y - ghost.y, dt);
      ghost.x = x;
      ghost.y = y;
      magnets.push(ghost);
    }

    const mag = new Float32Array(MAGNETS * 4);
    magnets.slice(-MAGNETS).forEach((m, i) => {
      // In cells; cells are square, so screen-space angles carry over.
      mag.set([m.x * canvas.clientWidth / cell, m.y * canvas.clientHeight / cell, m.angle, config.strength], i * 4);
    });
    const gap = config.gap / cell;

    update.use();
    let u = update.uniforms;
    gl.uniform1i(u.uState, s.read.attach(0));
    gl.uniform4fv(u['uMag[0]'], mag);
    gl.uniform1f(u.uGap, gap);
    gl.uniform1f(u.uDt, dt);
    gl.uniform1f(u.uFriction, config.friction);
    gl.uniform1f(u.uSpin, config.spin);
    gl.uniform1f(u.uPull, config.pull);
    blit(s.write);
    s.swap();

    const dpr = gl.drawingBufferWidth / Math.max(canvas.clientWidth, 1);
    render.use();
    u = render.uniforms;
    gl.uniform1i(u.uState, s.read.attach(0));
    gl.uniform4fv(u['uMag[0]'], mag);
    gl.uniform1f(u.uGap, gap);
    gl.uniform2f(u.uCells, s.width, s.height);
    gl.uniform1f(u.uCellPx, cell * dpr);
    gl.uniform1f(u.uDensity, config.density);
    gl.uniform1f(u.uLength, config.length);
    // A filing reaches half its length (+ width) from its cell's center.
    gl.uniform1i(u.uReach, config.length * 0.5 + 0.15 > 1.0 ? 2 : 1);
    gl.uniform3fv(u.uPaper, hexToRgb(config.paper));
    gl.uniform3fv(u.uInk, hexToRgb(config.ink));
    gl.uniform1f(u.uShadow, config.shadow);
    gl.uniform1f(u.uHint, config.hint);
    blit(null);
  });

  return {
    config,
    shake,
    clear() { pinned.length = 0; },
    destroy() {
      ac.abort();
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
