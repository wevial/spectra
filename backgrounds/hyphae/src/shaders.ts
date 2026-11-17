import { NOISE, COLOR, GRAIN, RAINBOW } from '@spectra/core';
import { MAX_PATCHES, MAX_TAPS } from './params';

// The agents, their sensing and stepping, and the scent's blur and
// evaporation come from @spectra/mycelium. What's here: how the colony is
// seeded, the invisible food that stands in for the cursor, spores that
// keep landing, and a luminous render with bloom.

/** Spores in a few small discs, heading outward, so the colony blooms from several spots and fuses. */
export const AGENT_INIT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uAspect;
uniform float uSeed;
uniform int uClusters;
uniform vec4 uCluster[4];  // x, y (uv), radius (height fractions)
out vec4 fragColor;
${NOISE}
void main() {
  vec3 r = hash32(gl_FragCoord.xy + uSeed);
  int k = min(int(hash12(gl_FragCoord.yx * 1.71 + uSeed) * float(uClusters)), uClusters - 1);
  vec4 c = uCluster[k];
  float ang = r.x * 6.2831853;
  float rad = sqrt(r.y) * c.z;
  vec2 pos = fract(c.xy + vec2(cos(ang) / uAspect, sin(ang)) * rad);
  fragColor = vec4(pos, ang + (r.z - 0.5) * 0.6, 0.0);
}
`;

/**
 * Food, in .z where the mycelium step reads its cursor trail: soft nutrient
 * patches with ragged edges. The plate wraps, so distances do too.
 */
export const FOOD = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uAspect;
uniform int uCount;
uniform vec4 uPatch[${MAX_PATCHES}];  // x, y (uv), radius (height fractions), strength
uniform float uTime;
out vec4 fragColor;
${NOISE}
void main() {
  float food = 0.0;
  float rag = fbm(vUv * vec2(uAspect, 1.0) * 6.0 + uTime * 0.01) - 0.5;
  for (int i = 0; i < ${MAX_PATCHES}; i++) {
    if (i >= uCount) break;
    vec4 p = uPatch[i];
    vec2 d = vUv - p.xy;
    d -= floor(d + 0.5);
    d.x *= uAspect;
    float q = dot(d, d) / (p.z * p.z);
    food += p.w * exp(-q * (2.0 + rag * 2.5));
  }
  fragColor = vec4(0.0, 0.0, min(food, 1.5), 1.0);
}
`;

/** A few agents per frame give up and land somewhere new as spores, so fresh branches keep sprouting. */
export const SPORE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uAgents;
uniform float uChance;
uniform float uSeed;
out vec4 fragColor;
${NOISE}
void main() {
  vec4 a = texture(uAgents, vUv);
  vec3 r = hash32(gl_FragCoord.xy * 0.913 + uSeed);
  if (r.x < uChance) a = vec4(r.y, r.z, hash12(gl_FragCoord.yx + uSeed * 1.37) * 6.2831853, 0.0);
  fragColor = a;
}
`;

/** Scent dropped per agent, rich where there's food and thin where there isn't, so starved veins fade. */
export const DEPOSIT_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uFood;
uniform vec2 uCells;
uniform float uDeposit;
uniform float uBarren;
out vec4 fragColor;
void main() {
  float food = clamp(texture(uFood, gl_FragCoord.xy / uCells).z, 0.0, 1.0);
  fragColor = vec4(uDeposit * mix(uBarren, 1.0, food), 0.0, 0.0, 1.0);
}
`;

// Scent to light, shared by the bloom seed and the composite: a faint haze
// of exploring agents, glowing strands, and hot cores where veins feed.
const SHADE = /* glsl */ `
uniform sampler2D uField;
uniform sampler2D uFood;
uniform float uGain;
uniform float uAspect;
uniform float uTime;
uniform float uSpectral;
uniform vec3 uHaze;
uniform vec3 uHypha;
uniform vec3 uTip;

vec3 shade(vec2 uv) {
  float d = texture(uField, uv).r * uGain;
  float food = clamp(texture(uFood, uv).z, 0.0, 1.0);
  vec3 haze = uHaze, hypha = uHypha;
  if (uSpectral > 0.5) {
    vec3 mid, high;
    vec2 p = uv * vec2(uAspect, 1.0);
    rainbow(p.x * 2.6 + p.y * 1.7 + uTime * 0.015, mid, high);
    hypha = max(fromOklab(high), 0.0);
    haze = max(fromOklab(mid), 0.0) * 0.12;
  }
  // Faint branches stay dim and trunks carry the light.
  vec3 col = haze * smoothstep(0.02, 0.5, d) * 0.3;
  col += hypha * pow(smoothstep(0.06, 0.95, d), 1.6) * (0.4 + 0.8 * food);
  col += uTip * smoothstep(0.6, 1.3, d) * food;
  return col;
}
`;

/**
 * Bloom seed at quarter CSS resolution. Four bilinear taps a field cell
 * apart average a 4×4 block, so the strands come in filtered, not sparkling.
 */
export const SEED = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uCell;  // one field cell, uv
out vec4 fragColor;
${NOISE}
${COLOR}
${RAINBOW}
${SHADE}
void main() {
  vec3 s = shade(vUv + uCell * vec2(-1, -1)) + shade(vUv + uCell * vec2(1, -1))
         + shade(vUv + uCell * vec2(-1, 1)) + shade(vUv + uCell * vec2(1, 1));
  fragColor = vec4(min(s * 0.25, vec3(4.0)), 1.0);
}
`;

// Separable Gaussian, one axis per pass, with linear-sampling taps (see gaussianTaps()).
export const BLUR = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;
uniform int uTaps;
uniform float uOffset[${MAX_TAPS}];
uniform float uWeight[${MAX_TAPS}];
out vec4 fragColor;
void main() {
  vec3 s = texture(uSrc, vUv).rgb * uWeight[0];
  for (int i = 1; i < uTaps; i++) {
    vec2 o = uStep * uOffset[i];
    s += (texture(uSrc, vUv + o).rgb + texture(uSrc, vUv - o).rgb) * uWeight[i];
  }
  fragColor = vec4(s, 1.0);
}
`;

/** Full resolution: the network over a near-black ground, two bloom levels, a soft shoulder, film grain. */
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec2 uCell;
uniform sampler2D uHalo;
uniform sampler2D uWide;
uniform float uGlow;
uniform float uBright;
uniform vec3 uGround;
out vec4 fragColor;
${NOISE}
${COLOR}
${GRAIN}
${RAINBOW}
${SHADE}

vec3 shoulder(vec3 c) {
  float over = max(max(c.r, c.g), c.b) - 1.0;
  c += max(over, 0.0) * 0.25;
  const float k = 0.6;
  return mix(c, k + (1.0 - k) * (1.0 - exp(-(c - k) / (1.0 - k))), step(k, c));
}

void main() {
  // A touch of extra filtering: half-cell taps soften the strands' pixel noise.
  vec2 h = uCell * 0.5;
  vec3 net = (shade(vUv + vec2(-h.x, -h.y)) + shade(vUv + vec2(h.x, -h.y))
            + shade(vUv + vec2(-h.x, h.y)) + shade(vUv + vec2(h.x, h.y))) * 0.25;
  vec2 p = vUv * vec2(uAspect, 1.0);
  vec3 col = uGround * (0.75 + 0.5 * fbm(p * 3.0 + uTime * 0.004));
  col += net * uBright;
  col += (texture(uHalo, vUv).rgb * 0.3 + texture(uWide, vUv).rgb * 0.35) * uGlow * uBright;
  vec2 c = vUv - 0.5;
  col *= 1.0 - dot(c, c) * 0.5;
  fragColor = filmGrain(shoulder(col));
}
`;
