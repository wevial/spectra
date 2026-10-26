import { NOISE } from '@spectra/core';

// One pass after the shared cursor trail: a ringed planet over a starfield,
// computed per dither cell and quantized with an 8x8 Bayer matrix into a
// four-stop palette. The trail adds light where the cursor passed and
// coarsens the cells there into chunky pixels.
export const DITHER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTrail;
uniform vec2 uRes;        // drawing buffer, px
uniform float uTime;
uniform float uPixel;     // base cell size, px
uniform float uChunk;     // extra cell sizes the trail can add
uniform float uGlow;      // light the trail paints in
uniform float uLevels;    // tones before dithering (2 = 1-bit)
uniform float uContrast;
uniform vec3 uLight;      // light direction, view space
uniform vec3 uPalette[4]; // dark -> light
out vec4 fragColor;
${NOISE}

// Ordered dither threshold in [0, 1) from an integer cell coordinate.
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

vec3 palette(float q) {
  q = clamp(q, 0.0, 1.0) * 3.0;
  vec3 a = q < 1.0 ? uPalette[0] : q < 2.0 ? uPalette[1] : uPalette[2];
  vec3 b = q < 1.0 ? uPalette[1] : q < 2.0 ? uPalette[2] : uPalette[3];
  return mix(a, b, fract(min(q, 2.999)));
}

const float R = 0.27;               // planet radius, height units
const float TILT = 0.38;            // ring plane: screen rotation (rad)
const float RING_SQUASH = 0.26;     // ring ellipse minor/major

// Scene luminance at p (centered, height-normalized).
float scene(vec2 p, float t) {
  // Space: faint haze and a sparse, twinkling starfield.
  float lum = smoothstep(0.45, 0.85, fbm(p * 1.6 + vec2(t * 0.01, 0.0))) * 0.22;
  vec2 cell = floor(p * 90.0);
  float star = step(0.985, hash12(cell));
  float tw = 0.6 + 0.4 * sin(t * (1.0 + hash12(cell + 7.0) * 3.0) + hash12(cell) * 40.0);
  lum += star * tw * smoothstep(0.5, 0.0, length(fract(p * 90.0) - 0.5)) * 0.9;

  // Ring coordinates: rotate into the ring plane, unsquash the ellipse.
  vec2 rp = mat2(cos(TILT), sin(TILT), -sin(TILT), cos(TILT)) * p;
  float rr = length(vec2(rp.x, rp.y / RING_SQUASH)) / R;
  float ringBand = smoothstep(1.3, 1.36, rr) * smoothstep(2.15, 2.05, rr);
  float ringDensity = (0.55 + 0.45 * vnoise(vec2(rr * 18.0, 0.0))) * (1.0 - smoothstep(1.62, 1.66, rr) * smoothstep(1.74, 1.7, rr));
  float ringLit = 0.25 + 0.55 * clamp(0.5 + 0.5 * uLight.x * sign(rp.x) + 0.3 * uLight.y, 0.0, 1.0);
  float ring = ringBand * ringDensity * ringLit;
  bool ringFront = rp.y < 0.0;

  float r = length(p) / R;
  if (r < 1.0) {
    vec3 n = vec3(p / R, sqrt(1.0 - r * r));
    // Surface in the planet's own frame (spin axis tilted with the ring).
    vec2 sp = mat2(cos(TILT), sin(TILT), -sin(TILT), cos(TILT)) * n.xy;
    float lat = asin(clamp(sp.y, -1.0, 1.0));
    float lon = atan(sp.x, n.z) + t * 0.15;
    float bands = 0.6 + 0.22 * sin(lat * 13.0 + fbm(vec2(lon * 1.5, lat * 5.0)) * 4.0);
    float storm = smoothstep(0.22, 0.0, length(vec2(sin(lon - 0.8) * 1.4, lat + 0.35)));
    float albedo = bands + storm * 0.25;
    float diffuse = max(dot(n, uLight), 0.0);
    float atmo = pow(1.0 - n.z, 3.0) * clamp(dot(n, uLight) + 0.35, 0.0, 1.0) * 0.6;
    float planet = albedo * diffuse + atmo + 0.03;
    lum =ringFront ? mix(planet, ring, ringBand * ringDensity) : planet;
  } else {
    lum = max(lum, ring);
  }
  return lum;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  // Trail energy at the base cell, then grow the cell with it.
  vec2 baseCell = (floor(frag / uPixel) + 0.5) * uPixel;
  float e = texture(uTrail, baseCell / uRes).z;
  float size = uPixel * (1.0 + floor(e * uChunk + 0.35));
  vec2 cellId = floor(frag / size);
  vec2 center = (cellId + 0.5) * size;

  vec2 uv = center / uRes;
  vec2 p = vec2((uv.x - 0.5) * uRes.x / uRes.y, uv.y - 0.5);
  float lum = scene(p, uTime) + e * uGlow;
  lum = clamp((lum - 0.5) * uContrast + 0.5, 0.0, 1.0);

  float steps = max(uLevels - 1.0, 1.0);
  float q = floor(lum * steps + bayer8(cellId)) / steps;
  fragColor = vec4(palette(q), 1.0);
}
`;
