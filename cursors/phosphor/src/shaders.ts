import { NOISE } from '@spectra/core';

export const MAX_POINTS = 48;

// Persistence buffer (RGBA16F): r = fast phosphor component (the bright,
// short flash), g = slow component (the long afterglow). Each frame both
// decay at their own rates, then the beam's path this frame is added: a
// polyline of the pointer's coalesced positions, already mapped into tube
// space so it lands under the cursor after the screen's curvature.
//
// Each segment adds the Gaussian beam integrated along it (an erf across its
// length), so consecutive segments — and frames — tile the path seamlessly
// instead of double-lighting the joints. A beam that hasn't moved is a dot.
export const BEAM = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPersist;
uniform vec2 uPts[${MAX_POINTS}];
uniform int uCount;
uniform float uAspect;
uniform float uWidth;      // beam sigma, height units
uniform vec2 uDecay;       // per-frame multipliers: fast, slow
uniform float uEnergy;     // deposited at the beam's center this frame
uniform float uSlowShare;  // how much of the hit feeds the afterglow
out vec4 fragColor;

float cdf(float x) { return 1.0 / (1.0 + exp(-1.702 * x)); } // normal CDF, close enough

void main() {
  vec2 e = texture(uPersist, vUv).rg * uDecay;
  if (uCount > 0) {
    vec2 k = vec2(uAspect, 1.0);
    vec2 p = vUv * k;
    float w2 = 2.0 * uWidth * uWidth;
    float hit = 0.0;
    if (uCount == 1) {
      vec2 q = p - uPts[0] * k;
      hit = exp(-dot(q, q) / w2);
    } else {
      for (int i = 0; i < ${MAX_POINTS} - 1; i++) {
        if (i >= uCount - 1) break;
        vec2 a = uPts[i] * k;
        vec2 ab = uPts[i + 1] * k - a;
        float len = length(ab);
        if (len < 1e-7) continue;
        vec2 dir = ab / len;
        float t = dot(p - a, dir);
        vec2 q = p - a - dir * t;
        hit += exp(-dot(q, q) / w2) * (cdf((len - t) / uWidth) - cdf(-t / uWidth));
      }
    }
    e += uEnergy * hit * vec2(1.0, uSlowShare);
  }
  fragColor = vec4(e, 0.0, 1.0);
}
`;

/** Quarter-resolution copy for bloom (4 taps, so thin lines don't alias away). */
export const DOWN = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;       // source texel
out vec4 fragColor;
void main() {
  vec2 o = uTexel;
  fragColor = 0.25 * (texture(uSrc, vUv + vec2(-o.x, -o.y)) + texture(uSrc, vUv + vec2(o.x, -o.y))
                    + texture(uSrc, vUv + vec2(-o.x, o.y)) + texture(uSrc, vUv + vec2(o.x, o.y)));
}
`;

/** Separable 9-tap Gaussian. */
export const BLUR = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uStep;        // texel * direction
out vec4 fragColor;
void main() {
  const float W[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec4 c = texture(uSrc, vUv) * W[0];
  for (int i = 1; i < 5; i++) {
    c += texture(uSrc, vUv + uStep * float(i) * 1.5) * W[i];
    c += texture(uSrc, vUv - uStep * float(i) * 1.5) * W[i];
  }
  fragColor = c;
}
`;

/** The tube: curved glass, graticule, phosphor light with bloom, scanlines, bezel. */
export const CRT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPersist;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uAspect;
uniform float uCurve;
uniform float uScan;
uniform float uGraticule;
uniform float uBloomAmt;
uniform float uExposure;
uniform float uTime;
uniform float uDpr;
uniform vec3 uFast;
uniform vec3 uSlow;
out vec4 fragColor;
${NOISE}

vec2 tube(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + uCurve * dot(c, c);
  return c * 0.5 + 0.5;
}

void main() {
  vec2 q = tube(vUv);
  // Bezel: rounded edge of the curved glass.
  vec2 edge = abs(q * 2.0 - 1.0);
  float inside = smoothstep(1.0, 0.985, max(edge.x, edge.y));
  if (inside <= 0.0) { fragColor = vec4(vec3(0.01), 1.0); return; }

  vec2 e = texture(uPersist, q).rg;
  vec2 b = texture(uBloom, q).rg;
  vec3 light = uFast * e.r + uSlow * e.g + (uFast * b.r + uSlow * b.g) * uBloomAmt;

  // Graticule: 10 × 8 divisions with minor ticks on the center lines.
  vec2 g = q * vec2(10.0, 8.0);
  vec2 gd = abs(fract(g + 0.5) - 0.5) / fwidth(g);
  float line = 1.0 - min(min(gd.x, gd.y), 1.0);
  vec2 t = q * vec2(50.0, 40.0);
  vec2 td = abs(fract(t + 0.5) - 0.5) / fwidth(t);
  vec2 center = abs(q - 0.5) * vec2(10.0, 8.0);
  float tick = (1.0 - min(td.x, 1.0)) * step(center.y, 0.12) + (1.0 - min(td.y, 1.0)) * step(center.x, 0.12);
  float grat = max(line * 0.6, tick * 0.5) * uGraticule;

  // Unlit phosphor is a dark grey-green; light saturates toward white.
  vec3 col = vec3(0.018, 0.024, 0.022) + vec3(0.05, 0.075, 0.07) * grat;
  col += 1.0 - exp(-light * uExposure);

  // Raster lines (a vector scope has none; set uScan for a TV look).
  float rows = uRes.y / (3.0 * uDpr);
  col *= 1.0 - uScan * 0.5 * (0.5 + 0.5 * cos(q.y * rows * 6.2831853));

  // Glass: vignette, a soft reflection, faint flicker and noise.
  vec2 c = q - 0.5;
  col *= 1.0 - dot(c, c) * 0.9;
  col += vec3(0.03, 0.035, 0.04) * smoothstep(0.5, 0.0, length((vUv - vec2(0.28, 0.82)) * vec2(1.0, 1.6)));
  col *= 0.985 + 0.015 * sin(uTime * 120.0);
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.02;
  fragColor = vec4(col * inside, 1.0);
}
`;
