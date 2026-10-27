// Mycelium cursor — a Physarum-style network grown by hundreds of thousands of agents that
// follow and lay scent. It blooms from the middle, branches out and keeps
// rerouting itself. The cursor's trail smells like food: veins bend toward
// wherever you've been and thicken along your path.

import { Program, VERTEX, Trail, makeBlit, createStage, createFBO, createDoubleFBO } from '@spectra/core';
import type { DoubleFBO } from '@spectra/core';
import { AGENT_INIT, AGENT_STEP, DEPOSIT_VERT, DEPOSIT_FRAG, DIFFUSE, RENDER } from './shaders';

/** Four colors: ground, haze (faint exploration), hyphae, glowing hubs. */
export const PALETTES = {
  forest: ['#0d0a07', '#3a3022', '#ece2c9', '#b4ffc8'],
  spore: ['#0c0814', '#2e1f45', '#d9c6f2', '#ff9ad6'],
  petri: ['#c99a4f', '#d8b373', '#fff8ea', '#ffffff'],
} satisfies Record<string, [string, string, string, string]>;

export type PaletteName = keyof typeof PALETTES;

export const DEFAULTS = {
  palette: 'forest' as PaletteName,
  /** Agents per grid cell. Changing it re-seeds the colony. */
  density: 0.5,
  /** Grid cell, CSS px. Bigger cells grow coarser veins. Grows on very large screens to stay fast. */
  cell: 1,
  /** Sensor spread, radians. Wider spreads make finer, loopier nets. */
  sensorAngle: 0.4,
  /** How far ahead agents sense, cells. Further = longer, straighter veins. */
  sensorDist: 14,
  /** Turn per step, radians. */
  turn: 0.785,
  /** Random heading jitter per step, radians; wigglier hyphae. */
  wander: 0.15,
  /** Cells per step. */
  speed: 1,
  /** Simulation steps per frame (at 60fps). */
  steps: 2,
  deposit: 0.1,
  /** Scent kept per step, 0..1; lower evaporates unused paths faster. */
  decay: 0.9,
  /** Scent value of the cursor trail; how hard the net reaches for it. */
  attract: 1,
  /** Scent-to-brightness. */
  gain: 1,
  glow: 1,
  /** Trail brush radius, fraction of height. */
  radius: 0.08,
  /** Seconds for the trail to fall to ~5%. */
  fade: 2.5,
};

export type MyceliumConfig = typeof DEFAULTS;

/** Upper bound on grid cells (and so agents), for very large screens. */
const MAX_CELLS = 1.2e6;

export interface MyceliumHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: MyceliumConfig;
  /** Clear the plate and bloom a fresh colony from the middle. */
  reset(): void;
  destroy(): void;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `mycelium-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<MyceliumConfig> = {}): MyceliumHandle {
  const config: MyceliumConfig = { ...DEFAULTS, ...opts };

  let trail: Trail | null = null;
  let onResize = () => {};
  const stage = createStage(container, {
    floatTargets: true,
    onResize: () => { trail?.resize(); onResize(); },
  });
  if (!stage) {
    container.classList.add('mycelium-fallback');
    return { config, reset() {}, destroy() {} };
  }
  const { gl, canvas, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const init = new Program(gl, VERTEX, AGENT_INIT);
  const step = new Program(gl, VERTEX, AGENT_STEP);
  const deposit = new Program(gl, DEPOSIT_VERT, DEPOSIT_FRAG);
  const diffuse = new Program(gl, VERTEX, DIFFUSE);
  const render = new Program(gl, VERTEX, RENDER);
  trail = new Trail(gl, blit, 0.5);

  // One point per agent; the vertex shader looks its position up by index.
  const points = gl.createVertexArray();
  const indexBuf = gl.createBuffer();

  let field: DoubleFBO | null = null;
  let agents: DoubleFBO | null = null;
  let side = 0;
  let cell = 0;
  let density = 0;

  function makeField() {
    cell = config.cell;
    const size = Math.max(cell, Math.sqrt(canvas.clientWidth * canvas.clientHeight / MAX_CELLS));
    const w = Math.max(1, Math.round(canvas.clientWidth / size));
    const h = Math.max(1, Math.round(canvas.clientHeight / size));
    field?.dispose();
    field = createDoubleFBO(gl, w, h, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.LINEAR);
    // The plate wraps (agents do too), so the blur and sensors must as well.
    for (const fbo of [field.read, field.write]) {
      fbo.attach(0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
  }

  function reset() {
    makeField();
    density = config.density;
    const f = field!;
    side = Math.max(16, Math.ceil(Math.sqrt(f.width * f.height * density)));
    agents?.dispose();
    agents = createDoubleFBO(gl, side, side, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST);
    init.use();
    gl.uniform1f(init.uniforms.uAspect, f.width / f.height);
    gl.uniform1f(init.uniforms.uSeed, Math.random() * 1000);
    blit(agents.read);

    gl.bindVertexArray(points);
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from({ length: side * side }, (_, i) => i), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  // Agents live in uv space, so they survive a resize; only the scent restarts.
  onResize = () => { if (field) makeField(); };

  reset();
  let time = 0;
  let carry = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;
    if (config.density !== density) reset();
    else if (config.cell !== cell) makeField();
    trail!.update(pointer, dt, time, config);
    const f = field!;
    const a = agents!;

    // Fixed steps per second regardless of frame rate; reduced motion crawls.
    carry += (reducedMotion.matches ? 0.25 : config.steps) * dt * 60;
    const steps = Math.min(Math.floor(carry), 8);
    carry -= steps;

    for (let i = 0; i < steps; i++) {
      step.use();
      let u = step.uniforms;
      gl.uniform1i(u.uAgents, a.read.attach(0));
      gl.uniform1i(u.uField, f.read.attach(1));
      gl.uniform1i(u.uTrail, trail!.texture.attach(2));
      gl.uniform2f(u.uCells, f.width, f.height);
      gl.uniform1f(u.uSensorAngle, config.sensorAngle);
      gl.uniform1f(u.uSensorDist, config.sensorDist);
      gl.uniform1f(u.uTurn, config.turn);
      gl.uniform1f(u.uSpeed, config.speed);
      gl.uniform1f(u.uAttract, config.attract);
      gl.uniform1f(u.uWander, config.wander);
      gl.uniform1f(u.uSeed, (time * 61.7 + i * 13.1) % 1000);
      blit(a.write);
      a.swap();

      deposit.use();
      gl.uniform1i(deposit.uniforms.uAgents, a.read.attach(0));
      gl.uniform1i(deposit.uniforms.uSide, side);
      gl.uniform1f(deposit.uniforms.uDeposit, config.deposit);
      gl.bindFramebuffer(gl.FRAMEBUFFER, f.read.fbo);
      gl.viewport(0, 0, f.width, f.height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(points);
      gl.drawArrays(gl.POINTS, 0, side * side);
      gl.disable(gl.BLEND);

      diffuse.use();
      u = diffuse.uniforms;
      gl.uniform1i(u.uField, f.read.attach(1));
      gl.uniform2f(u.uTexel, 1 / f.width, 1 / f.height);
      gl.uniform1f(u.uDecay, config.decay);
      blit(f.write);
      f.swap();
    }

    const colors = (PALETTES[config.palette] ?? PALETTES.forest).map(hexToRgb);
    render.use();
    const r = render.uniforms;
    gl.uniform1i(r.uField, f.read.attach(1));
    gl.uniform1i(r.uTrail, trail!.texture.attach(2));
    gl.uniform2f(r.uTexel, 1 / f.width, 1 / f.height);
    gl.uniform2f(r.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(r.uTime, time);
    gl.uniform1f(r.uGain, config.gain);
    gl.uniform1f(r.uGlow, config.glow);
    gl.uniform3fv(r.uGround, colors[0]);
    gl.uniform3fv(r.uHaze, colors[1]);
    gl.uniform3fv(r.uHypha, colors[2]);
    gl.uniform3fv(r.uTip, colors[3]);
    blit(null);
  });

  return {
    config,
    reset,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
