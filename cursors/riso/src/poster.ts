// The default content: a sunset over hills with ferns in the foreground.
// Smooth gradients show off the halftone; overlapping hues show the overprint.

export function drawPoster(canvas: HTMLCanvasElement, w: number, h: number, font: string) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  sky.addColorStop(0, '#4f6bff');
  sky.addColorStop(0.55, '#ff7eb6');
  sky.addColorStop(1, '#ffc27a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun.
  const sx = w * 0.66, sy = h * 0.5, sr = h * 0.2;
  const sun = ctx.createRadialGradient(sx, sy - sr * 0.3, sr * 0.1, sx, sy, sr);
  sun.addColorStop(0, '#fff6b0');
  sun.addColorStop(1, '#ffb000');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  // Hills, back to front.
  const hill = (base: number, amp: number, freq: number, phase: number, top: string, bottom: string) => {
    const g = ctx.createLinearGradient(0, h * (base - amp), 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 80) {
      const t = x / w;
      ctx.lineTo(x, h * (base - amp * (0.6 * Math.sin(t * freq + phase) + 0.4 * Math.sin(t * freq * 2.3 + phase * 1.7))));
    }
    ctx.lineTo(w, h);
    ctx.fill();
  };
  hill(0.68, 0.08, 5, 1.2, '#7a5cff', '#3b3a8f');
  hill(0.8, 0.07, 7, 4.0, '#1f8a8a', '#0f3442');

  // Fern fronds: leaflets along curved stems, rising from the bottom corners.
  const frond = (x0: number, y0: number, len: number, angle: number, curl: number, color: string) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, len * 0.012);
    const n = 22;
    let x = x0, y = y0, a = angle;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const step = len / n;
      a += curl / n;
      x += Math.cos(a) * step;
      y -= Math.sin(a) * step;
      ctx.lineTo(x, y);
      pts.push([x, y, a]);
    }
    ctx.stroke();
    pts.forEach(([px, py, pa], i) => {
      const size = len * 0.16 * (1 - i / n) + len * 0.02;
      for (const side of [1, -1]) {
        const la = pa + side * 1.1;
        ctx.beginPath();
        ctx.ellipse(px + Math.cos(la) * size * 0.5, py - Math.sin(la) * size * 0.5, size * 0.5, size * 0.16, -la, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };
  const s = Math.min(w, h * 1.6);
  frond(w * 0.02, h * 1.02, s * 0.5, 1.25, -0.9, '#0d4a35');
  frond(w * 0.1, h * 1.05, s * 0.38, 1.0, -0.7, '#14603f');
  frond(w * 0.98, h * 1.02, s * 0.46, 1.9, 0.9, '#0d4a35');
  frond(w * 0.9, h * 1.05, s * 0.34, 2.15, 0.6, '#14603f');

  // Headline.
  ctx.fillStyle = '#1a1033';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let size = h * 0.2;
  ctx.font = `500 ${size}px ${font}`;
  ctx.letterSpacing = `${-0.05 * size}px`;
  const fit = (w * 0.7) / Math.max(ctx.measureText('spectra').width, 1);
  if (fit < 1) {
    size *= fit;
    ctx.font = `500 ${size}px ${font}`;
    ctx.letterSpacing = `${-0.05 * size}px`;
  }
  ctx.fillText('spectra', w * 0.07, h * 0.3);
}
