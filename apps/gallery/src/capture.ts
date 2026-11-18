// Recording side of scripts/capture.ts: mounts one effect on manually driven
// stages and steps it at a fixed dt, reading the drawing buffer back after
// each captured frame. Cursor effects follow a closed path whose period is
// the loop length, so the pointer is in the same place at both ends.

import { driveStagesManually, seedRandom } from '@spectra/core';
import type { Stage } from '@spectra/core';
import { LOADERS, isCursor } from './effects';
import type { Effect } from './effects';

export interface CaptureSetup {
  effect: Effect;
  width: number;   // CSS px
  height: number;
  dpr: number;
  seed: number;
  /** Seconds the cursor path takes to close; the loop length. */
  period: number;
}

let stage: Stage;
let setup: CaptureSetup;
let time = 0;

/** A figure eight through the middle, closed after `period` seconds. */
function path(t: number) {
  const a = (t / setup.period) * Math.PI * 2;
  return { x: 0.5 + 0.24 * Math.sin(a), y: 0.5 + 0.16 * Math.sin(2 * a) };
}

function step(dt: number) {
  if (isCursor(setup.effect)) {
    const p = stage.pointer;
    const { x, y } = path(time);
    if (p.active) {
      p.dx += x - p.x;
      p.dy += y - p.y;
    }
    p.x = x;
    p.y = y;
    p.active = true;
  }
  stage.step(dt);
  time += dt;
}

function read(): string {
  const { gl } = stage;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const px = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
  gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let s = '';
  for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode(...px.subarray(i, i + 0x8000));
  return btoa(s);
}

const api = {
  async mount(s: CaptureSetup) {
    setup = s;
    seedRandom(s.seed);
    const stages = driveStagesManually({ dpr: s.dpr });
    await document.fonts.load('500 64px Geist');
    await document.fonts.ready;
    const box = document.getElementById('box')!;
    box.style.width = `${s.width}px`;
    box.style.height = `${s.height}px`;
    const { mount } = await LOADERS[s.effect]();
    mount(box);
    if (!stages.length) throw new Error(`${s.effect}: no stage (WebGL2 or float targets unavailable)`);
    stage = stages[stages.length - 1];
    return { width: stage.gl.drawingBufferWidth, height: stage.gl.drawingBufferHeight };
  },
  /** Advance `steps` frames of `dt` without reading. */
  warm(steps: number, dt: number) {
    for (let i = 0; i < steps; i++) step(dt);
  },
  /** Capture `frames` frames, `every` steps of `dt` apart; each is base64 RGBA, bottom row first. */
  frames(frames: number, every: number, dt: number) {
    const out: string[] = [];
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < every; i++) step(dt);
      out.push(read());
    }
    return out;
  },
  /** Encode bottom-up RGBA as a WebP poster. */
  async poster(rgba: string, width: number, height: number, quality: number) {
    const bin = atob(rgba);
    const img = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width * 4; x++) img.data[y * width * 4 + x] = bin.charCodeAt((height - 1 - y) * width * 4 + x);
    }
    const c = new OffscreenCanvas(width, height);
    c.getContext('2d')!.putImageData(img, 0, 0);
    const blob = await c.convertToBlob({ type: 'image/webp', quality });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  },
};

declare global {
  interface Window { capture: typeof api }
}
window.capture = api;
