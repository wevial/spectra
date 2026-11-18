// Records a looping preview of every effect (or the ones named) into
// public/previews: <name>.webm (VP9), <name>.mp4 (H.264, fast start) and a
// first-frame <name>.webp poster.
//
//   bun run capture                 every effect
//   bun run capture lava hyphae     just these
//
// Each effect runs in headless Chromium on manually stepped stages (fixed dt,
// fixed DPR, seeded randomness), so a rerun records the same frames.
//
// Closing the loop: the recording runs SEARCH seconds longer than a loop,
// and the loop is cut where its two ends look most alike (any start; for
// backgrounds any length from 4 to 6 s, for cursor effects exactly the
// cursor path's period, so the pointer lines up too). The OVERLAP seconds
// after the cut are crossfaded into the loop's start, so its last frame runs
// straight into its first. The report's `blend` column is how far apart the
// crossfaded ends are, relative to a typical frame-to-frame change: near 0
// is a clean recurrence, high means a visible dissolve.

import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EFFECTS, PREVIEW, isCursor } from '../src/effects';
import type { Effect } from '../src/effects';
import type { CaptureSetup } from '../src/capture';

const ROOT = join(import.meta.dir, '..');
const OUT = join(ROOT, 'public', PREVIEW.dir);

const CSS = { width: 448, height: 280 }; // a home card at the gallery's widest
const DPR = PREVIEW.width / CSS.width;
const SIM_FPS = 60;
const STEPS = SIM_FPS / PREVIEW.fps;  // sim steps per video frame
const PERIOD = 6;                     // seconds for the cursor path to close
const LENGTHS = [4, 6];               // seconds a background loop may last
const OVERLAP = 1.5;                  // seconds crossfaded into the start
const SEARCH = 8;                     // extra seconds recorded to find a good cut
const SEED = 7;

/** Seconds to run before recording: past mount fades, and for sims, long enough to grow in. */
const WARMUP: Partial<Record<Effect, number>> = {
  mycelium: 8,
  hyphae: 14,
  lava: 12,
  nebula: 4,
  plume: 6,
  filings: 4,
};

interface Codec {
  crf: number;
  args(crf: number): string[];
  /** Arguments for a two-pass encode at `kbps`. */
  twoPass(kbps: number): string[];
}

const GOP = `${PERIOD * PREVIEW.fps}`;

const vp9: Codec = {
  crf: 34,
  args: (crf) => ['-c:v', 'libvpx-vp9', '-crf', `${crf}`, '-b:v', '0', '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-g', GOP],
  twoPass: (kbps) => ['-c:v', 'libvpx-vp9', '-b:v', `${kbps}k`, '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-g', GOP],
};

const h264: Codec = {
  crf: 23,
  args: (crf) => ['-c:v', 'libx264', '-preset', 'veryslow', '-crf', `${crf}`, '-profile:v', 'high', '-movflags', '+faststart', '-g', GOP],
  twoPass: (kbps) => ['-c:v', 'libx264', '-preset', 'veryslow', '-b:v', `${kbps}k`, '-profile:v', 'high', '-movflags', '+faststart', '-g', GOP],
};



interface Cut { start: number; length: number }

/**
 * Where to cut the loop: the start and length (in frames) whose overlap
 * matches the frames at the loop's start best, judged on small grayscale
 * thumbnails.
 */
function findCut(frames: Uint8Array[], cursor: boolean): Cut {
  const fps = PREVIEW.fps;
  const k = OVERLAP * fps;
  const thumbs = frames.map(thumb);
  const lengths = cursor
    ? [PERIOD * fps]
    : Array.from({ length: (LENGTHS[1] - LENGTHS[0]) * fps / 3 + 1 }, (_, i) => LENGTHS[0] * fps + i * 3);
  let best: Cut = { start: 0, length: lengths[0] }, bestCost = Infinity;
  for (const length of lengths) {
    for (let start = 0; start + length + k <= frames.length; start++) {
      let cost = 0;
      for (let i = 0; i < k; i += 5) cost += thumbDiff(thumbs[start + i], thumbs[start + length + i]);
      if (cost < bestCost) { bestCost = cost; best = { start, length }; }
    }
  }
  return best;
}

/** Luminance on a coarse grid. */
function thumb(f: Uint8Array) {
  const step = 8, w = PREVIEW.width / step, h = PREVIEW.height / step;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * step * PREVIEW.width + x * step) * 4;
      out[y * w + x] = 0.2126 * f[i] + 0.7152 * f[i + 1] + 0.0722 * f[i + 2];
    }
  }
  return out;
}

function thumbDiff(a: Float32Array, b: Float32Array) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

async function main() {
  const names = (process.argv.slice(2).length ? process.argv.slice(2) : EFFECTS) as Effect[];
  for (const n of names) if (!EFFECTS.includes(n)) throw new Error(`unknown effect: ${n}`);

  await mkdir(OUT, { recursive: true });
  const tmp = await mkdtemp(join(tmpdir(), 'spectra-capture-'));
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, hmr: false, watch: { ignored: ['**/*'] } } });
  await server.listen();
  const url = server.resolvedUrls!.local[0];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--enable-unsafe-swiftshader'],
  });

  const report: string[] = [];
  let failed = false;
  try {
    for (const effect of names) {
      const t0 = performance.now();
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      page.on('pageerror', (e) => console.error(`[${effect}] ${e.message}`));
      await page.goto(new URL('capture.html', url).href);
      await page.waitForFunction(() => 'capture' in window);
      const setup: CaptureSetup = { effect, ...CSS, dpr: DPR, seed: SEED, period: PERIOD };
      const size = await page.evaluate((s) => window.capture.mount(s), setup);
      if (size.width !== PREVIEW.width || size.height !== PREVIEW.height) {
        throw new Error(`${effect}: drawing buffer is ${size.width}x${size.height}`);
      }

      const dt = 1 / SIM_FPS;
      const warm = Math.round((WARMUP[effect] ?? 2.5) * SIM_FPS);
      for (let done = 0; done < warm; done += 120) {
        await page.evaluate(([n, d]) => window.capture.warm(n, d), [Math.min(120, warm - done), dt]);
      }
      const total = (Math.max(PERIOD, LENGTHS[1]) + OVERLAP + SEARCH) * PREVIEW.fps;
      const frames: Uint8Array[] = [];
      while (frames.length < total) {
        const batch = await page.evaluate(([n, e, d]) => window.capture.frames(n, e, d), [Math.min(15, total - frames.length), STEPS, dt]);
        for (const b of batch) frames.push(Buffer.from(b, 'base64'));
      }

      const cut = findCut(frames, isCursor(effect));
      const { loop, blend, jump } = closeLoop(frames, cut, !GLOBAL_DISSOLVE.has(effect));
      const raw = join(tmp, `${effect}.rgba`);
      await Bun.write(raw, concat(loop));
      const poster = await page.evaluate(
        ([b, w, h]) => window.capture.poster(b, w, h, 0.82),
        [Buffer.from(loop[0]).toString('base64'), PREVIEW.width, PREVIEW.height] as const,
      );
      await Bun.write(join(OUT, `${effect}.webp`), Buffer.from(poster, 'base64'));
      await page.close();

      const seconds = loop.length / PREVIEW.fps;
      const webm = await encode(raw, join(OUT, `${effect}.webm`), vp9, seconds, tmp);
      const mp4 = await encode(raw, join(OUT, `${effect}.mp4`), h264, seconds, tmp);
      const posterKb = (await stat(join(OUT, `${effect}.webp`))).size / 1000;
      const over = webm.bytes > PREVIEW.maxBytes || mp4.bytes > PREVIEW.maxBytes;
      failed ||= over;
      report.push([
        effect.padEnd(10),
        `webm ${(webm.bytes / 1000).toFixed(0).padStart(4)} KB (${webm.mode})`,
        `mp4 ${(mp4.bytes / 1000).toFixed(0).padStart(4)} KB (${mp4.mode})`,
        `poster ${posterKb.toFixed(0).padStart(3)} KB`,
        `${seconds.toFixed(1)}s loop from ${(cut.start / PREVIEW.fps).toFixed(1)}s`,
        `blend ${blend.toFixed(2)}`,
        `seam ${jump.toFixed(2)}`,
        `${((performance.now() - t0) / 1000).toFixed(1)}s`,
        over ? 'OVER BUDGET' : '',
      ].join('  '));
      console.log(report.at(-1));
    }
  } finally {
    await browser.close();
    await server.close();
    await rm(tmp, { recursive: true, force: true });
  }
  console.log(`\n${report.join('\n')}\n\nblend: how far apart the crossfaded ends are, in typical frame-to-frame changes (near 0 is clean). seam: last→first frame change, same scale (~1 is seamless).`);
  if (failed) process.exit(1);
}

/**
 * Effects that crossfade all at once instead of staggered: ribbons are
 * translucent, so a global dissolve just looks like extra ribbons for a
 * moment, while a staggered one cuts them into fragments.
 */
const GLOBAL_DISSOLVE: ReadonlySet<Effect> = new Set(['ribbons']);

/** Share of the overlap each pixel takes to switch; the rest staggers pixels by MASK. */
const SWITCH = 0.3;

/**
 * Smooth noise in [0, 1] at ~80 px features: when each pixel switches during
 * the crossfade. A global dissolve double-exposes the whole frame at once,
 * which shows on sharp structure (caustics' web, lava's blobs); staggered,
 * only a thin band is ever mid-blend, and it reads as the pattern re-forming.
 */
const MASK = (() => {
  const { width: w, height: h } = PREVIEW;
  const cell = 80, gw = w / cell + 2, gh = h / cell + 2;
  const rand = mulberry(SEED);
  const grid = Float32Array.from({ length: gw * gh }, rand);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = y / cell, y0 = Math.floor(gy), ty = smooth(gy - y0);
    for (let x = 0; x < w; x++) {
      const gx = x / cell, x0 = Math.floor(gx), tx = smooth(gx - x0);
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  // Spread to the full range so the stagger covers the whole overlap.
  let lo = Infinity, hi = -Infinity;
  for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return out.map((v) => (v - lo) / (hi - lo));
})();

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The loop at `cut`, with the OVERLAP seconds after it crossfaded into its
 * start: the last frame then leads into the first like any other pair.
 */
function closeLoop(frames: Uint8Array[], { start, length: n }: Cut, staggered: boolean) {
  const k = OVERLAP * PREVIEW.fps;
  const { width: w, height: h } = PREVIEW;
  const loop = frames.slice(start, start + n).map((f, i) => {
    if (i >= k) return f;
    const p = (i + 0.5) / k; // 0 = all tail, 1 = all head
    const tail = frames[start + n + i];
    const out = new Uint8Array(f.length);
    for (let y = 0; y < h; y++) {
      // GL rows run bottom-up; the mask doesn't care which way.
      for (let x = 0; x < w; x++) {
        const t = staggered ? (p - MASK[y * w + x] * (1 - SWITCH)) / SWITCH : p;
        const wgt = t <= 0 ? 0 : t >= 1 ? 1 : smooth(t);
        const j = (y * w + x) * 4;
        out[j] = tail[j] + (f[j] - tail[j]) * wgt + 0.5;
        out[j + 1] = tail[j + 1] + (f[j + 1] - tail[j + 1]) * wgt + 0.5;
        out[j + 2] = tail[j + 2] + (f[j + 2] - tail[j + 2]) * wgt + 0.5;
        out[j + 3] = 255;
      }
    }
    return out;
  });
  const steps = loop.slice(1).map((f, i) => diff(loop[i], f)).sort((a, b) => a - b);
  const typical = steps[steps.length >> 1] || 1e-6;
  const blend = Array.from({ length: k }, (_, i) => diff(frames[start + i], frames[start + n + i])).reduce((a, b) => a + b, 0) / k;
  return { loop, blend: blend / typical, jump: diff(loop[n - 1], loop[0]) / typical };
}

function smooth(x: number) {
  return x * x * (3 - 2 * x);
}

/** Mean absolute RGB difference over a sample of pixels. */
function diff(a: Uint8Array, b: Uint8Array) {
  let sum = 0, count = 0;
  for (let i = 0; i < a.length; i += 4 * 7) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    count += 3;
  }
  return sum / count;
}

function concat(frames: Uint8Array[]) {
  const out = new Uint8Array(frames.reduce((n, f) => n + f.length, 0));
  let o = 0;
  for (const f of frames) { out.set(f, o); o += f.length; }
  return out;
}

/**
 * Encode at the codec's quality, coarsening a few steps until the file fits
 * the budget. Effects too busy for that (filings: thousands of tiny needles)
 * get a two-pass encode at the budget's bitrate instead.
 */
async function encode(raw: string, out: string, codec: Codec, seconds: number, tmp: string) {
  const run = async (args: string[], dest = out) => {
    const proc = Bun.spawn([
      'ffmpeg', '-y', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${PREVIEW.width}x${PREVIEW.height}`, '-r', `${PREVIEW.fps}`, '-i', raw,
      '-vf', 'vflip', '-pix_fmt', 'yuv420p', '-an', ...args, dest,
    ], { stderr: 'inherit', cwd: tmp });
    if (await proc.exited) throw new Error(`ffmpeg failed on ${out}`);
    return (await stat(out).catch(() => ({ size: 0 }))).size;
  };
  const fits = (bytes: number) => bytes <= PREVIEW.maxBytes * 0.96;
  for (let crf = codec.crf; crf <= codec.crf + 8; crf += 2) {
    const bytes = await run(codec.args(crf));
    if (fits(bytes)) return { bytes, mode: `crf ${crf}` };
  }
  const target = codec.twoPass(Math.floor((PREVIEW.maxBytes * 0.85 * 8) / seconds / 1000));
  await run([...target, '-pass', '1', '-f', 'null'], '/dev/null');
  const bytes = await run([...target, '-pass', '2']);
  return { bytes, mode: '2-pass' };
}

// Last, so every helper and constant above is initialised.
await main();
