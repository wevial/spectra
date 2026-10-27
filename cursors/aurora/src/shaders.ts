import { NOISE } from '@spectra/core';

// Shared camera: looking north over a lake, horizon at uHorizon (screen uv).
// Ground plane is xz; the aurora hangs between altitudes H0 and H0 + uHeight.
const CAMERA = /* glsl */ `
vec3 rayDir(vec2 uv) {
  vec2 p = (uv - vec2(0.5, uHorizon)) * vec2(uAspect, 1.0);
  return normalize(vec3(p.x, p.y, 1.0));
}
`;

// Pass 1, half resolution: the aurora alone.
//
// The cursor paints it: its trail is the lower edge of a curtain, and rays
// rise from it — each pixel looks straight down for trail below it, so the
// curtain is the trail extruded upward, green at the base, the high color
// above, streaked by rays and swaying.
//
// Behind that, faint ambient curtains: thin vertical sheets standing on wavy
// lines across the ground. Per pixel, find where the view ray crosses each
// sheet; the altitude there gives the color, the x gives the rays, and grazing
// angles — looking along a fold — glow brightest, as real curtains do.
export const AURORA = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTrail;
uniform float uAspect;
uniform float uHorizon;
uniform float uTime;
uniform float uHeight;     // ambient curtain height, altitude units
uniform float uAmbient;    // ambient curtain brightness
uniform float uIntensity;  // painted curtain brightness
uniform float uRise;       // painted curtain height, fraction of the screen
uniform vec3 uLow;         // oxygen green, lower curtain
uniform vec3 uHigh;        // upper curtain
uniform vec3 uFringe;      // lower edge
out vec4 fragColor;
${NOISE}
${CAMERA}

const float H0 = 1.0;
const int CURTAINS = 3;

// Curtain k's footprint: distance north (z) as a function of x.
float centerline(float x, float k) {
  float c = 7.0 + k * 4.5
    + 2.2 * sin(x * 0.16 + uTime * 0.07 + k * 2.1)
    + 1.1 * sin(x * 0.41 - uTime * 0.05 + k * 4.3)
    + 3.0 * (vnoise(vec2(x * 0.13 + k * 9.0, uTime * 0.04)) - 0.5);
  return c;
}

float rays(float x, float k) {
  float coarse = vnoise(vec2(x * 1.3 + uTime * 0.1, k * 17.0));
  float fine = vnoise(vec2(x * 6.0 - uTime * 0.3, k * 5.0 + 3.0));
  return 0.2 + 0.8 * coarse * coarse * (0.45 + 0.55 * fine);
}

vec3 tintAt(float h) {
  vec3 tint = mix(uLow, uHigh, smoothstep(0.25, 0.9, h));
  return mix(mix(tint, uFringe, 0.6), tint, smoothstep(0.0, 0.05, h));
}

vec3 ambient(vec3 d) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < CURTAINS; i++) {
    float k = float(i);
    // Ray meets sheet: solve d.z * t = centerline(d.x * t) by fixed point.
    float t = (7.0 + k * 4.5) / d.z;
    for (int n = 0; n < 5; n++) t = centerline(d.x * t, k) / d.z;
    float x = d.x * t;
    float h = (d.y * t - H0) / uHeight;
    if (h < -0.05 || h > 1.2) continue;

    // Brighter where the ray grazes the sheet (slope of the footprint).
    float slope = (centerline(x + 0.05, k) - centerline(x - 0.05, k)) / 0.1;
    vec2 n2 = normalize(vec2(-slope, 1.0));
    float graze = min(1.0 / max(abs(dot(n2, normalize(d.xz))), 0.05), 6.0);

    float profile = smoothstep(-0.02, 0.04, h) * exp(-max(h, 0.0) * 2.2);
    acc += tintAt(h) * rays(x, k) * profile * (0.5 + 0.5 * graze) / (1.0 + k * 0.6);
  }
  return acc;
}

const int RISE_STEPS = 28;

vec3 painted(vec2 uv) {
  vec3 acc = vec3(0.0);
  float jitter = hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 61.0);
  for (int i = 0; i < RISE_STEPS; i++) {
    // Samples bunch up near the base (h = u^2), keeping the lower edge crisp.
    float u = (float(i) + jitter) / float(RISE_STEPS);
    float h = u * u;
    float s = h * uRise;
    // The curtain sways: higher parts drift sideways a little.
    vec2 base = uv - vec2(sin(uv.y * 9.0 + uTime * 0.8) * 0.006 * h, s);
    if (base.y < uHorizon) break;
    float e = sqrt(max(texture(uTrail, base).z, 0.0)); // a single quick pass still reads
    float profile = exp(-h * 3.0);
    acc += tintAt(h) * e * profile * 2.0 * u; // dh/du
  }
  // Rays: vertical streaks that drift along the curtain.
  float x = uv.x * uAspect;
  float streaks = vnoise(vec2(x * 40.0 + uTime * 0.6, 1.0)) * (0.5 + 0.5 * vnoise(vec2(x * 140.0 - uTime * 1.3, 7.0)));
  return acc * (0.25 + 1.5 * streaks) * 22.0 / float(RISE_STEPS);
}

void main() {
  if (vUv.y < uHorizon) { fragColor = vec4(0.0); return; }
  vec3 col = ambient(rayDir(vUv)) * uAmbient * 0.65 + painted(vUv) * uIntensity;
  fragColor = vec4(col, 1.0);
}
`;

// Pass 2, full resolution: sky, stars, mountains and spruce treeline, the
// aurora on top, and all of it mirrored in the lake with ripples.
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAurora;
uniform vec2 uRes;
uniform float uAspect;
uniform float uHorizon;
uniform float uTime;
uniform float uStars;
uniform float uLandscape;
out vec4 fragColor;
${NOISE}

// Spruce silhouettes along the horizon; taller toward the screen edges.
float trees(vec2 uv) {
  float X = uv.x * uAspect;
  float y = uv.y - uHorizon;
  const float W = 0.022;
  float m = 0.0;
  for (int j = -2; j <= 2; j++) {
    float ci = floor(X / W) + float(j);
    vec3 r = hash32(vec2(ci, 4.1));
    if (r.x < 0.12) continue;
    float edge = abs(uv.x - 0.5) * 2.0;
    float H = (0.02 + 0.06 * r.y * r.y) * (1.0 + 2.2 * edge * edge * edge);
    float cx = (ci + 0.5 + (r.z - 0.5) * 0.8) * W;
    float hy = clamp(y / H, 0.0, 1.0);
    // Tiers of branches: a sawtooth on the cone's width.
    float tiers = 0.7 + 0.3 * fract(hy * (5.0 + r.y * 4.0));
    float width = (1.0 - hy) * H * 0.3 * tiers + 0.0012;
    m = max(m, step(abs(X - cx), width) * step(y, H));
  }
  float brush = step(y, 0.006 + 0.006 * vnoise(vec2(X * 60.0, 0.0)));
  return max(m, brush);
}

float mountains(vec2 uv) {
  float X = uv.x * uAspect;
  return step(uv.y - uHorizon, 0.02 + 0.07 * fbm(vec2(X * 1.6 + 3.0, 0.5)) * (0.6 + 0.4 * sin(X * 0.9)));
}

vec3 sky(vec2 uv) {
  float e = clamp((uv.y - uHorizon) / (1.0 - uHorizon), 0.0, 1.0);
  vec3 col = mix(vec3(0.035, 0.07, 0.11), vec3(0.008, 0.01, 0.03), pow(e, 0.5));

  vec2 sp = uv * vec2(uAspect, 1.0) * 160.0;
  vec2 cell = floor(sp);
  float s = hash12(cell);
  float tw = 0.55 + 0.45 * sin(uTime * (1.0 + hash12(cell + 3.0) * 3.0) + s * 60.0);
  float star = step(0.993, s) * smoothstep(0.32, 0.0, length(fract(sp) - 0.5)) * tw;
  col += star * uStars * smoothstep(0.0, 0.2, e);

  vec3 a = texture(uAurora, uv).rgb;
  // Aurora light scattered in the low sky.
  vec3 haze = texture(uAurora, vec2(uv.x, uHorizon + 0.2)).rgb;
  col += a + a * a * 0.4 + haze * 0.12 * (1.0 - e);
  return col;
}

vec3 above(vec2 uv) {
  vec3 col = sky(uv);
  if (uLandscape > 0.0) {
    vec3 glow = texture(uAurora, vec2(uv.x, uHorizon + 0.15)).rgb;
    col = mix(col, vec3(0.012, 0.02, 0.035) + glow * 0.06, mountains(uv) * uLandscape);
    col = mix(col, vec3(0.004, 0.007, 0.01), trees(uv) * uLandscape);
  }
  return col;
}

void main() {
  vec2 uv = vUv;
  vec3 col;
  if (uv.y >= uHorizon) {
    col = above(uv);
  } else {
    // The lake: mirror across the horizon, with ripples that grow nearer the viewer.
    float depth = (uHorizon - uv.y) / uHorizon;
    vec2 w = vec2(uv.x * uAspect * 30.0, depth * depth * 90.0 + uTime * 0.25);
    float ripple = (vnoise(w) - 0.5) * 0.012 * (0.2 + depth);
    float streak = (vnoise(vec2(uv.x * uAspect * 3.0, depth * 140.0 - uTime * 0.2)) - 0.5) * 0.004 * depth;
    vec2 m = vec2(uv.x + ripple, 2.0 * uHorizon - uv.y + streak);
    col = above(m) * (0.55 - 0.2 * depth) + vec3(0.004, 0.008, 0.012);
  }

  vec2 c = uv - 0.5;
  col *= 1.0 - dot(c, c) * 0.5;
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.012;
  fragColor = vec4(col, 1.0);
}
`;
