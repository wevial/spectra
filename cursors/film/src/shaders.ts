import { NOISE } from '@spectra/core';
import { RINGS } from './dashes';

// Holographic "cracked ice" window film with the sun behind it. Every shard
// is a diffraction grating with its own axis and pitch d. Light through a
// shard splits along the axis by the grating equation, sin θ = mλ/d: the
// zero order stays white on the sun, the first and second orders fan out as
// spectra, red farthest. With the shards' axes random, all those spectra
// together are a sunburst of short rainbow dashes around the sun.
//
// Distances are in height units. A dash of pitch g (relative to the mean)
// puts 550 nm at uSpread·g from the sun, so its spectrum runs from
// 0.73·uSpread·g (400 nm) to 1.27·uSpread·g (700 nm): finer gratings throw
// longer dashes farther out. The sun's size smears each wavelength over
// neighbours, so a dash is integrated over a few taps of the spectrum table.
//
// Seen directly, a shard glints the wavelength its grating sends toward the
// eye; that depends on the angle between the shard's axis and the sun, so the
// mosaic's pastel tints shift as the sun moves.
export const FILM = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSpectrum; // linear sRGB by wavelength, 380..780 nm, averaging to white
uniform float uAspect;
uniform float uPx;           // device px per height unit
uniform vec2 uSun;           // height units
uniform float uPower;
uniform float uSize;         // sun radius
uniform float uSpread;
uniform float uRays;         // dash slots per ring (integer)
uniform highp sampler2D uDashes; // per slot: see dashTable()
uniform float uRingOffset[${RINGS}];
uniform float uWidth;
uniform float uLength;       // dash length, × the grating equation's
uniform float uShards;       // shards per height unit
uniform float uSheen;
uniform float uCracks;
uniform float uSeed;
uniform float uTime;
out vec4 fragColor;

${NOISE}

const float TAU = 6.28318530718;

vec3 spectrum(float nm) {
  return texture(uSpectrum, vec2((nm - 380.0) / 400.0, 0.5)).rgb;
}

/** Wavelength nm, smeared ±blur nm by the sun's size. */
vec3 smeared(float nm, float blur) {
  return (spectrum(nm - blur) + spectrum(nm) * 2.0 + spectrum(nm + blur)) * 0.25;
}

vec2 jitter(vec2 cell) {
  return 0.08 + 0.84 * hash32(cell + uSeed * 7.13).xy;
}

/**
 * Voronoi in one 3×3 pass: the nearest site and the runner-up. The border
 * is taken as their bisector, which is the nearest border nearly everywhere.
 * Returns the distance to it; id and site are the nearest cell's.
 */
float voronoi(vec2 x, out vec2 id, out vec2 site) {
  vec2 n = floor(x), f = fract(x);
  vec2 r1 = vec2(8), r2 = vec2(8), g1 = vec2(0);
  float d1 = 64.0, d2 = 64.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(i, j);
    vec2 r = g + jitter(n + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; r2 = r1; d1 = d; r1 = r; g1 = g; }
    else if (d < d2) { d2 = d; r2 = r; }
  }
  id = n + g1;
  site = x + r1;
  return dot(0.5 * (r1 + r2), normalize(r2 - r1));
}

void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 v = p - uSun;
  float r = length(v);
  float px = 1.0 / uPx;

  // ---- The film: shards, some split again by finer cracks.
  // Stretched across a slant, so shards break into slivers like the film's.
  const mat2 SLIVER = mat2(0.9, 0.75, -1.25, 1.5);
  vec2 q = SLIVER * p * uShards + uSeed * 13.7;
  vec2 id1, id2 = vec2(0), s1, s2 = vec2(0);
  float e1 = voronoi(q, id1, s1) / uShards;
  vec3 h1 = hash32(id1 + 3.7);
  bool split = h1.z < 0.5;
  float e2 = split ? voronoi(q * 2.3 + 41.0, id2, s2) / (uShards * 2.3) : 8.0;
  vec3 h = split ? hash32(id1 * 1.31 + id2 * 7.17) : h1;
  vec2 center = inverse(SLIVER) * ((split ? (s2 - 41.0) / 2.3 : s1) - uSeed * 13.7) / uShards;
  float edge = min(e1, e2);
  float crack = 1.0 - smoothstep(0.4 * px, 1.6 * px, e1);
  // Fine cracks run partway across a shard and fade out.
  if (split) crack += (1.0 - smoothstep(0.3 * px, 1.2 * px, e2)) * 0.8 * smoothstep(0.35, 0.65, vnoise(p * uShards * 3.0 + id1));

  float phi = h.x * TAU * 0.5;
  vec2 axis = vec2(cos(phi), sin(phi));
  float g = mix(0.6, 1.6, h.y);
  vec2 vc = center - uSun;
  float along = abs(dot(vc, axis));
  float across = dot(vc, vec2(-axis.y, axis.x));
  float rc = length(vc);

  // Sky through the film, lit up around the sun.
  float lit = 0.2 + 0.35 * exp(-r * 1.8) + 0.4 * exp(-r * 5.0);
  vec3 col = vec3(0.97, 0.97, 1.0) * lit;

  // Pastel sheen: each shard tinted by the wavelength its grating sends to
  // the eye. Higher orders overlap, so the hue cycles with the sun's
  // distance along the shard's axis, and shifts as the sun moves.
  float nm = 400.0 + 300.0 * fract(along / (uSpread * g * 0.35) + h.z);
  vec3 hue = spectrum(nm);
  hue /= max(max(hue.r, hue.g), max(hue.b, 1e-3));
  col *= (1.0 + 0.25 * uSheen * (hue - (hue.r + hue.g + hue.b) / 3.0)) * (0.93 + 0.14 * h.z);
  // A shard whose axis points at the sun flares in its own color.
  float aim = exp(-pow(across / (uSize + 0.05 * rc), 2.0));
  col += hue * aim * 0.3 * uSheen * uPower / (1.0 + 3.0 * rc);
  // Holographic sparkle: the embossed grating catches the light in specks.
  float speck = hash12(floor(p * uPx / 2.0) + floor(uSun * 40.0) + id1);
  col += spectrum(420.0 + 300.0 * fract(speck * 7.0 + h.z)) * pow(speck, 400.0) * (lit + 3.0 * aim) * 2.5 * uSheen;
  // Cracks scatter white.
  col += vec3(min(crack, 1.0)) * (0.06 + lit * 0.9) * uCracks;
  col *= 1.0 - 0.15 * smoothstep(2.0 * px, 0.0, edge) * uCracks; // the shard edge's shadow just inside

  // ---- The cast spectra: three rings of dash slots around the sun.
  float theta = atan(v.y, v.x);
  vec3 rays = vec3(0);
  for (int l = 0; l < ${RINGS}; l++) {
    float i0 = floor(theta / TAU * uRays - uRingOffset[l]);
    for (int k = -1; k <= 1; k++) {
      int slot = int(mod(i0 + float(k), uRays));
      vec4 a = texelFetch(uDashes, ivec2(slot, 2 * l), 0);
      if (a.w == 0.0) continue;
      float r0 = uSpread * a.y;
      if (r < r0 * (1.0 - 0.4 * uLength) || r > 2.1 * r0 * (1.0 + 0.4 * uLength)) continue;
      // Cheap reject by angle before any trig: the glow fades out by 5 widths.
      float da = theta - a.x;
      da -= TAU * round(da / TAU);
      if (abs(da) * r > 0.8 * uSize + 5.0 * (1.5 * uWidth + 0.0015 * r)) continue;
      vec4 b = texelFetch(uDashes, ivec2(slot, 2 * l + 1), 0);
      // Each shard's spectrum starts from where it sits on the window, so a
      // dash's line passes beside the sun, not through it.
      float t = r * cos(da);
      float n = r * sin(da) - a.z * 0.8 * uSize;
      float w = uWidth * b.x + 0.0015 * t;
      float x2 = n * n / (w * w);
      float body = exp(-x2) + 0.06 * exp(-x2 * 0.12);
      if (body < 0.003) continue;
      float nm = 550.0 + 550.0 * (t / r0 - 1.0) / uLength;
      float blur = min(550.0 * uSize * 0.3 / (r0 * uLength), 25.0);
      float nm2 = 550.0 + 550.0 * (0.5 * t / r0 - 1.0) / uLength; // second order, centered on 2·r0
      vec3 c = smeared(nm, blur) + 0.25 * smeared(nm2, blur * 0.5);
      float twinkle = 0.8 + 0.2 * sin(uTime * b.y + b.z);
      rays += c * body * a.w * twinkle / (0.6 + 2.5 * r0);
    }
  }
  col += rays * uPower * 2.4;

  // ---- The sun: a white patch through the film, with bloom.
  float disk = smoothstep(uSize, uSize * 0.55, r);
  col += vec3(1.0, 0.98, 0.95) * uPower * (disk * 4.0 + 1.6 * uSize * uSize / (r * r + uSize * uSize * 0.6) + 0.25 * exp(-r * 7.0));

  col = 1.0 - exp(-col * 1.15);
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
}
`;
