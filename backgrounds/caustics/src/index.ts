// Caustics background — sunlight through moving water onto a pool floor.
// The surface is a sum of travelling waves; a dense mesh of it is refracted
// onto the floor once per wavelength, so light gathers into a web of
// interlocking ribbons with faint rainbow fringes where water's dispersion
// splits them.
// Ignores the pointer.

import { Program, VERTEX, makeBlit, createStage, createFBO, setGrain } from '@spectra/core';
import type { FBO } from '@spectra/core';
import { wavelengthToRgb } from '@spectra/film';
import { LIGHT_VS, LIGHT_FS, BLUR, DOWNSAMPLE, COMPOSITE, WAVES, MAX_TAPS } from './shaders';

/**
 * Two colors: the floor in shade, and the sunlight. `rainbow` and `prism`
 * instead draw the light as colored layers on black (see LAYERS).
 */
export const PALETTES = {
  pool: ['#0a4a66', '#e8fbff'],
  lagoon: ['#0b4848', '#fff2c6'],
  shallows: ['#4a3c26', '#fff4d8'],
  abyss: ['#010516', '#62aaff'],
  noir: ['#050507', '#ffffff'],
  rainbow: ['#000000', '#ffffff'],
  prism: ['#000000', '#ffffff'],
} satisfies Record<string, [string, string]>;

export type PaletteName = keyof typeof PALETTES;

export const DEFAULTS = {
  palette: 'prism' as PaletteName,
  /** Brightness of the caustic light. */
  intensity: 0.16,
  /** Contrast of the web: higher thins the lines and darkens the cells. */
  sharpness: 1.8,
  /** Wave speed. */
  speed: 0.17,
  /** Size of the ripple cells. */
  scale: 1.4,
  /** Water depth over the floor: shallow is soft and blurry, deeper sharpens the web and folds it into crossing, doubled lines. */
  depth: 0.72,
  /** Wave steepness. */
  choppiness: 1,
  /** Rainbow fringes on the lines; 1 is real water, more exaggerates it. */
  dispersion: 6.5,
  /** Film grain. */
  grain: 0.02,
  /** Seconds for the grain to morph into a new pattern; 0 freezes it. */
  grainPeriod: 0.8,
  /** Picks the wave directions and phases. */
  seed: 0,
};

export type CausticsConfig = typeof DEFAULTS;

export interface CausticsHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: CausticsConfig;
  destroy(): void;
}

const REVEAL_MS = 900;
const TAU = Math.PI * 2;
/** Wavelengths drawn, nm: each a separate refraction of the mesh. */
const SPECTRUM = [420, 465, 510, 555, 600, 645, 690];
/** Mesh cell size in CSS px. */
const CELL_PX = 3;
/** Multisampling for the light pass: the web's lines are a few pixels wide, so their triangles need antialiasing. */
const MSAA = 4;
/**
 * Light for the palettes that draw colored layers instead of seven
 * wavelengths: each layer is the same web phase-shifted a little further, so
 * the layers run alongside each other, split apart, and add back up to white
 * where they meet. Linear RGB, balanced so each set sums to white.
 * - `rainbow`: five saturated ribbons, distinct bands of color.
 * - `prism`: a continuous spectrum, so the split is one smooth gradient.
 */
const LAYERS: Partial<Record<PaletteName, [number, number, number][]>> = {
  rainbow: balance([
    [1, 0.06, 0.1],    // red
    [1, 0.45, 0.02],   // orange
    [0.15, 1, 0.45],   // green
    [0.08, 0.35, 1],   // blue
    [0.65, 0.15, 1],   // violet
  ]),
  prism: balance(Array.from({ length: 12 }, (_, i) => wavelengthToRgb(690 - (270 * i) / 11))),
};
/**
 * Phase spread from the first layer to the last per unit of `dispersion`,
 * radians. At the default 7 the layers split at the edges of the lines and
 * merge to white at their cores.
 */
const LAYER_SPREAD = 0.086;
/**
 * The layered palettes read as glowing light on black rather than a lit
 * floor, so they add this much `sharpness` and scale `intensity`: the cores
 * burn white and the cells go dark without retuning the sliders.
 */
const LAYER_SHARPNESS = 1.4;
const LAYER_INTENSITY = 0.8;

/** Blur on the light, CSS px sigma: the sun's disk, which softens fold edges. */
const SUN_BLUR = 0.75;
/** Glow blur, sigma in quarter-resolution texels (~10 CSS px). */
const GLOW_BLUR = 2.5;
/** Wave gravity in units/s², tuned so a mid wave travels at a calm drift. */
const GRAVITY = 0.09;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function hash(n: number) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Scales colors so each channel sums to 1 across them: together they make white. */
function balance(rgb: number[][]) {
  const sum = [0, 1, 2].map((c) => rgb.reduce((s, v) => s + v[c], 0));
  return rgb.map((v) => v.map((x, c) => x / sum[c]) as [number, number, number]);
}

/** Each wavelength's share of white, so flat water lights the floor white. */
function spectrumWeights() {
  return balance(SPECTRUM.map(wavelengthToRgb));
}

/** Water's index of refraction (a Cauchy fit), dispersion scaled about 589 nm. */
function ior(nm: number, dispersion: number) {
  return 1.333 + dispersion * 3059 * (1 / (nm * nm) - 1 / (589 * 589));
}

interface Wave { kx: number; ky: number; amp: number; omega: number; phase: number }

/**
 * Travelling waves spread over every direction by the golden angle, with
 * wavelengths from 0.32 down to 0.11 units. Curvature, which is what focuses
 * light, is steepness × wavenumber, so at equal steepness the shortest waves
 * would draw everything as a two-axis grid; a narrow band instead makes a
 * lattice of equal cells. Steepness rises with wavelength (as its square
 * root) so curvature only tilts ~1.7× across the band: every wave shapes
 * cells, and they come out irregular, 3–4× apart in size. Speed follows
 * deep-water dispersion, so the web keeps re-forming instead of sliding.
 */
function makeWaves(seed: number, scale: number, choppiness: number): Wave[] {
  const out: Wave[] = [];
  for (let i = 0; i < WAVES; i++) {
    const length = 0.32 * Math.pow(0.875, i) * (0.94 + 0.12 * hash(seed * 31 + i));
    const k = TAU / (length * scale);
    const dir = i * 2.39996 + hash(seed * 17 + i + 0.5) * 0.8 + seed * 0.37;
    out.push({
      kx: Math.cos(dir) * k,
      ky: Math.sin(dir) * k,
      amp: (0.055 * Math.sqrt(length / 0.11) * choppiness) / k,
      omega: Math.sqrt(GRAVITY * k),
      phase: hash(seed * 7 + i + 0.25) * TAU,
    });
  }
  return out;
}

/**
 * Linear-sampling taps for a Gaussian of `sigma` texels: the center, then
 * pairs of texels read with one bilinear fetch between them. Weights cover
 * both sides and sum to 1.
 */
export function gaussianTaps(sigma: number) {
  const radius = Math.min(Math.max(1, Math.ceil(sigma * 3)), (MAX_TAPS - 1) * 2);
  const w = Array.from({ length: radius + 1 }, (_, k) => Math.exp((-k * k) / (2 * sigma * sigma)));
  const total = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0);
  const offsets = [0];
  const weights = [w[0] / total];
  for (let k = 1; k <= radius; k += 2) {
    const a = w[k], b = k + 1 <= radius ? w[k + 1] : 0;
    offsets.push((k * a + (k + 1) * b) / (a + b));
    weights.push((a + b) / total);
  }
  return { count: offsets.length, offsets: new Float32Array(offsets.concat(Array(MAX_TAPS - offsets.length).fill(0))), weights: new Float32Array(weights.concat(Array(MAX_TAPS - weights.length).fill(0))) };
}

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 + float targets the container gets the `caustics-fallback`
 * class instead.
 */
export function mount(container: HTMLElement, opts: Partial<CausticsConfig> = {}): CausticsHandle {
  const config: CausticsConfig = { ...DEFAULTS, ...opts };

  let resizeLight = () => {};
  let drawn = '';
  const stage = createStage(container, {
    floatTargets: true,
    onResize: () => { resizeLight(); drawn = ''; },
  });
  if (!stage) {
    container.classList.add('caustics-fallback');
    return { config, destroy() {} };
  }
  const { gl, canvas, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const lightProgram = new Program(gl, LIGHT_VS, LIGHT_FS);
  const blur = new Program(gl, VERTEX, BLUR);
  const downsample = new Program(gl, VERTEX, DOWNSAMPLE);
  const composite = new Program(gl, VERTEX, COMPOSITE);
  const glowTaps = gaussianTaps(GLOW_BLUR);
  let sunTaps = gaussianTaps(SUN_BLUR);
  const weights = spectrumWeights();

  const mesh = gl.createVertexArray();
  const meshBuf = gl.createBuffer();
  const meshIdx = gl.createBuffer();
  let indexCount = 0;
  let meshKey = '';
  // light ⇄ scratch for the sun blur; glow ⇄ glowScratch at quarter resolution.
  let light: FBO | null = null;
  let scratch: FBO | null = null;
  let glow: FBO | null = null;
  let glowScratch: FBO | null = null;
  // The light is drawn multisampled, then resolved into `light` to be sampled.
  const msaaFbo = gl.createFramebuffer();
  const msaaRb = gl.createRenderbuffer();
  const supported = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array);
  const samples = supported.find((n) => n <= MSAA) ?? 0;

  // A grid over the box plus `margin` units per side, so refraction never
  // pulls a gap in from the edge. Cells stay about CELL_PX CSS pixels.
  function buildMesh(box: readonly [number, number], margin: number) {
    const cols = Math.min(720, Math.ceil((canvas.clientWidth * (1 + (2 * margin) / box[0])) / CELL_PX));
    const rows = Math.min(720, Math.ceil((canvas.clientHeight * (1 + (2 * margin) / box[1])) / CELL_PX));
    const key = `${cols}x${rows}`;
    if (key === meshKey) return;
    meshKey = key;
    const verts = new Float32Array((cols + 1) * (rows + 1) * 2);
    for (let y = 0, o = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) { verts[o++] = x / cols; verts[o++] = y / rows; }
    }
    const idx = new Uint32Array(cols * rows * 6);
    for (let y = 0, o = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const a = y * (cols + 1) + x, b = a + 1, c = a + cols + 1, d = c + 1;
        idx.set([a, b, c, b, d, c], o);
        o += 6;
      }
    }
    indexCount = idx.length;
    gl.bindVertexArray(mesh);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  resizeLight = () => {
    for (const f of [light, scratch, glow, glowScratch]) f?.dispose();
    // Full drawing-buffer resolution: the lines are a few pixels wide, so a low-res light reads as pixelated.
    const w = canvas.width;
    const h = canvas.height;
    const target = (tw: number, th: number) => createFBO(gl, Math.max(1, tw), Math.max(1, th), gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    light = target(w, h);
    scratch = target(w, h);
    glow = target(Math.round(w / 4), Math.round(h / 4));
    glowScratch = target(glow.width, glow.height);
    sunTaps = gaussianTaps(SUN_BLUR * (w / (canvas.clientWidth || w)));
    if (samples > 1) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, msaaRb);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFbo);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msaaRb);
    }

    meshKey = '';
  };
  resizeLight();

  let time = 0;
  let reveal = reducedMotion.matches ? 1 : 0;
  let grainClock = 0;
  let waveKey = '';
  let waves: Wave[] = [];
  const waveData = new Float32Array(WAVES * 4);

  function frame(dt: number, rawDtMs: number) {
    if (reducedMotion.matches) {
      // One static frame: redraw only when the config or size changes.
      reveal = 1;
      const key = JSON.stringify(config);
      if (key === drawn) return;
      drawn = key;
    } else {
      drawn = '';
      time += dt * config.speed;
      reveal = Math.min(1, reveal + rawDtMs / REVEAL_MS);
      if (config.grainPeriod > 0) grainClock += rawDtMs / 1000 / config.grainPeriod;
    }

    const key = `${config.seed}|${config.scale}|${config.choppiness}`;
    if (key !== waveKey) {
      waveKey = key;
      waves = makeWaves(config.seed, Math.max(config.scale, 0.1), config.choppiness);
    }
    const layers = LAYERS[config.palette];
    // Shifts each wave's phase by `shift` scaled per wave, so a ribbon is the
    // same web subtly reshaped rather than slid sideways.
    const setWaves = (shift: number) => waves.forEach((v, i) =>
      waveData.set([v.kx, v.ky, v.amp, v.phase - v.omega * time + shift * (0.4 + 1.2 * hash(i + 11.5))], i * 4));

    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    // One unit: the shorter side, but at least a third of the longer, so a
    // short wide header still gets full-size ripples.
    const unit = Math.max(Math.min(w, h), Math.max(w, h) / 3);
    const box = [w / unit, h / unit] as const;
    const depth = Math.max(config.depth, 0.02) * Math.max(config.scale, 0.1);
    // How far refraction can shift light sideways, with room to spare.
    const margin = Math.min(0.08 + 0.12 * depth * Math.max(config.choppiness, 0), 1);
    buildMesh(box, margin);

    // Light: one refraction of the mesh per wavelength, summed.
    gl.bindFramebuffer(gl.FRAMEBUFFER, samples > 1 ? msaaFbo : light!.fbo);
    gl.viewport(0, 0, light!.width, light!.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    lightProgram.use();
    let u = lightProgram.uniforms;
    gl.uniform2f(u.uBox, box[0], box[1]);
    gl.uniform1f(u.uMargin, margin);
    gl.uniform1f(u.uDepth, depth);
    gl.bindVertexArray(mesh);
    if (layers) {
      layers.forEach((color, i) => {
        setWaves((i / (layers.length - 1) - 0.5) * LAYER_SPREAD * config.dispersion);
        gl.uniform4fv(u['uWave[0]'], waveData);
        gl.uniform1f(u.uEta, 1 / 1.333);
        gl.uniform3fv(u.uColor, color);
        gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
      });
    } else {
      setWaves(0);
      gl.uniform4fv(u['uWave[0]'], waveData);
      SPECTRUM.forEach((nm, i) => {
        gl.uniform1f(u.uEta, 1 / ior(nm, config.dispersion));
        gl.uniform3fv(u.uColor, weights[i]);
        gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
      });
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    if (samples > 1) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, light!.fbo);
      const { width: lw, height: lh } = light!;
      gl.blitFramebuffer(0, 0, lw, lh, 0, 0, lw, lh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }

    // The sun's disk: blur the light, across then down.
    blur.use();
    u = blur.uniforms;
    const blurPass = (src: FBO, dst: FBO, taps: ReturnType<typeof gaussianTaps>, dx: number, dy: number) => {
      gl.uniform1i(u.uSrc, src.attach(0));
      gl.uniform2f(u.uStep, dx * src.texelSizeX, dy * src.texelSizeY);
      gl.uniform1i(u.uTaps, taps.count);
      gl.uniform1fv(u['uOffset[0]'], taps.offsets);
      gl.uniform1fv(u['uWeight[0]'], taps.weights);
      blit(dst);
    };
    blurPass(light!, scratch!, sunTaps, 1, 0);
    blurPass(scratch!, light!, sunTaps, 0, 1);

    // The glow: a quarter-resolution copy, blurred wide enough that its texels never show.
    downsample.use();
    gl.uniform1i(downsample.uniforms.uSrc, light!.attach(0));
    blit(glow);
    blur.use();
    blurPass(glow!, glowScratch!, glowTaps, 1, 0);
    blurPass(glowScratch!, glow!, glowTaps, 0, 1);

    const [floor, sun] = (PALETTES[config.palette] ?? PALETTES.pool).map(hexToRgb);
    composite.use();
    u = composite.uniforms;
    gl.uniform1i(u.uLight, light!.attach(0));
    gl.uniform1i(u.uGlow, glow!.attach(1));
    gl.uniform2f(u.uBox, box[0], box[1]);
    gl.uniform2f(u.uSeed, hash(config.seed + 4) * 97, hash(config.seed + 5) * 97);
    gl.uniform3fv(u.uFloor, floor);
    gl.uniform3fv(u.uSun, sun);
    gl.uniform1f(u.uIntensity, config.intensity * (layers ? LAYER_INTENSITY : 1));
    gl.uniform1f(u.uSharpness, config.sharpness + (layers ? LAYER_SHARPNESS : 0));
    gl.uniform1f(u.uReveal, 1 - Math.pow(1 - reveal, 3));
    gl.uniform1f(u.uFill, layers ? 0 : 0.3);
    setGrain(gl, u, config.grain, grainClock);
    blit(null);
  }

  // Draw the floor right away so the canvas never flashes black before the first frame.
  frame(0, 0);
  stage.start(frame);

  return {
    config,
    destroy() {
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
