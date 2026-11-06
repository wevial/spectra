import { NOISE, COLOR, SMOKE, GRAIN, RAINBOW } from '@spectra/core';

// Pass 1, half resolution: where the haze is lit in r, the haze in g, and
// its noise in b (the rainbow palette bends its hues along it).
//
// Lengths are in units of the box height, x scaled by the aspect.
//
// The haze is haze's smoke noise. The cursor trail (core's Trail: xy
// direction, z energy) acts on it twice:
// - Push: the noise is read from behind along the stroke, so the haze is
//   shoved forward, and it settles back as the trail fades.
// - Light: the trail is read through two displacements. Older strokes have
//   drifted, so the lookup steps back along the stroke and across the noise,
//   further the more they've faded: the light travels and curls as it dies.
//   Then it's smeared along the stroke's direction, so straight fast strokes
//   stretch. The haze is lit where that lands, its filaments (the noise's
//   ridges) most, so a stroke shows the shape of the smoke it passed through.
export const HAZE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTrail;
uniform float uAspect;    // width / height
uniform float uTime;
uniform float uStretch;   // how far a stroke smears along its direction
uniform float uAmbient;   // haze brightness
uniform float uStir;      // how much the trail pushes and lights the haze
out vec4 fragColor;
${NOISE}
${SMOKE}

void main() {
  vec2 k = vec2(uAspect, 1.0);
  vec3 here = texture(uTrail, vUv).xyz;
  vec2 w = smoke((vUv * k - here.xy * here.z * 0.6 * uStir) * 2.4, uTime);

  vec2 dir = here.xy;
  float age = 1.0 - smoothstep(0.0, 0.45, here.z);
  vec2 from = vUv - (w * 0.22 + dir * 0.05 * uStretch) * age / k;
  vec2 along = dir * (0.012 + 0.05 * uStretch * here.z) / k;
  float e = 0.0;
  for (int i = -3; i <= 3; i++) {
    float f = float(i);
    e += texture(uTrail, from + along * f).z * (4.0 - abs(f));
  }
  e /= 16.0;

  float haze = smoothstep(-0.3, 0.35, w.x + w.y * 0.6);
  float ridge = 1.0 - smoothstep(0.0, 0.16, abs(w.x + w.y * 0.5));
  // Slow strokes lay down little energy, so lift the lows.
  float lit = haze * haze * (0.3 + 1.4 * ridge) * (1.0 - exp(-e * 5.0)) * uStir;
  fragColor = vec4(lit * 1.3, haze * uAmbient + lit * 0.8, w.x, 1.0);
}
`;

// Pass 2, full resolution: haze (mid) then light (high) over the base in
// Oklab (for the rainbow palette, a drifting hue sweep bent by the haze, as
// haze's), the brightest light pushed a little past the palette toward
// white-hot, a slight vignette, then GRAIN from @spectra/core.
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uLight;
uniform vec3 uBase;         // sRGB
uniform vec3 uMid;
uniform vec3 uHigh;
uniform float uIntensity;
uniform float uRainbow;     // 1: colors from a drifting hue instead of uMid/uHigh
uniform float uHue;         // rainbow hue drift, radians
out vec4 fragColor;
${NOISE}
${COLOR}
${GRAIN}
${RAINBOW}

void main() {
  vec3 light = texture(uLight, vUv).rgb;
  vec2 g = light.rg * uIntensity;

  vec3 base = toOklab(toLinear(uBase));
  vec3 mid = toOklab(toLinear(uMid));
  vec3 high = toOklab(toLinear(uHigh));
  if (uRainbow > 0.5) rainbow(uHue + dot(vUv, vec2(0.8, 0.45)) * 3.5 + light.b * 1.4, mid, high);
  vec3 hot = vec3(min(high.x + 0.14, 0.97), high.yz * 0.7);

  vec3 lab = mix(base, mid, clamp(g.y, 0.0, 1.0));
  lab = mix(lab, high, clamp(g.x, 0.0, 1.0));
  lab = mix(lab, hot, smoothstep(0.75, 1.6, g.x) * 0.6);
  vec3 col = fromOklab(lab);

  vec2 c = vUv - 0.5;
  col *= 1.0 - dot(c, c) * 0.25;

  fragColor = filmGrain(col);
}
`;
