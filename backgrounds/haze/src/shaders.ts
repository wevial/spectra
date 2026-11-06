import { NOISE } from '@spectra/core';

// Pass 1, half resolution: coverage of the two smoke bands in r and g, and
// the smoke noise in b (the rainbow palette bends its hues along it).
//
// Ported from the AgentMail console header, which is a `shaders` (three.js)
// stack: two soft sine-wave bands (SineWave) under a sine displacement
// (WaveDistortion, mirrored at the edges). On top of that displacement this
// adds domain-warped fbm, scaled by uWarp, so the bands billow like smoke
// instead of only bending.
//
// Lengths are in "units": the box height, capped at a quarter of its longer
// side so a full screen doesn't become one enormous band. A short wide header
// therefore matches the original's proportions.
export const GLOW = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uBox;      // box size in units
uniform float uTime;
uniform float uWarp;    // smokiness
uniform vec2 uSeed;     // noise domain offset
uniform vec3 uPhase;    // phase offsets: band a, band b, distortion
out vec4 fragColor;
${NOISE}

const float TAU = 6.28318530718;

// SineWave: a band of width 'thick' along a sine, rotated by 'deg', with
// smoothstep edges 'soft' wide. p and pos in units, origin bottom-left.
float band(vec2 p, vec2 pos, float deg, float amp, float freq, float speed, float thick, float soft, float phase) {
  vec2 a = p - pos;
  float r = radians(deg);
  float c = cos(r), s = sin(r);
  float along = a.x * c - a.y * s;
  float across = a.x * s + a.y * c;
  float h = sin(along * freq * TAU + uTime * speed + phase) * amp;
  float m = thick * 0.5, f = soft * 0.5;
  return 1.0 - smoothstep(m - f, m + f, abs(across - h));
}

vec2 mirror(vec2 x) {
  return 1.0 - abs(mod(x, 2.0) - 1.0);
}

void main() {
  vec2 q = (vUv - 0.5) * uBox;

  // WaveDistortion: displace along 140deg by a sine running across it.
  const float D = radians(140.0);
  float ph = (dot(q, vec2(sin(D), cos(D))) + 0.5) * 1.5 * TAU + uTime * 0.1 + uPhase.z;
  vec2 disp = vec2(cos(D), sin(D)) * sin(ph) * 0.2;

  // Smoke: fbm warped by fbm, drifting slowly so the bands morph.
  vec2 n = q * 1.3 + uSeed;
  float t = uTime;
  vec2 w = vec2(fbm(n + vec2(0.0, 0.021 * t)), fbm(n + vec2(5.2, 1.3) - vec2(0.017 * t, 0.0)));
  w = vec2(fbm(n + 2.0 * w + vec2(1.7, 9.2) + 0.012 * t), fbm(n + 2.0 * w + vec2(8.3, 2.8) - 0.01 * t));
  disp += (w - 0.47) * uWarp * 0.7;

  vec2 p = mirror(vUv + disp / uBox) * uBox;
  float a = band(p, vec2(0.35, 0.6) * uBox, 68.0, 0.5, 0.32, 0.25, 0.9, 0.45, uPhase.x);
  float b = band(p, vec2(0.7, 0.38) * uBox, 152.0, 0.26, 0.5, 0.4, 0.55, 0.6, uPhase.y);
  fragColor = vec4(a, b, w.x - 0.47, 1.0);
}
`;

// Pass 2, full resolution: band b then band a laid over the base in Oklab,
// eased edge fades back toward the base, a slight vignette, then film grain
// in linear light, weighted toward the darks, crossfading slowly between
// patterns.
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uGlow;
uniform vec3 uBase;         // sRGB
uniform vec3 uMid;
uniform vec3 uHigh;
uniform float uIntensity;
uniform float uReveal;      // mount fade-in, 0..1
uniform float uFadeBottom;  // fraction of height
uniform float uFadeSide;    // -1..1: sign picks the side, size the strength at that edge
uniform float uGrain;
uniform vec2 uGrainSeeds;   // the two grain patterns being crossfaded
uniform float uGrainMix;    // 0..1 from the first to the second
uniform float uRainbow;     // 1: band colors from a drifting hue instead of uMid/uHigh
uniform float uHue;         // rainbow hue drift, radians
out vec4 fragColor;
${NOISE}

vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 toOklab(vec3 c) {
  vec3 lms = pow(vec3(
    dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
    dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
    dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005))), vec3(1.0 / 3.0));
  return vec3(
    dot(lms, vec3(0.2104542553, 0.7936177850, -0.0040720468)),
    dot(lms, vec3(1.9779984951, -2.4285922050, 0.4505937099)),
    dot(lms, vec3(0.0259040371, 0.7827717662, -0.8086757660)));
}
vec3 fromOklab(vec3 c) {
  vec3 lms = vec3(
    dot(c, vec3(1.0, 0.3963377774, 0.2158037573)),
    dot(c, vec3(1.0, -0.1055613458, -0.0638541728)),
    dot(c, vec3(1.0, -0.0894841775, -1.2914855480)));
  lms = lms * lms * lms;
  return vec3(
    dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
    dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
    dot(lms, vec3(-0.0041960863, -0.7034186147, 1.7076147010)));
}

void main() {
  vec2 uv = vUv;
  vec3 glow = texture(uGlow, uv).rgb;
  vec2 g = clamp(glow.rg * uIntensity * uReveal, 0.0, 1.0);

  vec3 base = toOklab(toLinear(uBase));
  vec3 mid = toOklab(toLinear(uMid));
  vec3 high = toOklab(toLinear(uHigh));
  if (uRainbow > 0.5) {
    // Oklch hues sweeping diagonally across the box, drifting, and bent by
    // the smoke so color runs along the wisps. The back band trails by ~75deg.
    float h = uHue + dot(uv, vec2(0.8, 0.45)) * 3.5 + glow.b * 1.4;
    high = vec3(0.74, 0.17 * cos(h), 0.17 * sin(h));
    mid = vec3(0.6, 0.16 * cos(h + 1.3), 0.16 * sin(h + 1.3));
  }
  vec3 lab = mix(base, mid, g.y);
  lab = mix(lab, high, g.x);

  // Eased fades back to the base, shaped like the original's DOM scrims.
  float keep = 1.0;
  if (uFadeBottom > 0.0) keep *= 1.0 - pow(1.0 - clamp(uv.y / uFadeBottom, 0.0, 1.0), 3.5);
  float side = uFadeSide < 0.0 ? uv.x : 1.0 - uv.x;
  keep *= 1.0 - abs(uFadeSide) * pow(1.0 - side, 1.6);
  vec3 col = fromOklab(mix(base, lab, keep));

  vec2 c = uv - 0.5;
  col *= 1.0 - dot(c, c) * 0.25;

  // Two grain patterns crossfaded; dividing by the blend's spread keeps the
  // grain equally strong mid-fade instead of dimming.
  float n0 = hash12(gl_FragCoord.xy + uGrainSeeds.x * vec2(419.3, 257.1)) * 2.0 - 1.0;
  float n1 = hash12(gl_FragCoord.xy + uGrainSeeds.y * vec2(419.3, 257.1)) * 2.0 - 1.0;
  float k = smoothstep(0.0, 1.0, uGrainMix);
  float n = mix(n0, n1, k) / sqrt(k * k + (1.0 - k) * (1.0 - k));
  float l = clamp(dot(col, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  col += n * (1.0 - l) * (1.0 - l) * uGrain * 0.1;

  // Static sub-LSB dither, so dark gradients don't band with grain off.
  fragColor = vec4(toSrgb(col) + (hash12(gl_FragCoord.xy + 71.0) - 0.5) / 255.0, 1.0);
}
`;
