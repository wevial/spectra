// Water on a phone screen, as a renderer: draws the panel (any image, canvas
// or video, or a lock-screen poster) under a set of drops, with the optics,
// moiré and glints described in ./shaders. The droplet cursor and the rain
// filter each run their own drops and hand them to draw() every frame.

import { Program, VERTEX, makeBlit, SourceTexture } from '@spectra/core';
import type { Source, Stage } from '@spectra/core';
import { DROPLET, MAX_DROPS, MAX_DRIPS, BIN, BIN_END } from './shaders';
import { drawPoster } from './poster';

export const LAYOUTS = { lcd: 0, oled: 1 } as const;
/** Most drops a frame can show. */
export { MAX_DROPS, MAX_DRIPS } from './shaders';
export type Layout = keyof typeof LAYOUTS;

/** Look of the screen and the water; shared by the cursor and the filter. */
export interface WaterLook {
  /** Subpixel layout: RGB stripes or a diamond pentile. */
  layout: Layout;
  /** Panel pixel pitch, CSS px. */
  pixel: number;
  /** Reference drop radius, fraction of height: a drop this size magnifies `magnify`×. */
  size: number;
  magnify: number;
  /** Contact angle, degrees. Flatter drops distort less toward the rim. */
  angle: number;
  /** Color split, × water's real dispersion. */
  dispersion: number;
  /** Camera sensor pitch, CSS px: the subpixel grid beats against it into moiré bands. */
  sensor: number;
  /** Gaps between pixels outside the drops, 0..1. */
  grid: number;
  /** Blur toward a drop's rim (shallow depth of field), panel px. */
  focus: number;
  /** Reflection of the room and the lamp. */
  gloss: number;
  /** 0..1: magnified subpixels glow into each other instead of sitting on black. */
  soften: number;
  /** Strength of the star glint on big drops. */
  sparkle: number;
  font: string;
}

/** A resting drop. Position in uv, radius as a fraction of height. */
export interface Bead {
  x: number;
  y: number;
  r: number;
  /** Dome height relative to a full drop, 0.1..1. */
  flat: number;
  /** 0..1, shapes its lumpy outline. */
  seed: number;
  /** While sliding down: how far it's drawn out into a teardrop, 0..1.5. */
  stretch?: number;
}

/** A drip streak: from its bottom end (at a sliding drop) up to its top. Uv, half-widths as fractions of height. */
export interface Drip {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w0: number;
  w1: number;
  seed: number;
}

/** The cursor's drop: it stretches along its heading and keeps its magnification as it grows. */
export interface Lead {
  x: number;
  y: number;
  r: number;
  dirX: number;
  dirY: number;
  stretch: number;
}

export interface Frame {
  beads: Bead[];
  drips?: Drip[];
  lead?: Lead;
  /** The lamp: position in uv, and height above the glass (fraction of height). */
  lamp: [number, number, number];
  time: number;
  /** Condensation over the glass. */
  mist?: {
    /** Coverage, stretched over the screen: white fogged, black wiped clear. */
    mask: TexImageSource;
    /** Spacing of its droplets, CSS px. */
    cell: number;
    /** 0..1. */
    amount: number;
  };
}

export interface Water {
  /** Swap what the screen shows. A string is loaded as an image URL; null restores the poster. */
  setSource(source: Source | null): Promise<void>;
  draw(frame: Frame): void;
}

const WATER = 1.333;
const TILE_ROWS = 12;

export function createWater(stage: Stage, look: WaterLook, initial?: Source): Water {
  const { gl, canvas } = stage;
  const blit = makeBlit(gl);
  const program = new Program(gl, VERTEX, DROPLET);

  const content = new SourceTexture(gl);
  const posterCanvas = document.createElement('canvas');
  let posterKey = '';
  async function setSource(next: Source | null) {
    await content.set(next);
    if (next == null) posterKey = '';
  }
  if (initial) void setSource(initial);
  document.fonts?.load(`500 64px ${look.font}`).then(() => { posterKey = ''; }, () => {});

  const uniforms = new Float32Array(MAX_DROPS * 4);
  const dripEnds = new Float32Array(MAX_DRIPS * 4);
  const dripWidths = new Float32Array(MAX_DRIPS * 4);
  // Drops binned into screen tiles, so each pixel only checks those nearby.
  const binTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, binTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  let bins = new Uint8Array(0);
  const mistTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, mistTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));

  function draw({ beads, drips = [], lead, lamp, time, mist }: Frame) {
    const a = canvas.clientWidth / Math.max(canvas.clientHeight, 1);

    // Content: the poster redraws when the panel size or the minute changes.
    const pitch = Math.max(look.pixel, 0.5);
    const pw = Math.max(1, Math.round(canvas.clientWidth / pitch));
    const ph = Math.max(1, Math.round(canvas.clientHeight / pitch));
    if (content.source === null) {
      const now = new Date();
      const key = `${pw}x${ph} ${now.getHours()}:${now.getMinutes()} ${look.font}`;
      if (key !== posterKey) {
        drawPoster(posterCanvas, pw, ph, look.font, now);
        content.upload(posterCanvas, pw, ph);
        posterKey = key;
      }
    } else {
      content.tick();
    }

    // Optics. Every drop sits on the same cover glass; its thickness is set
    // so a drop of reference size magnifies `magnify`× at its apex, whose
    // radius of curvature is a / (2 z0) for a dome of height a z0.
    const phi = (Math.min(Math.max(look.angle, 5), 85) * Math.PI) / 180;
    const z0 = Math.tan(phi / 2);
    const depth = (r: number) => (r / (2 * z0)) * (1 - 1 / Math.max(look.magnify, 1.01)) / (1 - 1 / WATER);
    const glass = Math.max(depth(look.size) - look.size * z0, 0);

    if (lead) uniforms.set([lead.x * a, lead.y, lead.r, 10], 0);
    // Largest first, so a crowded tile loses only the smallest drops.
    const sized = beads.filter((b) => b.r > 0).sort((x, y) => y.r - x.r).slice(0, MAX_DROPS - 1);
    sized.forEach((b, i) => {
      const slide = Math.min(Math.round((b.stretch ?? 0) * 40), 63);
      uniforms.set([b.x * a, b.y, b.r, Math.round(b.flat * 10) + 16 * slide + Math.min(b.seed, 0.999)], (i + 1) * 4);
    });

    const cols = Math.max(1, Math.round(TILE_ROWS * a)), rows = TILE_ROWS;
    if (bins.length !== cols * rows * BIN) bins = new Uint8Array(cols * rows * BIN);
    bins.fill(BIN_END);
    const fill = new Uint8Array(cols * rows);
    const bin = (id: number, x: number, y: number, reach: number) => {
      const x0 = Math.max(Math.floor((x - reach / a) * cols), 0), x1 = Math.min(Math.floor((x + reach / a) * cols), cols - 1);
      const y0 = Math.max(Math.floor((y - reach) * rows), 0), y1 = Math.min(Math.floor((y + reach) * rows), rows - 1);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const tile = ty * cols + tx;
          if (fill[tile] < BIN) bins[tile * BIN + fill[tile]++] = id;
        }
      }
    };
    if (lead) bin(0, lead.x, lead.y, lead.r * (2 + 2 * Math.abs(lead.stretch)));
    sized.forEach((b, i) => bin(i + 1, b.x, b.y, b.r * (b.stretch ? 2 + 2 * b.stretch : 1.5))); // glints spill past the rim
    drips.slice(0, MAX_DRIPS).forEach((d, i) => {
      dripEnds.set([d.x0 * a, d.y0, d.x1 * a, d.y1], i * 4);
      dripWidths.set([d.w0, d.w1, d.seed * 97, 0], i * 4);
      const w = Math.max(d.w0, d.w1) * 1.2;
      bin(MAX_DROPS + i, (d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, Math.hypot((d.x1 - d.x0) * a, d.y1 - d.y0) / 2 + w);
    });
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, binTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, cols * BIN, rows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, bins);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    if (mist) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, mistTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, mist.mask);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    const fit = content.cover(pw, ph);
    const px = canvas.clientHeight / pitch;
    const lod = Math.log2(Math.max((content.height * fit[1]) / px, 1));
    const spread = 0.0015 * look.dispersion;

    program.use();
    const u = program.uniforms;
    gl.uniform1i(u.uContent, content.attach(0));
    gl.uniform4f(u.uFit, fit[0], fit[1], fit[2], fit[3]);
    gl.uniform1f(u.uLod, lod);
    gl.uniform2f(u.uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u.uAspect, a);
    gl.uniform1f(u.uPx, px);
    gl.uniform4fv(u['uDrops[0]'], uniforms);
    gl.uniform1i(u.uBins, 1);
    gl.uniform1f(u.uGlass, glass);
    gl.uniform4fv(u['uDrips[0]'], dripEnds);
    gl.uniform4fv(u['uDripW[0]'], dripWidths);
    gl.uniform2f(u.uTiles, cols, rows);
    gl.uniform2f(u.uDir, lead?.dirX ?? 1, lead?.dirY ?? 0);
    gl.uniform1f(u.uStretch, lead?.stretch ?? 0);
    gl.uniform2f(u.uContact, Math.sin(phi), Math.cos(phi));
    gl.uniform3f(u.uIor, WATER - spread, WATER, WATER + spread * 1.4);
    gl.uniform1i(u.uLayout, LAYOUTS[look.layout] ?? 0);
    gl.uniform1f(u.uSensor, look.sensor * (gl.drawingBufferWidth / Math.max(canvas.clientWidth, 1)));
    gl.uniform1f(u.uGrid, look.grid);
    gl.uniform1f(u.uFocus, look.focus);
    gl.uniform1f(u.uGloss, look.gloss);
    gl.uniform1f(u.uSoften, look.soften);
    gl.uniform1f(u.uSparkle, look.sparkle);
    gl.uniform3f(u.uLamp, lamp[0] * a, lamp[1], lamp[2]);
    gl.uniform1f(u.uSize, look.size);
    gl.uniform1f(u.uTime, time);
    gl.uniform1i(u.uMist, 2);
    gl.uniform1f(u.uMistCell, (mist?.cell ?? 6) / Math.max(canvas.clientHeight, 1));
    gl.uniform1f(u.uMistAmount, mist?.amount ?? 0);
    blit(null);
  }

  return { setSource, draw };
}
