// Home: every effect as a card. Cards show a recorded loop (scripts/capture.ts)
// rather than the live effect, so the page opens with no WebGL contexts at
// all; browsers cap them at around 16 and drop the oldest past that.
//
// - Videos load only near the viewport, and at most MAX_PLAYING play at once
//   (the most visible cards). The rest show their poster or paused frame.
// - Reduced motion, Save-Data and failed playback leave the poster up; the
//   nav button pauses every preview.
// - With a mouse, dwelling on a card mounts the real effect beneath its video
//   and crossfades to it once it has drawn. Leaving fades the video back in,
//   then destroys the effect. At most one live context exists at a time.

import { renderNav } from '../shell';
import { LOADERS, PREVIEW } from '../effects';
import type { Effect } from '../effects';

renderNav();

const MAX_PLAYING = 3;
const DWELL_MS = 120;
const FADE_MS = 250; // the media crossfade in style.css

/** Seconds a fresh mount needs to look like its preview (mount fades). */
const READY_S: Partial<Record<Effect, number>> = {
  haze: 0.8, caustics: 1, lava: 1, ribbons: 1.3, hyphae: 2.2,
};

/** Mount options on hover: mycelium grows its network out of sight (24 frames) instead of blooming. */
const HOVER: Partial<Record<Effect, { opts: object; frames: number }>> = {
  mycelium: { opts: { warm: 960 }, frames: 26 },
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
  const play = motion
    ? cards.filter((c) => c.ratio > 0 && !c.failed && !(live?.shown && live.card === c))
      .sort((a, b) => b.ratio - a.ratio || centre(a) - centre(b))
      .slice(0, MAX_PLAYING)
    : [];
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

for (const c of cards) {
  c.el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !mouse.matches) return;
    last = { x: e.clientX, y: e.clientY };
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
    if (live?.card === c) release();
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
  const { mount } = await LOADERS[c.effect]();
  if (my !== gen) return;
  // One live context at most: whatever is fading out goes first.
  if (leaving) finish(leaving);
  if (live) finish(live);

  const host = document.createElement('div');
  host.className = 'live';
  c.el.prepend(host);
  const entry: Live = { card: c, host, handle: mount(host, HOVER[c.effect]?.opts), shown: false, timer: 0 };
  live = entry;
  // The stage only hears pointer moves; hand it where the mouse already is.
  dispatchEvent(new PointerEvent('pointermove', { clientX: last.x, clientY: last.y, pointerType: 'mouse' }));

  const ready = performance.now() + (READY_S[c.effect] ?? 0) * 1000;
  // Frame 1 can predate fonts and sizing; wait for the second at least.
  const frames = HOVER[c.effect]?.frames ?? 2;
  host.addEventListener('stageframe', function onFrame(e) {
    if ((e as CustomEvent<number>).detail < frames || performance.now() < ready) return;
    host.removeEventListener('stageframe', onFrame);
    if (live === entry) show(entry);
  });
  host.addEventListener('stagelost', () => { if (live === entry) release(); }, { once: true });
}

function show(e: Live) {
  e.shown = true;
  e.card.el.classList.add('live');
  e.card.video.pause();
  update();
}

/** Fade the preview back in over the effect, then destroy the effect. */
function release() {
  const e = live!;
  live = null;
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
  e.handle.destroy();
  e.host.remove();
}
