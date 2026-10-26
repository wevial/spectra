import { NOISE } from '@spectra/core';

// One pass after the shared cursor trail. Units are Schwarzschild radii
// (Rs = 1): the event horizon is r = 1, the photon sphere r = 1.5, and the
// accretion disk starts at the innermost stable orbit, r = 3.
//
// Rays that pass close to the hole are marched through the Schwarzschild
// photon equation (a = -1.5 h² r / |r|⁵), so the shadow, the photon ring and
// the lensed far side of the disk arching over and under the hole all fall out
// of the integration. Rays that pass far away get the weak-field deflection
// analytically. Escaping rays sample a procedural sky by direction.
export const BLACKHOLE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTrail;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uHole;       // hole center, uv
uniform float uSize;      // shadow radius, fraction of height
uniform float uTilt;      // disk inclination from edge-on, rad
uniform float uDisk;      // disk brightness
uniform float uSpin;      // disk rotation speed
uniform float uWake;      // how far the cursor trail drags the sky
uniform float uStars;
uniform float uNebula;
uniform float uExposure;
out vec4 fragColor;
${NOISE}

const float TAN_HALF_FOV = 0.5;
const float R_IN = 3.0;
const float R_OUT = 10.0;
const float B_MAX = 14.0;     // impact parameter beyond which we skip the march
const int STEPS = 160;

vec3 rayDir(vec2 p) { return normalize(vec3(p * 2.0 * TAN_HALF_FOV, -1.0)); }

// Sky by direction: haze, nebula, and three layers of stars.
vec3 sky(vec3 d, vec2 wake) {
  vec2 q = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0))) + wake;
  vec3 col = vec3(0.004, 0.003, 0.012);
  float n = fbm(q * 2.2 + vec2(0.0, uTime * 0.003));
  float n2 = fbm(q * 4.5 - 3.1);
  col += vec3(0.30, 0.10, 0.45) * pow(smoothstep(0.35, 0.95, n), 2.0) * 0.5 * uNebula;
  col += vec3(0.05, 0.25, 0.40) * pow(smoothstep(0.45, 1.0, n2), 2.0) * 0.4 * uNebula;
  for (int i = 0; i < 3; i++) {
    float scale = 60.0 + float(i) * 70.0;
    vec2 g = q * scale;
    vec2 id = floor(g);
    float h = hash12(id + float(i) * 17.0);
    if (h > 0.965) {
      vec2 off = hash32(id).xy * 0.6 + 0.2;
      float dist = length(fract(g) - off);
      float mag = pow((h - 0.965) / 0.035, 3.0);
      float tw = 0.75 + 0.25 * sin(uTime * (1.0 + h * 5.0) + h * 80.0);
      vec3 tint = mix(vec3(1.0, 0.75, 0.55), vec3(0.65, 0.8, 1.0), hash12(id * 1.7));
      col += tint * smoothstep(0.12 + mag * 0.25, 0.0, dist) * (0.35 + mag * 2.5) * tw * uStars;
    }
  }
  return col;
}

// Blackbody-ish ramp: deep red -> orange -> pale yellow -> white.
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c = mix(vec3(0.5, 0.05, 0.02), vec3(1.0, 0.35, 0.05), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.8, 0.45), smoothstep(0.3, 0.7, t));
  return mix(c, vec3(1.0, 0.97, 0.92), smoothstep(0.65, 1.0, t));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float aspect = uRes.x / uRes.y;
  vec2 uv = frag / uRes;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2 hp = vec2((uHole.x - 0.5) * aspect, uHole.y - 0.5);

  // Distance to the hole so its shadow (r ≈ 2.6 Rs) is uSize of the height.
  float D = 2.6 / (uSize * 2.0 * TAN_HALF_FOV);
  vec3 H = rayDir(hp) * D;
  vec3 dir = rayDir(p);

  vec4 tr = texture(uTrail, uv);
  vec2 wake = -tr.xy * tr.z * uWake * 0.06;

  // Disk plane: nearly edge-on, rolled a little so it isn't perfectly level.
  float roll = 0.18;
  vec3 N = normalize(vec3(-sin(roll) * cos(uTilt), cos(roll) * cos(uTilt), sin(uTilt)));
  vec3 U = normalize(cross(N, vec3(0.0, 0.0, 1.0)));
  vec3 V = cross(N, U);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  vec3 along = H - dir * dot(H, dir);
  float b = length(along);

  if (b > B_MAX) {
    // Weak field: bend toward the hole and look at the sky. Second order
    // (15π/16 b⁻²) so it meets the marched rays at B_MAX without a seam.
    float defl = 2.0 / b + 2.9452 / (b * b);
    vec3 bent = normalize(dir + normalize(along) * tan(defl));
    col = sky(bent, wake);
  } else {
    vec3 pos = -H;            // camera relative to the hole
    vec3 vel = dir;
    vec3 hv = cross(pos, vel);
    float h2 = dot(hv, hv);
    bool captured = false;
    for (int i = 0; i < STEPS; i++) {
      float r2 = dot(pos, pos);
      float r = sqrt(r2);
      if (r < 1.0) { captured = true; break; }
      if (r > D * 1.3 && dot(pos, vel) > 0.0) break;
      float dt = clamp(0.06 * r, 0.015, 1.5);
      vec3 prev = pos;
      vel += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
      pos += vel * dt;

      // Faint glow from light grazing the photon sphere.
      col += (1.0 - alpha) * vec3(1.0, 0.75, 0.5) * exp(-pow((r - 1.5) * 6.0, 2.0)) * dt * 0.06 * uDisk;

      float d0 = dot(prev, N), d1 = dot(pos, N);
      if (d0 * d1 < 0.0) {
        vec3 hit = mix(prev, pos, d0 / (d0 - d1));
        float rd = length(hit);
        if (rd > R_IN && rd < R_OUT) {
          vec2 xy = vec2(dot(hit, U), dot(hit, V));
          // Differential rotation: inner orbits are faster.
          float omega = 2.2 * pow(rd, -1.5) * uSpin;
          float a = uTime * omega;
          vec2 rot = mat2(cos(a), sin(a), -sin(a), cos(a)) * xy;
          float grain = fbm(rot * 0.55) * 0.7 + fbm(rot * 1.6 + 4.0) * 0.5;
          float edge = smoothstep(R_IN, R_IN + 0.5, rd) * smoothstep(R_OUT, R_OUT - 4.0, rd);
          // Doppler beaming: the side orbiting toward us is brighter and hotter.
          vec3 orbit = normalize(cross(N, hit));
          float v = sqrt(0.5 / rd);
          float g = 1.0 / (inversesqrt(1.0 - v * v) * (1.0 - v * dot(orbit, -normalize(vel))));
          float temp = pow(R_IN / rd, 0.9) * g;
          vec3 emit = heat(temp * 0.85) * pow(g, 3.0) * (0.35 + grain) * 2.2 * uDisk;
          float op = edge * clamp(0.35 + grain * 0.8, 0.0, 1.0);
          col += (1.0 - alpha) * emit * op;
          alpha += (1.0 - alpha) * op;
          if (alpha > 0.98) break;
        }
      }
    }
    if (!captured) col += (1.0 - alpha) * sky(normalize(vel), wake);
  }

  // Tonemap, vignette, a whisper of grain.
  col = 1.0 - exp(-col * uExposure);
  vec2 dv = uv - 0.5;
  col *= 1.0 - dot(dv, dv) * 0.6;
  col += (hash12(frag + fract(uTime) * 91.0) - 0.5) * 0.025;
  fragColor = vec4(col, 1.0);
}
`;
