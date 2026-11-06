// Nebula cursor — a WebGL2 nebula you can part with the mouse.
// The pointer bends a displacement field (a local radial shove plus a soft
// drag wake through a fluid sim); the cloud always heals back to its untouched
// procedural shape, so colors never mix and it can't be stirred to mud.
// With `cursor: false` it's a background: the pointer is ignored, and a few
// invisible wanderers push slow currents through the same sim instead.

import { Program, makeBlit, createStage } from '@spectra/core';
import { VERTEX, COMPOSITE } from './shaders.js';
import { FluidSim, CONFIG } from './fluid.js';
import { Governor, TIERS } from './perf.js';

export { CONFIG };

/**
 * Mount the nebula into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `nebula-fallback`
 * class instead, for a static CSS gradient.
 * @param {HTMLElement} container
 * @param {{ tier?: number, debug?: boolean, cursor?: boolean, currents?: number, speed?: number }} [opts]
 */
export function mount(container, opts = {}) {
  const cursor = opts.cursor ?? true;
  const fallback = () => container.classList.add('nebula-fallback');

  const stage = createStage(container, {
    floatTargets: true,
    // Nebula's own governor trades detail as well as resolution (perf.js).
    adaptive: false,
    onResize: () => fluid?.resize(),
  });
  if (!stage) {
    fallback();
    return { config: { ...CONFIG }, destroy() {} };
  }
  const { gl, pointer, reducedMotion } = stage;

  // The governor picks the initial tier before any GPU allocation, so weak
  // devices never build full-size buffers just to throw them away.
  let fluid = null;
  const governor = new Governor({
    tier: opts.tier,
    debug: opts.debug,
    onApply(tier) {
      stage.dprCap = tier.dpr;
      fluid.config.simResolution = tier.sim;
      fluid.config.cloudResolution = tier.cloud;
      fluid.config.pressureIterations = tier.iters;
      stage.resize();
      fluid.resize();
    },
    onFallback() {
      stage.destroy();
      fallback();
    },
  });
  if (governor.tier >= TIERS.length) return { config: { ...CONFIG }, destroy() {} };

  stage.dprCap = TIERS[governor.tier].dpr;
  stage.resize();
  fluid = new FluidSim(gl, TIERS[governor.tier]);
  fluid.config.currents = opts.currents ?? (cursor ? 0 : 1);
  if (opts.speed != null) fluid.config.speed = opts.speed;
  const composite = new Program(gl, VERTEX, COMPOSITE);
  const blit = makeBlit(gl);

  let time = 0;
  const WANDERERS = 3;
  /** @type {({ x: number, y: number } | undefined)[]} */
  const wanderers = [];

  stage.start((dt, rawDt) => {
    if (!governor.frame(rawDt)) return; // bailed to static fallback

    const frozen = reducedMotion.matches;
    if (!frozen) {
      time += dt;
      // Cursor push, "blend" style: a local radial shove (three jittered
      // sub-splats written straight into the displacement field — the parting)
      // plus a soft directional drag through the fluid sim (the wake).
      const speed = Math.hypot(pointer.dx, pointer.dy);
      if (cursor && pointer.active && speed > 0) {
        const part = Math.min(speed * 2.8, 0.09);
        for (let i = 0; i < 3; i++) {
          const jx = (Math.random() - 0.5) * 0.016;
          const jy = (Math.random() - 0.5) * 0.016;
          const rad = 0.0028 * (0.5 + Math.random());
          fluid.splat('offset', pointer.x + jx, pointer.y + jy, part * 0.35, 0, rad, 1);
        }
        const f = fluid.config.splatForce * 0.5;
        fluid.splat('velocity', pointer.x, pointer.y, pointer.dx * f, pointer.dy * f, 0.0015, 0);
      }
      // Currents: wanderers on slow Lissajous paths drag the gas along
      // behind them, wide and soft, so it swirls and heals on its own.
      const currents = fluid.config.currents;
      if (currents > 0) {
        const t = time * fluid.config.speed;
        for (let i = 0; i < WANDERERS; i++) {
          const a = t * 0.11 + i * 2.1, b = t * 0.07 + i * 1.3;
          const x = 0.5 + 0.42 * Math.sin(a) * Math.cos(b * 0.6);
          const y = 0.5 + 0.38 * Math.sin(b + i);
          const w = wanderers[i];
          if (w) {
            const f = fluid.config.splatForce * 3 * currents;
            fluid.splat('velocity', x, y, (x - w.x) * f, (y - w.y) * f, 0.006, 0);
          }
          wanderers[i] = { x, y };
        }
      }
      fluid.step(dt);
    } else if (fluid.cloudDirty) {
      // Reduced motion: no sim, no drift — but the cloud still has to exist.
      fluid.renderCloud();
    }

    composite.use();
    gl.uniform1i(composite.uniforms.uDye, fluid.cloud.attach(0));
    gl.uniform1f(composite.uniforms.uTime, time);
    gl.uniform1f(composite.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
    blit(null);
  });

  return {
    /** Live tuning: velocityDissipation, offsetDecay, splatForce, speed, currents. */
    config: fluid.config,
    destroy: () => stage.destroy(),
  };
}
