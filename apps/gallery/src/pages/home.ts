// Home: every effect as a card. Cards show a recorded loop (scripts/capture.ts)
// rather than the live effect, so the page opens with no WebGL contexts at
// all; browsers cap them at around 16 and drop the oldest past that.
//
// - Videos load only near the viewport, and at most MAX_PLAYING play at once
//   (the most visible cards). The rest show their poster or paused frame.
// - Reduced motion, Save-Data and failed playback leave the poster up; the
//   nav button pauses every preview.
// - With a mouse, dwelling on a card mounts the real effect beneath its video
//   and crossfades to it once it has drawn. A cursor effect's pointer starts
//   where the video's is and glides to the mouse. Leaving fades the video
//   back in, then destroys the effect. At most one live context at a time.

import { renderNav } from '../shell';
import { LOADERS, PREVIEW, previewPath } from '../effects';
import { PATH_START } from '../preview-paths';
import type { Effect } from '../effects';

renderNav();

const MAX_PLAYING = 3;
const DWELL_MS = 120;
const FADE_MS = 400; // the media crossfade in style.css
const GLIDE_MS = 500; // live pointer, from the video's path to the mouse
const STEER_FRAMES = 12;

/** Seconds a fresh mount needs to look like its preview (mount fades). */
const READY_S: Partial<Record<Effect, number>> = {
  haze: 0.8, caustics: 1, lava: 1, ribbons: 1.3,
};

/** Mount options on hover: sims grow their network out of sight (`warm` steps, 40–50 a frame) instead of starting from seed. */
const HOVER: Partial<Record<Effect, { opts: object; frames: number }>> = {
  mycelium: { opts: { warm: 960 }, frames: 26 },
  hyphae: { opts: { warm: 840 }, frames: 19 },
};


const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mouse = matchMedia('(hover: hover) and (pointer: fine)');
const saveData = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true;
const PAUSE_KEY = 'spectra:previews-paused';

interface Card {
  el: HTMLAnchorElement;
  effect: Effect;
  video: HTMLVideoElement;
  ratio: number;      // how much of it is on screen
  attached: boolean;  // sources set
  failed: boolean;
}

interface Live {
  card: Card;
  host: HTMLElement;
  handle: { destroy(): void };
  shown: boolean;
  covered: boolean; // shown and faded in: its video can stop
  timer: number;
}

const cards: Card[] = [...document.querySelectorAll<HTMLAnchorElement>('a.card[data-effect]')].map((el) => {
  const video = document.createElement('video');
  Object.assign(video, { muted: true, loop: true, playsInline: true, preload: 'none', disablePictureInPicture: true });
  video.setAttribute('aria-hidden', 'true');
  el.querySelector('img')!.after(video);
  const card: Card = { el, effect: el.dataset.effect as Effect, video, ratio: 0, attached: false, failed: false };
  video.addEventListener('playing', () => el.classList.add('playing'));
  return card;
});
const byEl = new Map(cards.map((c) => [c.el as Element, c]));

let paused = readPaused();
let live: Live | null = null;
let leaving: Live | null = null;
let hovered: Card | null = null; // under the mouse: its preview plays while the effect loads

// --- previews -------------------------------------------------------------

function attach(c: Card) {
  if (c.attached) return;
  c.attached = true;
  const sources = [['webm', 'video/webm; codecs=vp9'], ['mp4', 'video/mp4']] as const;
  for (const [ext, type] of sources) {
    const s = Object.assign(document.createElement('source'), { src: `/${PREVIEW.dir}/${c.effect}.${ext}`, type });
    c.video.append(s);
  }
  // A source's error fires on the <source>; the last one failing means none play.
  c.video.lastElementChild!.addEventListener('error', () => {
    c.failed = true;
    c.el.classList.remove('playing');
    update();
  });
  c.video.preload = 'metadata'; // play() fetches the rest; cards left paused show their poster
  c.video.load();
}

function update() {
  const motion = !paused && !reduced.matches && !saveData;
  const mid = innerHeight / 2;
  const centre = (c: Card) => {
    const r = c.el.getBoundingClientRect();
    return Math.abs(r.top + r.height / 2 - mid);
  };
  const eligible = (c: Card) => !c.failed && !(live?.covered && live.card === c);
  const play = motion
    ? cards.filter((c) => c.ratio > 0 && eligible(c))
      .sort((a, b) => b.ratio - a.ratio || centre(a) - centre(b))
      .slice(0, MAX_PLAYING)
    : [];
  // A hovered card never sits frozen while its effect loads, cap or pause aside.
  if (hovered && eligible(hovered) && !reduced.matches && !saveData && !play.includes(hovered)) play.push(hovered);
  for (const c of cards) {
    if (play.includes(c)) {
      attach(c);
      if (c.video.paused) c.video.play().catch(() => {});
    } else if (!c.video.paused) {
      c.video.pause();
    }
  }
}

let queued = 0;
const schedule = () => { queued ||= requestAnimationFrame(() => { queued = 0; update(); }); };

// Near the viewport: fetch. On screen: eligible to play.
const near = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const c = byEl.get(e.target)!;
    if (!paused && !reduced.matches && !saveData) attach(c);
    near.unobserve(e.target);
  }
}, { rootMargin: '50% 0px' });
const seen = new IntersectionObserver((entries) => {
  for (const e of entries) byEl.get(e.target)!.ratio = e.isIntersecting ? e.intersectionRatio : 0;
  schedule();
}, { threshold: [0, 0.25, 0.5, 0.75, 1] });
for (const c of cards) {
  near.observe(c.el);
  seen.observe(c.el);
}
addEventListener('scroll', schedule, { passive: true });
reduced.addEventListener('change', schedule);

// --- pause control (WCAG 2.2.2) --------------------------------------------

function readPaused() {
  try { return localStorage.getItem(PAUSE_KEY) === '1'; } catch { return false; }
}

if (!saveData) {
  const nav = document.querySelector<HTMLElement>('.nav')!;
  const button = document.createElement('button');
  button.className = 'motion';
  const render = () => {
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Play previews' : 'Pause previews');
    button.innerHTML = paused
      ? '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2v6l5-3z" /></svg>'
      : '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 2v6M7 2v6" /></svg>';
  };
  button.addEventListener('click', () => {
    paused = !paused;
    try { localStorage.setItem(PAUSE_KEY, paused ? '1' : '0'); } catch { /* private mode */ }
    render();
    update();
  });
  render();
  const sync = () => { button.hidden = reduced.matches; };
  reduced.addEventListener('change', sync);
  sync();
  nav.append(button);
}

// --- live on hover ---------------------------------------------------------

let dwell = 0;
let gen = 0; // bumped on every enter/leave; a mount that resolves stale is dropped
let last = { x: 0, y: 0 };
let steering: Live | null = null; // its pointer is driven from here, not by the mouse

window.addEventListener('pointermove', (e) => {
  if (!steering || !e.isTrusted) return;
  last = { x: e.clientX, y: e.clientY };
  e.stopImmediatePropagation();
}, { capture: true });

for (const c of cards) {
  c.el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !mouse.matches) return;
    last = { x: e.clientX, y: e.clientY };
    hovered = c;
    update();
    void LOADERS[c.effect](); // start fetching during the dwell
    clearTimeout(dwell);
    const my = ++gen;
    dwell = window.setTimeout(() => void goLive(c, my), DWELL_MS);
  });
  c.el.addEventListener('pointermove', (e) => { last = { x: e.clientX, y: e.clientY }; });
  c.el.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(dwell);
    gen++;
    if (hovered === c) hovered = null;
    c.el.classList.remove('loading');
    if (live?.card === c) release();
    else update();
  });
}

async function goLive(c: Card, my: number) {
  // Back on a card whose effect is still fading out: keep that one.
  if (leaving?.card === c) {
    clearTimeout(leaving.timer);
    live = leaving;
    leaving = null;
    show(live);
    return;
  }
  c.el.classList.add('loading');
  const { mount } = await LOADERS[c.effect]();
  if (my !== gen) return;
  // One live context at most: whatever is fading out goes first.
  if (leaving) finish(leaving);
  if (live) finish(live);

  const host = document.createElement('div');
  host.className = 'live';
  c.el.prepend(host);
  const entry: Live = { card: c, host, handle: mount(host, HOVER[c.effect]?.opts), shown: false, covered: false, timer: 0 };
  live = entry;
  const start = PATH_START[c.effect];
  if (start !== undefined) steer(entry, start);
  else pointAt(last.x, last.y); // the stage only hears moves; hand it where the mouse is

  const ready = performance.now() + (READY_S[c.effect] ?? 0) * 1000;
  // Frame 1 can predate fonts and sizing; wait for the second at least. A
  // steered pointer needs a few more for the effect's easing to catch up.
  const frames = HOVER[c.effect]?.frames ?? (start === undefined ? 2 : STEER_FRAMES);
  host.addEventListener('stageframe', function onFrame(e) {
    if ((e as CustomEvent<number>).detail < frames || performance.now() < ready) return;
    host.removeEventListener('stageframe', onFrame);
    if (live === entry) show(entry);
  });
  host.addEventListener('stagelost', () => { if (live === entry) release(); }, { once: true });
  // No WebGL2: the stage never draws, so there is nothing to wait for.
  if (!host.querySelector('canvas')) c.el.classList.remove('loading');
}

function show(e: Live) {
  e.shown = true;
  e.card.el.classList.remove('loading');
  e.card.el.classList.add('live');
  // The video keeps playing while it fades out; a frozen frame would ghost.
  clearTimeout(e.timer);
  e.timer = window.setTimeout(() => { e.covered = true; update(); }, FADE_MS);
}

function pointAt(clientX: number, clientY: number) {
  dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, pointerType: 'mouse' }));
}

/**
 * Drive a cursor effect's pointer along its preview's path, in step with the
 * video, while it loads unseen; once shown, glide it to the mouse.
 */
function steer(e: Live, start: number) {
  steering = e;
  let from: { x: number; y: number } | null = null;
  let t0 = 0;
  const frame = (now: number) => {
    if (live !== e) {
      if (steering === e) steering = null;
      return;
    }
    const r = e.host.getBoundingClientRect();
    let p = previewPath(start + e.card.video.currentTime);
    if (e.shown) {
      from ??= p;
      t0 ||= now;
      const k = Math.min(1, (now - t0) / GLIDE_MS);
      const s = k * k * (3 - 2 * k);
      const to = { x: (last.x - r.left) / r.width, y: 1 - (last.y - r.top) / r.height };
      p = { x: from.x + (to.x - from.x) * s, y: from.y + (to.y - from.y) * s };
      if (k === 1) steering = null;
    }
    pointAt(r.left + p.x * r.width, r.top + (1 - p.y) * r.height);
    if (steering === e) requestAnimationFrame(frame);
  };
  frame(performance.now());
}

/** Fade the preview back in over the effect, then destroy the effect. */
function release() {
  const e = live!;
  live = null;
  clearTimeout(e.timer);
  e.card.el.classList.remove('live');
  update();
  if (!e.shown) return finish(e);
  leaving = e;
  e.timer = window.setTimeout(() => finish(e), FADE_MS);
}

function finish(e: Live) {
  clearTimeout(e.timer);
  if (leaving === e) leaving = null;
  if (live === e) {
    live = null;
    e.card.el.classList.remove('live');
  }
  e.card.el.classList.remove('loading');
  e.handle.destroy();
  e.host.remove();
}
