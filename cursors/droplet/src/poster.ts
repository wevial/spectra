// The default content: a phone lock screen, drawn at the panel's own pixel
// resolution so every canvas pixel is one emitter under the water.

export function drawPoster(canvas: HTMLCanvasElement, w: number, h: number, font: string, now: Date) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const u = h / 100;

  // Wallpaper: sky blue through violet into deep red, with soft blooms.
  const bg = ctx.createLinearGradient(0, 0, w, h * 0.4);
  bg.addColorStop(0, '#5cb4e8');
  bg.addColorStop(0.45, '#9d93cf');
  bg.addColorStop(0.75, '#c44d82');
  bg.addColorStop(1, '#a3162e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const bloom = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * h);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  bloom(0.22, 0.8, 0.5, 'rgba(120, 255, 210, 0.35)');
  bloom(0.78, 0.2, 0.45, 'rgba(255, 210, 120, 0.35)');
  bloom(0.55, 0.6, 0.35, 'rgba(255, 255, 255, 0.18)');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';

  // Date and clock.
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
  ctx.font = `500 ${4.6 * u}px ${font}`;
  ctx.globalAlpha = 0.9;
  ctx.fillText(date, w / 2, 17 * u);
  ctx.globalAlpha = 1;
  ctx.font = `500 ${24 * u}px ${font}`;
  ctx.letterSpacing = `${-1 * u}px`;
  ctx.fillText(time, w / 2, 39 * u);
  ctx.letterSpacing = '0px';

  // A notification.
  const nw = Math.min(64 * u, w * 0.8), nx = (w - nw) / 2, ny = 50 * u, nh = 13 * u;
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath();
  ctx.roundRect(nx, ny, nw, nh, 3.5 * u);
  ctx.fill();
  ctx.fillStyle = '#34c759';
  ctx.beginPath();
  ctx.roundRect(nx + 2.5 * u, ny + 2.5 * u, 8 * u, 8 * u, 2 * u);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `500 ${3.4 * u}px ${font}`;
  ctx.fillText('Messages', nx + 13 * u, ny + 5.6 * u);
  ctx.globalAlpha = 0.85;
  ctx.fillText('is it raining where you are?', nx + 13 * u, ny + 10 * u);
  ctx.globalAlpha = 1;

  // Dock icons.
  const icons: [string, string][] = [['#ffd23b', '#ff8a2a'], ['#3bc8ff', '#5a5cff'], ['#7dffa0', '#1fae5b'], ['#ff7eb6', '#e0245e']];
  const size = 11 * u, gap = 5 * u;
  const total = icons.length * size + (icons.length - 1) * gap;
  icons.forEach(([a, b], i) => {
    const x = (w - total) / 2 + i * (size + gap), y = 80 * u;
    const g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 2.6 * u);
    ctx.fill();
  });
}
