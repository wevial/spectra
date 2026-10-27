// Droplet cursor — water on a phone screen. The cursor carries a big drop
// that magnifies the panel into its subpixels; the screen around it is
// beaded with smaller drops that swirl with moiré rainbows. The big drop
// swallows the drops it runs over, sheds the extra water behind it as it
// moves, and wobbles when it stops. Click to flick a spray of new drops.
// Shows any image, canvas or video, or a lock-screen poster by default.

import { Program, VERTEX, makeBlit, createStage, SourceTexture } from '@spectra/core';
import type { Source } from '@spectra/core';
import { DROPLET, MAX_DROPS, BIN } from './shaders';
import { drawPoster } from './poster';

export type DropletSource = Source;

export const LAYOUTS = { lcd: 0, oled: 1 } as const;
export type Layout = keyof typeof LAYOUTS;

export const DEFAULTS = {
  /** Subpixel layout: RGB stripes or a diamond pentile. */
  layout: 'lcd' as Layout,
  /** Panel pixel pitch, CSS px. */
  pixel: 2,
  /** Radius of the cursor's drop, fraction of height. */
  size: 0.12,
  /** Magnification at the center of the cursor's drop. */
  magnify: 10,
  /** Contact angle, degrees. Flatter drops distort less toward the rim. */
  angle: 35,
  /** Color split, × water's real dispersion. */
  dispersion: 4,
  /** Camera sensor pitch, CSS px: the subpixel grid beats against it into moiré bands. */
  sensor: 1.6,
  /** Gaps between pixels outside the drops, 0..1. */
  grid: 0.18,
  /** Blur toward a drop's rim (shallow depth of field), panel px. */
  focus: 0.35,
  /** Reflection of the room and ring light. */
  gloss: 1,
  /** Drops beaded on the screen (per unit of width/height). */
  scatter: 55,
  /** New drops landing per second, while there are fewer than `scatter`. */
  rain: 1.5,
  /** Seconds for the drop to catch up with the cursor. */
  lag: 0.12,
  font: '"Geist", "Inter", system-ui, sans-serif',
};

export type DropletConfig = typeof DEFAULTS;

export interface DropletHandle {
  /** Live config: mutate fields and the next frame picks them up. */
  config: DropletConfig;
  /** Swap what the screen shows. A string is loaded as an image URL; null restores the poster. */
  setSource(source: DropletSource | null): Promise<void>;
  /** Wipe the screen dry (rain refills it). */
  wipe(): void;
  destroy(): void;
}

interface Drop {
  x: number;      // uv
  y: number;
  r: number;      // radius, fraction of height
  grow: number;   // 0..1 as it lands, back to 0 as it's removed
  dying: boolean;
  merging?: boolean; // being drawn into the cursor's drop
  life?: number;     // seconds left before a trail droplet evaporates
}

const WATER = 1.333;
const TILE_ROWS = 12;

/**
 * Mount the effect into `container` (which should be positioned and sized).
 * Without WebGL2 the container gets the `droplet-fallback` class instead.
 */
export function mount(
  container: HTMLElement,
  opts: Partial<DropletConfig> & { source?: DropletSource } = {},
): DropletHandle {
  const { source: initial, ...rest } = opts;
  const config: DropletConfig = { ...DEFAULTS, ...rest };

  const stage = createStage(container);
  if (!stage) {
    container.classList.add('droplet-fallback');
    return { config, setSource: async () => {}, wipe() {}, destroy() {} };
  }
  const { gl, canvas, pointer, reducedMotion } = stage;
  const blit = makeBlit(gl);
  const program = new Program(gl, VERTEX, DROPLET);

  const content = new SourceTexture(gl);
  const posterCanvas = document.createElement('canvas');
  let posterKey = '';
  async function setSource(next: DropletSource | null) {
    await content.set(next);
    if (next == null) posterKey = '';
  }
  if (initial) void setSource(initial);
  document.fonts?.load(`500 64px ${config.font}`).then(() => { posterKey = ''; }, () => {});

  const aspect = () => canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot((ax - bx) * aspect(), ay - by);

  // The beaded screen. Mostly fine mist, a few big drops.
  let drops: Drop[] = [];
  const alive = () => drops.filter((d) => !d.dying);
  function place(x: number, y: number, r: number, grow = 1) {
    if (alive().some((d) => dist(x, y, d.x, d.y) < (r + d.r) * 1.15)) return false;
    if (dist(x, y, drop.x, drop.y) < r + radius() * 1.2) return false;
    drops.push({ x, y, r, grow, dying: false });
    trim();
    return true;
  }
  /** Over capacity: the oldest dry off, trail droplets first. */
  function trim() {
    const live = alive();
    const over = live.length - (MAX_DROPS - 1);
    if (over <= 0) return;
    const order = [...live.filter((d) => d.life !== undefined), ...live.filter((d) => d.life === undefined)];
    for (let i = 0; i < over; i++) order[i].dying = true;
  }
  /** Leave a droplet behind the cursor's drop (no spacing rules: it's a trail). */
  function deposit(x: number, y: number, r: number, life?: number) {
    if (alive().some((d) => dist(x, y, d.x, d.y) < (r + d.r) * 0.9)) return false;
    drops.push({ x, y, r, grow: 0.4, dying: false, life });
    trim();
    return true;
  }
  const mistSize = () => config.size * (0.04 + 0.5 * Math.random() ** 2);
  function scatter(n: number, grow: number) {
    for (let tries = 0; n > 0 && tries < n * 20; tries++) {
      if (place(Math.random(), Math.random(), mistSize(), grow)) n--;
    }
  }

  // The cursor's drop. Water it swallows is extra volume, shed again behind it.
  const drop = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, dirX: 1, dirY: 0, speed: 0, stretch: 0, spring: 0, extra: 0, travel: 0 };
  const radius = () => Math.cbrt(config.size ** 3 + drop.extra);
  scatter(Math.round(config.scatter * aspect()), 1);

  const ac = new AbortController();
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || !pointer.active) return;
    // A flick of spray around the drop.
    const rc = radius();
    for (let i = 0, made = 0; i < 60 && made < 14; i++) {
      const t = Math.random() * Math.PI * 2;
      const d = rc * (1.3 + Math.random() * 2.2);
      if (place(drop.x + (Math.cos(t) * d) / aspect(), drop.y + Math.sin(t) * d, config.size * (0.06 + 0.4 * Math.random() ** 2), 0)) made++;
    }
    drop.spring -= 4;
  }, { signal: ac.signal });

  let idle = 0;
  let time = 0;
  let rainDue = 0;
  const anchor = { x: 0.5, y: 0.5 };
  const uniforms = new Float32Array(MAX_DROPS * 4);

  // Drops binned into screen tiles, so each pixel only checks those nearby.
  const binTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, binTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  let bins = new Uint8Array(0);

  stage.start((dt) => {
    const still = reducedMotion.matches;
    if (!still) time += dt;
    const a = aspect();

    // Content: the poster redraws when the panel size or the minute changes.
    const pitch = Math.max(config.pixel, 0.5);
    const pw = Math.max(1, Math.round(canvas.clientWidth / pitch));
    const ph = Math.max(1, Math.round(canvas.clientHeight / pitch));
    if (content.source === null) {
      const now = new Date();
      const key = `${pw}x${ph} ${now.getHours()}:${now.getMinutes()} ${config.font}`;
      if (key !== posterKey) {
        drawPoster(posterCanvas, pw, ph, config.font, now);
        content.upload(posterCanvas, pw, ph);
        posterKey = key;
      }
    } else {
      content.tick();
    }

    // Follow the cursor; with none, drift slowly around the screen.
    if (pointer.active) {
      idle = 0;
    } else {
      if (idle === 0) { anchor.x = drop.x; anchor.y = drop.y; }
      idle += dt;
    }
    const s = Math.min(idle / 4, 1);
    const settle = s * s * (3 - 2 * s);
    const wx = 0.5 + Math.sin(time * 0.23) * 0.3, wy = 0.5 + Math.sin(time * 0.31 + 1) * 0.25;
    const tx = pointer.active ? pointer.x : anchor.x + (wx - anchor.x) * settle;
    const ty = pointer.active ? pointer.y : anchor.y + (wy - anchor.y) * settle;
    const k = 1 - Math.exp(-dt / Math.max(config.lag / 3, 0.001));
    drop.x += (tx - drop.x) * k;
    drop.y += (ty - drop.y) * k;

    // Speed stretches it along its heading; a spring wobbles it after.
    const vx = ((drop.x - drop.px) * a) / Math.max(dt, 1e-3), vy = (drop.y - drop.py) / Math.max(dt, 1e-3);
    const moved = Math.hypot(vx, vy) * dt;
    drop.px = drop.x;
    drop.py = drop.y;
    drop.speed += (Math.hypot(vx, vy) - drop.speed) * (1 - Math.exp(-dt * 12));
    if (drop.speed > 0.05) {
      const m = Math.hypot(vx, vy) || 1;
      const turn = 1 - Math.exp(-dt * 10);
      drop.dirX += (vx / m - drop.dirX) * turn;
      drop.dirY += (vy / m - drop.dirY) * turn;
      const n = Math.hypot(drop.dirX, drop.dirY) || 1;
      drop.dirX /= n;
      drop.dirY /= n;
    }
    if (still) {
      drop.stretch = drop.spring = 0;
    } else {
      const target = Math.min(drop.speed * 0.25, 0.35);
      drop.spring += ((target - drop.stretch) * 160 - drop.spring * 9) * dt;
      drop.stretch = Math.max(drop.stretch + drop.spring * dt, -0.35);
    }

    // Drops it touches merge: drawn into it as their water joins it.
    let rc = radius();
    for (const d of drops) {
      if (d.dying || d.merging || d.grow < 1) continue;
      if (dist(drop.x, drop.y, d.x, d.y) > rc * 0.95 + d.r) continue;
      d.merging = true;
      drop.spring = Math.min(drop.spring + 1.5, 6);
    }
    for (const d of drops) {
      if (!d.merging || d.dying) continue;
      const pull = 1 - Math.exp(-dt * 10);
      d.x += (drop.x - d.x) * pull;
      d.y += (drop.y - d.y) * pull;
      const r = d.r * Math.exp(-dt * 8);
      drop.extra += d.r ** 3 - r ** 3;
      d.r = r;
      if (dist(drop.x, drop.y, d.x, d.y) + d.r < rc * 0.8 || d.r < config.size * 0.01) {
        drop.extra += d.r ** 3;
        d.dying = true;
        d.grow = 0;
      }
    }
    rc = radius();

    // A moving drop leaves a trail: a steady dribble of fine droplets that
    // soon evaporate, plus bigger ones while it carries swallowed water.
    drop.travel += moved;
    const behind = (r: number, spread: number): [number, number] => {
      const back = rc * (1 + 0.3 * Math.max(drop.stretch, 0)) + r * 1.3;
      const side = (Math.random() - 0.5) * rc * spread;
      return [drop.x + (-drop.dirX * back - drop.dirY * side) / a, drop.y - drop.dirY * back + drop.dirX * side];
    };
    // Carrying more than about half again its own size, it sheds hard.
    const heavy = drop.extra > 2.4 * config.size ** 3;
    if (drop.travel > rc * (heavy ? 0.12 : 0.25) && drop.speed > 0.08 && !still) {
      drop.travel = 0;
      const shed = drop.extra > (config.size * 0.12) ** 3 && (heavy || Math.random() < 0.5);
      if (shed) {
        const r = Math.min(Math.cbrt(drop.extra) * 0.8, config.size * 0.35) * (0.5 + 0.5 * Math.random());
        const [x, y] = behind(r, 0.8);
        if (deposit(x, y, r)) drop.extra = Math.max(drop.extra - r ** 3, 0);
      } else {
        const r = config.size * (0.04 + 0.1 * Math.random() ** 2);
        const [x, y] = behind(r, 1.4);
        deposit(x, y, r, 4 + Math.random() * 6);
      }
    }
    drop.extra *= Math.exp(-dt / 12);

    // Rain tops the screen back up.
    const want = Math.round(config.scatter * a);
    rainDue += dt * config.rain;
    if (alive().length >= want) rainDue = 0;
    while (rainDue >= 1) {
      rainDue--;
      scatter(1, 0);
    }

    // Landing drops swell in; removed ones shrink away; trail droplets dry up.
    for (const d of drops) {
      if (d.life !== undefined && !d.dying && (d.life -= dt) <= 0) d.dying = true;
      d.grow = d.dying ? d.grow - dt * (d.life !== undefined ? 1.2 : 6) : Math.min(d.grow + dt * 5, 1);
    }
    drops = drops.filter((d) => !d.dying || d.grow > 0);

    // Optics. Every drop sits on the same cover glass; its thickness is set
    // so the cursor's drop (at its base size) magnifies `magnify`×. The
    // cursor's drop keeps that magnification as it grows.
    const phi = (Math.min(Math.max(config.angle, 5), 85) * Math.PI) / 180;
    const R = 1 / Math.sin(phi);
    const z0 = R * (1 - Math.cos(phi));
    const depth = (r: number) => (r * R * (1 - 1 / Math.max(config.magnify, 1.01))) / (1 - 1 / WATER);
    const glass = Math.max(depth(config.size) - config.size * z0, 0);
    const sway = still ? 0 : Math.sin(time * 2.1) * 0.015 * Math.min(Math.abs(drop.spring), 1);
    uniforms[0] = drop.x * a;
    uniforms[1] = drop.y;
    uniforms[2] = rc * (1 + sway);
    uniforms[3] = depth(rc);
    // Largest first, so a crowded tile loses only the smallest drops.
    const sized = drops
      .map((d) => ({ d, r: d.r * Math.sin((Math.min(d.grow, 1) * Math.PI) / 2) }))
      .filter((e) => e.r > 0)
      .sort((x, y) => y.r - x.r)
      .slice(0, MAX_DROPS - 1);
    sized.forEach(({ d, r }, i) => uniforms.set([d.x * a, d.y, r, glass + r * z0], (i + 1) * 4));

    const cols = Math.max(1, Math.round(TILE_ROWS * a)), rows = TILE_ROWS;
    if (bins.length !== cols * rows * BIN) bins = new Uint8Array(cols * rows * BIN);
    bins.fill(255);
    const fill = new Uint8Array(cols * rows);
    const bin = (id: number, x: number, y: number, reach: number) => {
      const x0 = Math.max(Math.floor((x - reach / a) * cols), 0), x1 = Math.min(Math.floor((x + reach / a) * cols), cols - 1);
      const y0 = Math.max(Math.floor((y - reach) * rows), 0), y1 = Math.min(Math.floor((y + reach) * rows), rows - 1);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const tile = ty * cols + tx;
          if (fill[tile] < BIN) bins[(ty * cols + tx) * BIN + fill[tile]++] = id;
        }
      }
    };
    bin(0, drop.x, drop.y, rc * (1 + sway) * (2 + 2 * Math.abs(drop.stretch)));
    sized.forEach(({ d, r }, i) => bin(i + 1, d.x, d.y, r * 1.5)); // glints spill past the rim
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, binTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, cols * BIN, rows, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, bins);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);

    const fit = content.cover(pw, ph);
    const px = canvas.clientHeight / pitch;
    const lod = Math.log2(Math.max((content.height * fit[1]) / px, 1));
    const spread = 0.0015 * config.dispersion;

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
    gl.uniform2f(u.uTiles, cols, rows);
    gl.uniform2f(u.uDir, drop.dirX, drop.dirY);
    gl.uniform1f(u.uStretch, drop.stretch);
    gl.uniform2f(u.uContact, Math.sin(phi), Math.cos(phi));
    gl.uniform3f(u.uIor, WATER - spread, WATER, WATER + spread * 1.4);
    gl.uniform1f(u.uMagnify, Math.max(config.magnify, 1));
    gl.uniform1i(u.uLayout, LAYOUTS[config.layout] ?? 0);
    gl.uniform1f(u.uSensor, config.sensor * (gl.drawingBufferWidth / Math.max(canvas.clientWidth, 1)));
    gl.uniform1f(u.uGrid, config.grid);
    gl.uniform1f(u.uFocus, config.focus);
    gl.uniform1f(u.uGloss, config.gloss);
    // A lamp hovers up and to the left of the cursor's drop, so every
    // drop is lit from its own angle and the glints swing as you move.
    gl.uniform3f(u.uLamp, (drop.x - 0.12) * a, drop.y + 0.18, 0.35);
    gl.uniform1f(u.uSize, config.size);
    gl.uniform1f(u.uTime, time);
    blit(null);
  });

  return {
    config,
    setSource,
    wipe() {
      for (const d of drops) d.dying = true;
      drop.extra = 0;
    },
    destroy() {
      ac.abort();
      stage.destroy(); // losing the context frees every GL object with it
    },
  };
}
