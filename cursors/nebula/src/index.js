// Nebula cursor — a WebGL2 nebula you can part with the mouse.
// The pointer bends a displacement field (a local radial shove plus a soft
// drag wake through a fluid sim); the cloud always heals back to its untouched
// procedural shape, so colors never mix and it can't be stirred to mud.

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
 * @param {{ tier?: number, debug?: boolean }} [opts]
 */
export function mount(container, opts = {}) {
  const fallback = () => container.classList.add('nebula-fallback');

  const stage = createStage(container, {
    floatTargets: true,
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
  const composite = new Program(gl, VERTEX, COMPOSITE);
  const blit = makeBlit(gl);

  let time = 0;

  stage.start((dt, rawDt) => {
    if (!governor.frame(rawDt)) return; // bailed to static fallback

    const frozen = reducedMotion.matches;
    if (!frozen) {
      time += dt;
      // Cursor push, "blend" style: a local radial shove (three jittered
      // sub-splats written straight into the displacement field — the parting)
      // plus a soft directional drag through the fluid sim (the wake).
      const speed = Math.hypot(pointer.dx, pointer.dy);
      if (pointer.active && speed > 0) {
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
    /** Live tuning: velocityDissipation, offsetDecay, splatForce. */
    config: fluid.config,
    destroy: () => stage.destroy(),
  };
}
