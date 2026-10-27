import { NOISE } from '@spectra/core';

// One pass: separate the content into up to three spot inks, screen each as a
// grainy halftone at its own angle, and overprint them on paper. Each ink
// samples the content at its own offset (misregistration); the cursor trail
// pushes the layers apart along its direction.
//
// Separation is a least-squares fit in optical density: a color's density
// (-log of its linear value relative to the paper) is approximated as a sum of
// the inks' densities, weighted by how much of each ink is laid down. The
// solve is a fixed matrix per ink set (uSep), computed on the CPU.
export const RISO = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uTrail;
uniform vec4 uFit;         // content uv = screen uv * uFit.xy + uFit.zw
uniform vec2 uRes;         // px
uniform float uDot;        // halftone cell, px
uniform float uDpr;
uniform vec3 uPaper;       // linear
uniform vec3 uInk[3];      // linear transmittance of each ink
uniform vec3 uSep[3];      // rows: ink amount = dot(row, density)
uniform vec2 uOffset[3];   // resting misregistration, px
uniform float uSpread[3];  // how each layer responds to the cursor push
uniform float uInks;
uniform float uPush;       // px
uniform float uGrain;
uniform float uContrast;
uniform float uTime;
out vec4 fragColor;
${NOISE}

const float ANGLES[3] = float[3](0.2618, 1.309, 0.7854); // 15°, 75°, 45°

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

vec3 density(vec2 px) {
  vec3 c = texture(uSource, (px / uRes) * uFit.xy + uFit.zw).rgb;
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  return max(-log(max(toLinear(c), vec3(0.004)) / uPaper), 0.0);
}

// Euclidean spot function: round dots that join into a checker at 50%.
float spot(vec2 px, float angle) {
  float s = sin(angle), c = cos(angle);
  vec2 q = mat2(c, s, -s, c) * px / uDot;
  vec2 f = q * 6.2831853;
  return 1.0 - (cos(f.x) + cos(f.y) + 2.0) * 0.25;
}

void main() {
  vec2 px = vUv * uRes;
  vec4 trail = texture(uTrail, vUv);
  // The trail's direction fades in with its energy; take the heading alone,
  // scaled by sqrt(energy) so a single quick pass still separates the layers.
  float len = length(trail.xy);
  vec2 push = len > 1e-3 ? trail.xy / len * sqrt(trail.z) * uPush : vec2(0.0);

  // Paper: warm stock with fibers and flecks.
  vec3 col = uPaper * (0.965 + 0.035 * vnoise(px / uDpr * 0.35) + 0.02 * (vnoise(px / uDpr * vec2(0.08, 1.2)) - 0.5));
  col *= 1.0 - step(0.9985, hash12(floor(px / uDpr / 2.0) + 3.1)) * 0.25;

  for (int i = 0; i < 3; i++) {
    if (float(i) >= uInks) break;
    vec2 off = uOffset[i] + push * uSpread[i];
    float amount = clamp(dot(uSep[i], density(px - off)), 0.0, 1.0);

    // Grain: the drum lays ink unevenly — fine speckle, mid-scale mottling,
    // and slow starvation bands across the sheet.
    float fi = float(i);
    float speck = hash12(floor(px / uDpr) + fi * 17.0);
    float mottle = vnoise(px / uDpr * 0.12 + fi * 31.0);
    float t = spot(px - off, ANGLES[i]) + (speck - 0.5) * 0.35 * uGrain + (mottle - 0.5) * 0.25 * uGrain;
    float aa = max(fwidth(t), 0.02);
    float cover = smoothstep(t - aa, t + aa, amount);
    cover *= 1.0 - step(1.0 - 0.02 * uGrain, speck) * 0.8;
    float starve = 1.0 - uGrain * 0.18 * smoothstep(0.35, 0.85, fbm(vec2(px.y / uRes.y * 3.0 + fi * 5.0, fi)));

    // Overprint: inks multiply.
    col *= mix(vec3(1.0), uInk[i], cover * starve * 0.94);
  }

  fragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;
