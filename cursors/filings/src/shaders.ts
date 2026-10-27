import { NOISE } from '@spectra/core';

// One filing per grid cell (some cells empty). State texture, one texel per
// cell (RGBA16F): xy = offset from the cell center (cells), z = angle (0..π,
// filings have no head or tail).
//
// Magnets are bar magnets under the paper: a + pole and a − pole, each a 2D
// point source (field ∝ 1/r). Up to MAGNETS at once; uMag[i] = (x, y, angle,
// strength) in cells, strength 0 = unused.
const FIELD = /* glsl */ `
const int MAGNETS = 8;
uniform vec4 uMag[MAGNETS];
uniform float uGap;        // pole separation, cells

vec2 field(vec2 p) {
  vec2 B = vec2(0.0);
  for (int i = 0; i < MAGNETS; i++) {
    vec4 m = uMag[i];
    if (m.w <= 0.0) continue;
    vec2 d = vec2(cos(m.z), sin(m.z)) * uGap * 0.5;
    vec2 r1 = p - (m.xy + d);
    vec2 r2 = p - (m.xy - d);
    B += m.w * (r1 / (dot(r1, r1) + 1.0) - r2 / (dot(r2, r2) + 1.0));
  }
  return B;
}
`;

/** Freshly scattered: random angles, centered. */
export const INIT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uSeed;
out vec4 fragColor;
${NOISE}
void main() {
  vec3 r = hash32(gl_FragCoord.xy + uSeed);
  fragColor = vec4((r.xy - 0.5) * 0.8, r.z * 3.14159265, 1.0);
}
`;

/**
 * Filings turn toward the field only once it beats friction, so weak fields
 * leave them where they were — lines stay imprinted after the magnet moves
 * on. Strong fields also drag them a little toward the poles (soft iron is
 * pulled up the gradient of |B|²), clumping them along the lines.
 */
export const UPDATE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform float uDt;
uniform float uFriction;
uniform float uSpin;
uniform float uPull;
out vec4 fragColor;
${FIELD}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uState, c, 0);
  vec2 p = vec2(c) + 0.5 + s.xy;
  vec2 B = field(p);
  float m = length(B);
  float k = 1.0 - exp(-uDt * uSpin * max(m - uFriction, 0.0) / uFriction);
  if (k <= 0.0) { fragColor = s; return; } // also keeps atan(0, 0) out

  // Axial: turn the short way, to whichever end of the field line is nearer.
  float d = atan(B.y, B.x) - s.z;
  d -= 3.14159265 * floor(d / 3.14159265 + 0.5);
  s.z = mod(s.z + d * k, 3.14159265);

  vec2 e = vec2(0.5, 0.0);
  vec2 g = vec2(dot(field(p + e.xy), field(p + e.xy)) - dot(field(p - e.xy), field(p - e.xy)),
                dot(field(p + e.yx), field(p + e.yx)) - dot(field(p - e.yx), field(p - e.yx)));
  float gl = length(g);
  if (gl > 1e-6) s.xy += g / gl * min(gl * uPull, 0.04) * k;
  s.xy = clamp(s.xy, vec2(-0.45), vec2(0.45));
  fragColor = s;
}
`;

/** Paper, each filing as a thin rounded needle with a drop shadow and a metal glint. */
export const RENDER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uState;
uniform vec2 uCells;
uniform float uCellPx;     // device px per cell
uniform float uDensity;
uniform float uLength;     // filing length, cells
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uShadow;
uniform float uHint;       // how visible the magnets are through the paper
out vec4 fragColor;
${NOISE}
${FIELD}

float segment(vec2 q, vec2 dir, float halfLen) {
  float t = clamp(dot(q, dir), -halfLen, halfLen);
  return length(q - dir * t);
}

void main() {
  vec2 pc = gl_FragCoord.xy / uCellPx;
  ivec2 base = ivec2(floor(pc));
  float aa = 1.0 / uCellPx;

  float ink = 0.0, shade = 0.0, glint = 0.0;
  for (int y = -2; y <= 2; y++)
  for (int x = -2; x <= 2; x++) {
    ivec2 c = base + ivec2(x, y);
    if (c.x < 0 || c.y < 0 || c.x >= int(uCells.x) || c.y >= int(uCells.y)) continue;
    vec3 h = hash32(vec2(c));
    if (h.x > uDensity) continue;
    vec4 s = texelFetch(uState, c, 0);
    vec2 ctr = vec2(c) + 0.5 + s.xy;
    vec2 dir = vec2(cos(s.z), sin(s.z));
    float halfLen = uLength * (0.35 + 0.65 * h.y) * 0.5;
    float w = 0.11 * (0.7 + 0.6 * h.z);

    float cover = smoothstep(w + aa, w - aa, segment(pc - ctr, dir, halfLen));
    // Light from the upper left: shadows fall down and to the right.
    float sh = smoothstep(w + 0.3, w - 0.05, segment(pc - ctr - vec2(0.16, -0.2), dir, halfLen));
    shade = max(shade, sh);
    if (cover > ink) {
      ink = cover;
      glint = pow(abs(dot(dir, vec2(0.7071, 0.7071))), 12.0) * (0.4 + 0.6 * h.z);
    }
  }

  // Paper with fibers; the magnets show faintly through it.
  vec2 px = gl_FragCoord.xy;
  vec3 col = uPaper * (0.97 + 0.03 * vnoise(px * 0.15) + 0.025 * (vnoise(px * vec2(0.02, 0.4)) - 0.5));
  float under = 0.0;
  for (int i = 0; i < MAGNETS; i++) {
    vec4 m = uMag[i];
    if (m.w <= 0.0) continue;
    vec2 q = pc - m.xy;
    q = mat2(cos(m.z), -sin(m.z), sin(m.z), cos(m.z)) * q;
    vec2 halfSize = vec2(uGap * 0.62, uGap * 0.16);
    float d = length(max(abs(q) - halfSize, 0.0)) - uGap * 0.06;
    under = max(under, smoothstep(uGap * 0.25, -uGap * 0.05, d));
  }
  col *= 1.0 - under * uHint * 0.07;
  col *= 1.0 - shade * uShadow;
  vec3 metal = mix(uInk, vec3(0.78, 0.8, 0.86), glint);
  col = mix(col, metal, ink);

  vec2 v = vUv - 0.5;
  col *= 1.0 - dot(v, v) * 0.35;
  fragColor = vec4(col, 1.0);
}
`;
