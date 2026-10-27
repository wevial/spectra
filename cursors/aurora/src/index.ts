// Aurora cursor — paint the northern lights. The cursor's trail becomes the
// lower edge of a curtain: rays rise from your path, green at the base and
// pink higher up, shimmer, sway and slowly fade. Faint ambient curtains drift
// behind, over a dark lake and a spruce treeline.

import { Program, VERTEX, Trail, makeBlit, createStage, createFBO } from '@spectra/core';
import type { FBO, Pointer } from '@spectra/core';
import { AURORA, COMPOSITE } from './shaders';

/** Three colors: lower curtain, upper curtain, lower-edge fringe. */
export const PALETTES = {
  boreal: ['#35ff8f', '#ff3d7a', '#b06bff'],
  violet: ['#7d6bff', '#ff5ce1', '#5cc8ff'],
  ice: ['#58e6ff', '#9b7bff', '#e8fbff'],
} satisfies Record<string, [string, string, string]>;

export type PaletteName = keyof typeof PALETTES;

export const DEFAULTS = {
  palette: 'boreal' as PaletteName,
  /** Brightness of the curtain the cursor paints. */
  intensity: 1,
  /** How high painted rays rise, fraction of the screen. */
  rise: 0.35,
  /** Brightness of the background curtains; 0 hides them. */
  ambient: 0.25,
  /** Background curtain height, relative to their altitude. */
  height: 3,
  /** Drift and shimmer speed. */
  speed: 1,
  stars: 1,
  /** Show the mountains and treeline. */
  landscape: true,
  /** Horizon height, fraction of the screen from the bottom. */
  horizon: 0.3,
  /** Thickness of the painted curtain's lower edge, fraction of height. */
  radius: 0.03,
  /** Seconds for a painted curtain to fade to ~5%. */
  fade: 4,
};

export type AuroraConfig = typeof DEFAULTS;

export interface AuroraHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: AuroraConfig;
  destroy(): void;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `aurora-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<AuroraConfig> = {}): AuroraHandle {
  const config: AuroraConfig = { ...DEFAULTS, ...opts };

  let trail: Trail | null = null;
  let resizeAurora = () => {};
  const stage = createStage(container, {
    floatTargets: true,
    onResize: () => { trail?.resize(); resizeAurora(); },
  });
  if (!stage) {
    container.classList.add('aurora-fallback');
    return { config, destroy() {} };
  }
  const { gl, canvas, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const aurora = new Program(gl, VERTEX, AURORA);
  const composite = new Program(gl, VERTEX, COMPOSITE);
  trail = new Trail(gl, blit, 0.5);

  // The aurora is soft, so it renders at half CSS resolution regardless of DPR.
  let light: FBO | null = null;
  resizeAurora = () => {
    light?.dispose();
    const w = Math.max(1, Math.round(canvas.clientWidth / 2));
    const h = Math.max(1, Math.round(canvas.clientHeight / 2));
    light = createFBO(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  };
  resizeAurora();

  // With no cursor (touch, or a preview card) a ghost wanders the sky and
  // paints, so the curtain never goes dark.
  const ghost: Pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, active: false };
  let idle = 0;
  let time = 0;

  stage.start((dt) => {
    if (!reducedMotion.matches) time += dt * config.speed;
    idle = pointer.active ? 0 : idle + dt;
    if (idle > 1 && !reducedMotion.matches) {
      const t = time * 0.5;
      const x = 0.5 + 0.42 * Math.sin(t * 0.61) * Math.cos(t * 0.23);
      const y = config.horizon + (1 - config.horizon) * (0.32 + 0.14 * Math.sin(t * 0.47 + 1.3));
      ghost.dx = ghost.active ? x - ghost.x : 0;
      ghost.dy = ghost.active ? y - ghost.y : 0;
      ghost.x = x;
      ghost.y = y;
      ghost.active = true;
    } else {
      ghost.active = false;
    }
    trail!.update(ghost.active ? ghost : pointer, dt, time, config);

    const colors = (PALETTES[config.palette] ?? PALETTES.boreal).map(hexToRgb);
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;

    aurora.use();
    let u = aurora.uniforms;
    gl.uniform1i(u.uTrail, trail!.texture.attach(0));
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uHorizon, config.horizon);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uHeight, config.height);
    gl.uniform1f(u.uIntensity, config.intensity);
    gl.uniform1f(u.uRise, config.rise);
    gl.uniform1f(u.uAmbient, config.ambient);
    gl.uniform3fv(u.uLow, colors[0]);
    gl.uniform3fv(u.uHigh, colors[1]);
    gl.uniform3fv(u.uFringe, colors[2]);
    blit(light);

    composite.use();
    u = composite.uniforms;
    gl.uniform1i(u.uAurora, light!.attach(1));
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1f(u.uHorizon, config.horizon);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uStars, config.stars);
    gl.uniform1f(u.uLandscape, config.landscape ? 1 : 0);
    blit(null);
  });

  return {
    config,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
