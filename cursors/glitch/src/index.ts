// Glitch cursor — moving the mouse tears the picture into pixel blocks that
// slide along your path with an RGB split, then settle back. Underneath is a
// procedural retro still life (rainbow light leak, thin-film bubble, film
// grain) with a drifting headline whose hard edges make the tearing read.
//
// Adapted from the signup section of macroscope.com (built with Unicorn
// Studio's pixel-trail mouse effect).

import { Program, VERTEX, Trail, createFBO, makeBlit, createStage } from '@spectra/core';
import type { FBO } from '@spectra/core';
import { SCENE, COMPOSITE } from './shaders';

export const DEFAULTS = {
  text: 'spectra',
  font: '"Geist", "Inter", system-ui, sans-serif',
  /** Brush radius, fraction of height. */
  radius: 0.3,
  /** Seconds for the trail to fall to ~5%. */
  fade: 0.25,
  /** Displacement along the trail. */
  strength: 1.34,
  /** Pixel block size, fraction of height. */
  block: 0.025,
  /** RGB split along the trail. */
  split: 1,
  grain: 0.09,
  /** Static lens fringe toward the edges. */
  fringe: 1,
  /** Headline scroll speed, rows per second. */
  drift: 0.05,
  /** Headline row height, fraction of height. */
  line: 0.46,
  textOpacity: 1,
  /** Spectrum rotation, 0..1. */
  hue: 0,
  leak: 1,
};

export type GlitchConfig = typeof DEFAULTS;

export interface GlitchHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: GlitchConfig;
  destroy(): void;
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `glitch-fallback`
 * class instead, for a static CSS look.
 */
export function mount(container: HTMLElement, opts: Partial<GlitchConfig> = {}): GlitchHandle {
  const config: GlitchConfig = { ...DEFAULTS, ...opts };

  let trail: Trail | null = null;
  let scene: FBO | null = null;
  const stage = createStage(container, { floatTargets: true, onResize: () => allocate() });
  if (!stage) {
    container.classList.add('glitch-fallback');
    return { config, destroy() {} };
  }
  const { gl, pointer, reducedMotion } = stage;

  const programs = {
    scene: new Program(gl, VERTEX, SCENE),
    composite: new Program(gl, VERTEX, COMPOSITE),
  };
  const blit = makeBlit(gl);

  // The headline is one row drawn with Canvas 2D; the scene shader tiles it.
  const textCanvas = document.createElement('canvas');
  const textTex = gl.createTexture()!;
  let textKey = '';

  function drawText() {
    const w = gl.drawingBufferWidth;
    const h = Math.max(1, Math.round(gl.drawingBufferHeight * config.line));
    textKey = `${config.text}|${config.font}|${w}x${h}`;
    textCanvas.width = w;
    textCanvas.height = h;
    const ctx = textCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    // Fit the word to ~92% of the width, capped by the row height.
    let size = h * 1.05;
    ctx.font = `500 ${size}px ${config.font}`;
    ctx.letterSpacing = `${-0.06 * size}px`;
    const fit = (w * 0.92) / Math.max(ctx.measureText(config.text).width, 1);
    if (fit < 1) {
      size *= fit;
      ctx.font = `500 ${size}px ${config.font}`;
      ctx.letterSpacing = `${-0.06 * size}px`;
    }
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.text, w / 2, h * 0.5);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function allocate() {
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    scene?.dispose();
    // The trail is low-frequency and read through a block grid anyway.
    if (trail) trail.resize();
    else trail = new Trail(gl, blit, 0.5);
    scene = createFBO(gl, w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    textKey = '';
  }
  allocate();

  // Redraw the headline once the web font arrives (first draw may use a fallback).
  document.fonts?.load(`500 64px ${config.font}`).then(() => { textKey = ''; }, () => {});

  let time = 0;

  stage.start((dt) => {
    if (!trail || !scene) return;
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (!reducedMotion.matches) time += dt;
    const key = `${config.text}|${config.font}|${gl.drawingBufferWidth}x${Math.max(1, Math.round(gl.drawingBufferHeight * config.line))}`;
    if (key !== textKey) drawText();

    gl.disable(gl.BLEND);

    trail.update(pointer, dt, time, config);

    const s = programs.scene;
    s.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(s.uniforms.uText, 0);
    gl.uniform1f(s.uniforms.uTime, time);
    gl.uniform1f(s.uniforms.uAspect, aspect);
    gl.uniform1f(s.uniforms.uLine, config.line);
    gl.uniform1f(s.uniforms.uDrift, config.drift);
    gl.uniform1f(s.uniforms.uTextAmt, config.textOpacity);
    gl.uniform1f(s.uniforms.uHue, config.hue);
    gl.uniform1f(s.uniforms.uLeak, config.leak);
    blit(scene);

    const c = programs.composite;
    c.use();
    gl.uniform1i(c.uniforms.uScene, scene.attach(0));
    gl.uniform1i(c.uniforms.uTrail, trail.texture.attach(1));
    gl.uniform2f(c.uniforms.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(c.uniforms.uBlock, config.block);
    gl.uniform1f(c.uniforms.uStrength, config.strength);
    gl.uniform1f(c.uniforms.uSplit, config.split);
    gl.uniform1f(c.uniforms.uGrain, config.grain);
    gl.uniform1f(c.uniforms.uFringe, config.fringe);
    gl.uniform1f(c.uniforms.uTime, time);
    blit(null);
  });

  return {
    config,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
