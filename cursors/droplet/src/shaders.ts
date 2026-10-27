export const MAX_DROPS = 96;
/** Drops listed per screen tile; the smallest are dropped past this. */
export const BIN = 8;

// A phone screen with water on it. The panel is a grid of emitters (RGB
// stripes, or a diamond pentile), far too fine to see until a drop sits on
// it. Each drop is a spherical cap (footprint radius a, contact angle φ) on
// cover glass above the pixels, so it's a plano-convex lens: view rays
// refract at its surface and land on the panel closer to the center, which
// magnifies the subpixels. The landing point is traced per color channel with
// water's (exaggerated) dispersion, so rims fringe into rainbows.
//
// Every drop sits on the same glass, so the optics depend on its size: the
// big one under the cursor magnifies cleanly, smaller drops overshoot focus
// and show an inverted image, and tiny ones shrink the panel to a pale blur.
// Where subpixels are too fine to resolve, they beat against a virtual camera
// sensor into the soft rainbow moiré of macro photos (see beat()).
export const DROPLET = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uContent;
uniform vec4 uFit;          // content uv = screen uv * uFit.xy + uFit.zw
uniform float uLod;         // content mip level for one panel pixel
uniform vec2 uRes;          // drawing buffer, device px
uniform float uAspect;
uniform float uPx;          // panel pixels per height unit
uniform vec4 uDrops[${MAX_DROPS}]; // center (height units), radius, depth to the panel under the center
uniform highp usampler2D uBins; // per tile, the drops that reach it (255: end of list)
uniform vec2 uTiles;
uniform vec2 uDir;          // drop 0 (the cursor's) heading, and how far it's stretched
uniform float uStretch;
uniform vec2 uContact;      // sin, cos of the contact angle
uniform vec3 uIor;          // refractive index per channel
uniform float uMagnify;     // drop 0's magnification
uniform int uLayout;        // 0 RGB stripe, 1 diamond pentile
uniform float uSensor;      // camera sensor pitch, device px
uniform float uGrid;
uniform float uFocus;
uniform float uGloss;
uniform vec2 uLight;        // ring light tilt
out vec4 fragColor;

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

/** Content at panel coordinate s (panel px), linear light. */
vec3 content(vec2 s) {
  vec2 uv = s / vec2(uAspect * uPx, uPx);
  return lin(textureLod(uContent, uv * uFit.xy + uFit.zw, uLod).rgb);
}

/** 0..1 coverage of a shape with signed distance sd, box-filtered over width f. */
float cover(float sd, float f) { return clamp(0.5 - sd / f, 0.0, 1.0); }

float box(vec2 d, vec2 half_, float r) {
  vec2 q = abs(d) - half_ + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

/** The panel seen from far enough that subpixels merge: content with faint gaps between pixels. */
vec3 screen(vec2 s, float f) {
  vec2 q = abs(fract(s) - 0.5);
  float gap = max(cover(0.43 - q.x, f), cover(0.42 - q.y, f));
  return content(s) * (1.0 - uGrid * gap);
}

/**
 * The panel as a camera sees it when its subpixels are just too fine to
 * resolve: they alias against the sensor grid into soft rainbow bands. Each
 * stripe pattern's fundamental, sampled at sensor pixels, shows up at the
 * frequency left after removing the nearest whole cycle per sensor pixel; its
 * phase picks which channel lights. dx, dy: panel px per device px.
 */
vec3 beat(vec2 s, vec2 dx, vec2 dy, float blur) {
  vec2 k = gl_FragCoord.xy / uSensor;
  vec2 gx = vec2(dx.x, dy.x) * uSensor, gy = vec2(dx.y, dy.y) * uSensor; // panel px per sensor px
  vec2 ax = gx - round(gx), ay = gy - round(gy);
  float px = s.x - dot(round(gx), k), py = s.y - dot(round(gy), k);
  // Bands near the sensor's Nyquist limit, or from a heavily minified panel, wash out.
  float visX = clamp(1.0 - 2.0 * length(ax), 0.0, 1.0) * exp(-0.12 * length(gx));
  float visY = clamp(1.0 - 2.0 * length(ay), 0.0, 1.0) * exp(-0.12 * length(gy));
  float soft = exp(-4.0 * blur);
  visX *= soft;
  visY *= soft;
  const float TAU = 6.2831853;
  vec3 m;
  if (uLayout == 0) {
    m = 1.0 + 0.95 * visX * cos(TAU * (px - vec3(1.0, 3.0, 5.0) / 6.0));
    m *= 1.0 - 0.3 * visY * (0.5 + 0.5 * cos(TAU * py));
  } else {
    // Red and blue alternate on the diagonals (period 2), green every pixel.
    vec2 gd = (gx + gy) * 0.5;
    float vd = clamp(1.0 - 2.0 * length(gd - round(gd)), 0.0, 1.0) * exp(-0.12 * length(gd)) * soft;
    float c = vd * cos(TAU * ((s.x + s.y) * 0.5 - dot(round(gd), k)));
    m = vec3(1.0 + 0.95 * c, 1.0 - 0.5 * visX * visY * cos(TAU * px) * cos(TAU * py), 1.0 - 0.95 * c);
  }
  return content(s) * m;
}

/** Linear light the panel emits at s (panel px). dx, dy: panel px per device px; blur: defocus, panel px. */
vec3 panel(vec2 s, vec2 dx, vec2 dy, float blur) {
  float f = max(length(dx), length(dy)) + blur;
  float far = smoothstep(0.35, 0.8, f * uSensor); // past this the sensor can't resolve subpixels
  if (far >= 1.0) return beat(s, dx, dy, blur);
  vec2 cell = floor(s);
  vec2 q = s - cell;
  vec3 L;
  if (uLayout == 0) {
    // Three stripes per pixel, each lit by its own channel.
    vec3 c = content(cell + 0.5);
    vec3 m = vec3(
      cover(box(q - vec2(1.0 / 6.0, 0.5), vec2(0.12, 0.42), 0.06), f),
      cover(box(q - vec2(0.5, 0.5), vec2(0.12, 0.42), 0.06), f),
      cover(box(q - vec2(5.0 / 6.0, 0.5), vec2(0.12, 0.42), 0.06), f));
    L = c * m * 5.04; // 1 / stripe area: the same light, concentrated
  } else {
    // Diamond pentile: a green dot per pixel; red and blue diamonds on the
    // corners, alternating, each shared by the pixels around it.
    vec3 c = content(cell + 0.5);
    vec2 k = floor(s + 0.5);
    vec2 d = s - k;
    float diamond = cover((abs(d.x) + abs(d.y) - 0.34) * 0.7071, f);
    float red = mod(k.x + k.y, 2.0);
    vec3 corner = content(k);
    float g = cover(length(q - 0.5) - 0.17, f);
    L = vec3(corner.r * diamond * (1.0 - red) * 8.65, c.g * g * 11.0, corner.b * diamond * red * 8.65);
  }
  return far > 0.0 ? mix(L, beat(s, dx, dy, blur), far) : L;
}

/** Where a view ray through a surface with normal N lands D below it, for index n. */
vec2 land(vec3 N, float n, float D) {
  vec3 T = refract(vec3(0.0, 0.0, -1.0), N, 1.0 / n);
  return T.xy / -T.z * D;
}

/** What the drop reflects: a dim room, a window, and a ring light overhead. */
vec3 room(vec3 R) {
  vec3 axis = normalize(vec3(uLight, 1.0));
  float a = acos(clamp(dot(R, axis), -1.0, 1.0));
  float ring = exp(-pow((a - 0.3) / 0.03, 2.0));
  float window = smoothstep(0.35, 0.15, length(R.xy - vec2(-0.5, 0.45)));
  return vec3(0.9, 0.95, 1.0) * (ring * 7.0 + window * 2.0 + 0.25);
}

void main() {
  vec2 p = vUv * vec2(uAspect, 1.0);
  float pixel = 1.0 / uRes.y; // one device px, height units

  // The drop over this point: the tallest, where they overlap.
  float top = 0.0;
  vec3 N = vec3(0.0, 0.0, 1.0);
  float rho = 2.0, D = 0.0, a = 1.0;
  vec2 off = vec2(0.0);
  bool held = false;
  float R = 1.0 / uContact.x;          // sphere radius, in drop radii
  float z0 = R - R * uContact.y;        // cap height at the center
  ivec2 tile = ivec2(min(vUv * uTiles, uTiles - 1.0));
  for (int j = 0; j < ${BIN}; j++) {
    uint id = texelFetch(uBins, ivec2(tile.x * ${BIN} + j, tile.y), 0).r;
    if (id == 255u) break;
    int i = int(id);
    vec4 d = uDrops[i];
    vec2 o = p - d.xy;
    float reach = d.z * (i == 0 ? 2.0 + 2.0 * abs(uStretch) : 1.0);
    if (dot(o, o) >= reach * reach) continue;
    vec2 q = o / d.z;
    vec2 J = vec2(1.0);
    vec2 perp = vec2(-uDir.y, uDir.x);
    if (i == 0) {
      // The moving drop stretches along its heading, with a tail behind.
      float tail = dot(o, uDir) < 0.0 ? 1.0 + max(uStretch, 0.0) * 0.8 : 1.0;
      J = vec2(1.0 / ((1.0 + uStretch) * tail), 1.0 + uStretch * 0.5);
      q = vec2(dot(o, uDir), dot(o, perp)) * J / d.z;
    }
    float r2 = dot(q, q);
    if (r2 >= 1.0) continue;
    float zs = sqrt(R * R - r2);
    float z = (zs - R * uContact.y) * d.z;
    if (z <= top) continue;
    top = z;
    vec2 slope = q * J / zs;
    if (i == 0) slope = slope.x * uDir + slope.y * perp;
    N = normalize(vec3(slope, 1.0));
    rho = sqrt(r2);
    a = d.z;
    off = o;
    held = i == 0;
    D = d.w - (z0 * d.z - z);
  }

  // Landing points per channel. Derivatives are taken here, outside any
  // branch (off a drop, N is flat and every channel lands straight down).
  vec2 lr = land(N, uIor.r, D), lg = land(N, uIor.g, D), lb = land(N, uIor.b, D);
  if (held) {
    // The cursor's drop is an idealized magnifier: even magnification
    // across the middle, easing back to 1× at the rim, where the panel
    // compresses and the colors split.
    float t = smoothstep(0.6, 1.0, rho);
    lg = -off * (1.0 - 1.0 / uMagnify) * (1.0 - t * t);
    float split = 9.0 * t * t;
    lr = lg * (1.0 + ((uIor.r - 1.0) / (uIor.g - 1.0) - 1.0) * split);
    lb = lg * (1.0 + ((uIor.b - 1.0) / (uIor.g - 1.0) - 1.0) * split);
  }
  vec2 s = p * uPx;
  vec2 sg = (p + lg) * uPx;
  float f0 = max(length(dFdx(s)), length(dFdy(s)));
  vec2 dx = dFdx(sg), dy = dFdy(sg);

  vec3 col;
  float wetness = rho < 1.0 ? smoothstep(1.0, 1.0 - 1.5 * pixel / a, rho) : 0.0;
  if (wetness <= 0.0) {
    col = screen(s, f0);
  } else {
    vec2 sr = (p + lr) * uPx;
    vec2 sb = (p + lb) * uPx;
    // Shallow depth of field: the panel softens toward the rim.
    float blur = uFocus * smoothstep(0.3, 1.0, rho);
    vec3 lit = vec3(panel(sr, dx, dy, blur).r, panel(sg, dx, dy, blur).g, panel(sb, dx, dy, blur).b);

    float F = 0.02 + 0.98 * pow(1.0 - N.z, 5.0);
    col = lit * (1.0 - F);
    col *= 1.0 - 0.6 * smoothstep(0.7, 1.0, rho) * smoothstep(0.7, 1.0, rho); // the rim bends away from the light
    col += room(reflect(vec3(0.0, 0.0, -1.0), N)) * F * uGloss * 3.0;
    if (wetness < 1.0) col = mix(screen(s, f0), col, wetness);
  }

  // Bright subpixels bleed toward white, then a soft shoulder.
  vec3 hot = max(col - 1.0, 0.0);
  col += 0.12 * (hot.r + hot.g + hot.b);
  col = mix(col, 0.7 + 0.3 * (1.0 - exp(-(col - 0.7) / 0.3)), step(0.7, col));
  fragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;
