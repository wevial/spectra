// Black hole cursor — the cursor drags a black hole across a starfield. Light
// bends around it: a black shadow, a thin photon ring, and an accretion disk
// whose far side is lensed into an arc over and under the hole. Moving fast
// leaves a wake that drags the stars along your path.

import { Program, VERTEX, Trail, makeBlit, createStage } from '@spectra/core';
import { BLACKHOLE } from './shaders';

export const DEFAULTS = {
  /** Shadow radius, fraction of height. */
  size: 0.07,
  /** Disk inclination from edge-on, radians. */
  tilt: 0.16,
  /** Disk brightness. */
  disk: 1,
  /** Disk rotation speed. */
  spin: 1,
  /** Seconds for the hole to catch up with the cursor. */
  lag: 0.35,
  /** How far the cursor trail drags the sky. */
  wake: 1,
  stars: 1,
  nebula: 1,
  exposure: 1.4,
  /** Trail brush radius, fraction of height. */
  radius: 0.2,
  /** Seconds for the wake to fall to ~5%. */
  fade: 1.5,
};

export type BlackHoleConfig = typeof DEFAULTS;

export interface BlackHoleHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: BlackHoleConfig;
  destroy(): void;
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `blackhole-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<BlackHoleConfig> = {}): BlackHoleHandle {
  const config: BlackHoleConfig = { ...DEFAULTS, ...opts };

  let trail: Trail | null = null;
  // The near-hole ray march is the costliest pass in spectra; cap resolution.
  const stage = createStage(container, { floatTargets: true, dprCap: 1.5, onResize: () => trail?.resize() });
  if (!stage) {
    container.classList.add('blackhole-fallback');
    return { config, destroy() {} };
  }
  const { gl, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const program = new Program(gl, VERTEX, BLACKHOLE);
  trail = new Trail(gl, blit, 0.5);

  // The hole eases toward the cursor; with no cursor it drifts near center.
  const hole = { x: 0.5, y: 0.5 };
  let time = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt;
    trail!.update(pointer, dt, time, config);

    const target = pointer.active
      ? { x: pointer.x, y: pointer.y }
      : { x: 0.5 + Math.sin(time * 0.13) * 0.06, y: 0.5 + Math.sin(time * 0.17) * 0.04 };
    const k = 1 - Math.exp(-dt / Math.max(config.lag / 3, 0.001));
    hole.x += (target.x - hole.x) * k;
    hole.y += (target.y - hole.y) * k;

    program.use();
    const u = program.uniforms;
    gl.uniform1i(u.uTrail, trail!.texture.attach(0));
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.uTime, time);
    gl.uniform2f(u.uHole, hole.x, hole.y);
    gl.uniform1f(u.uSize, config.size);
    gl.uniform1f(u.uTilt, config.tilt);
    gl.uniform1f(u.uDisk, config.disk);
    gl.uniform1f(u.uSpin, config.spin);
    gl.uniform1f(u.uWake, config.wake);
    gl.uniform1f(u.uStars, config.stars);
    gl.uniform1f(u.uNebula, config.nebula);
    gl.uniform1f(u.uExposure, config.exposure);
    blit(null);
  });

  return {
    config,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
