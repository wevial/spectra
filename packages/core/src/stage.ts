// Host plumbing every effect needs: a canvas filling its container, a WebGL2
// context, DPR-capped sizing, mouse tracking in GL uv space, and a render loop
// that pauses while the tab is hidden or the canvas is scrolled out of view.

export interface Pointer {
  x: number;        // GL uv, origin bottom-left
  y: number;
  dx: number;       // movement accumulated since the last frame
  dy: number;
  active: boolean;  // false until the first move, and after the mouse leaves
}

export interface Stage {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  pointer: Pointer;
  reducedMotion: MediaQueryList;
  dprCap: number;
  /** Resize the drawing buffer to the canvas box. Returns true if it changed. */
  resize(): boolean;
  start(frame: (dt: number, rawDtMs: number) => void): void;
  stop(): void;
  destroy(): void;
}

export interface StageOptions {
  dprCap?: number;
  /** Ask for EXT_color_buffer_float (render to half/float targets). */
  floatTargets?: boolean;
  onResize?: () => void;
}

/** Returns null when WebGL2 (or float targets, if asked) is unavailable. */
export function createStage(container: HTMLElement, opts: StageOptions = {}): Stage | null {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  const gl = canvas.getContext('webgl2', {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    powerPreference: 'high-performance',
  });
  if (!gl || (opts.floatTargets && !gl.getExtension('EXT_color_buffer_float'))) {
    canvas.remove();
    return null;
  }

  const ac = new AbortController();
  const listen = { passive: true, signal: ac.signal } as const;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // Mouse only — touch is left free for scrolling/gestures. Coordinates are
  // relative to the canvas, so an effect can live in any box on the page.
  const pointer: Pointer = { x: 0.5, y: 0.5, dx: 0, dy: 0, active: false };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = 1 - (e.clientY - r.top) / r.height;
    const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    if (pointer.active && inside) {
      pointer.dx += x - pointer.x;
      pointer.dy += y - pointer.y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.active = inside;
  }, listen);
  document.addEventListener('pointerleave', () => { pointer.active = false; }, listen);
  window.addEventListener('blur', () => { pointer.active = false; }, listen);

  let frameFn: ((dt: number, rawDtMs: number) => void) | null = null;
  let rafId = 0;
  let last = 0;
  let visible = !document.hidden;
  let onScreen = true;

  const stage: Stage = {
    gl,
    canvas,
    pointer,
    reducedMotion,
    dprCap: opts.dprCap ?? 2,
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, stage.dprCap);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w;
      canvas.height = h;
      return true;
    },
    start(frame) {
      frameFn = frame;
      schedule();
    },
    stop() {
      frameFn = null;
      cancelAnimationFrame(rafId);
      rafId = 0;
    },
    destroy() {
      stage.stop();
      ac.abort();
      ro.disconnect();
      io.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };

  function tick(now: number) {
    rafId = 0;
    if (!frameFn) return;
    const rawDt = now - last;
    last = now;
    frameFn(Math.min(Math.max(rawDt / 1000, 0), 1 / 30), rawDt);
    pointer.dx = 0;
    pointer.dy = 0;
    schedule();
  }

  function schedule() {
    if (rafId || !frameFn || !visible || !onScreen) return;
    if (!last) last = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (!visible) return pause();
    last = performance.now();
    schedule();
  }, { signal: ac.signal });

  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (!onScreen) return pause();
    last = performance.now();
    schedule();
  });
  io.observe(canvas);

  const ro = new ResizeObserver(() => {
    if (stage.resize()) opts.onResize?.();
  });
  ro.observe(canvas);

  stage.resize();
  return stage;
}
