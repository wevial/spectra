// The default content: a printed grid poster. Straight lines and round dots
// make the lensing legible — lines bow into arcs, dots stretch, and anything
// right behind the lens becomes an Einstein ring.

export function drawPoster(canvas: HTMLCanvasElement, w: number, h: number, font: string) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const u = h / 100; // 1% of height

  ctx.fillStyle = '#f2ede3';
  ctx.fillRect(0, 0, w, h);

  // Grid: fine every 4u, heavier every 16u, centered.
  const step = 4 * u;
  const ox = (w / 2) % step;
  const oy = (h / 2) % step;
  for (let i = 0; ox + i * step <= w; i++) {
    const x = ox + i * step;
    const major = Math.round((x - w / 2) / step) % 4 === 0;
    ctx.fillStyle = major ? 'rgba(20,16,30,0.28)' : 'rgba(20,16,30,0.1)';
    ctx.fillRect(Math.round(x), 0, major ? Math.max(1, u * 0.18) : Math.max(1, u * 0.08), h);
  }
  for (let j = 0; oy + j * step <= h; j++) {
    const y = oy + j * step;
    const major = Math.round((y - h / 2) / step) % 4 === 0;
    ctx.fillStyle = major ? 'rgba(20,16,30,0.28)' : 'rgba(20,16,30,0.1)';
    ctx.fillRect(0, Math.round(y), w, major ? Math.max(1, u * 0.18) : Math.max(1, u * 0.08));
  }

  // Spectrum bars across the lower third.
  const colors = ['#ff3b3b', '#ff8a2a', '#ffd23b', '#3bd67a', '#3bc8ff', '#5a5cff', '#b03bff'];
  const barH = 1.6 * u;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, h * 0.7 + i * barH, w, barH * 0.72);
  });

  // Dots on the major grid.
  const dots: [number, number, string, number][] = [
    [0.18, 0.26, '#ff6b4a', 3.2], [0.8, 0.22, '#3bc8ff', 2.4], [0.66, 0.5, '#14101e', 1.2],
    [0.3, 0.55, '#ffd23b', 2], [0.86, 0.66, '#b03bff', 1.6], [0.1, 0.82, '#14101e', 2.6],
    [0.52, 0.86, '#ff3b3b', 1.4],
  ];
  for (const [x, y, c, r] of dots) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x * w, y * h, r * u, 0, Math.PI * 2);
    ctx.fill();
  }

  // Headline.
  ctx.fillStyle = '#14101e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 26 * u;
  ctx.font = `500 ${size}px ${font}`;
  ctx.letterSpacing = `${-0.05 * size}px`;
  const fit = (w * 0.86) / Math.max(ctx.measureText('spectra').width, 1);
  if (fit < 1) {
    size *= fit;
    ctx.font = `500 ${size}px ${font}`;
    ctx.letterSpacing = `${-0.05 * size}px`;
  }
  ctx.fillText('spectra', w / 2, h * 0.42);
}
