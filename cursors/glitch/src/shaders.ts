import { NOISE } from '@spectra/core';

// GLSL for the glitch cursor. After the shared cursor trail (@spectra/core):
//   SCENE     — procedural retro still life: dark room, rainbow light leak,
//               thin-film bubble, and a drifting tiled headline
//   COMPOSITE — scene sampled through the pixelated trail (blocky displacement
//               + RGB split), then film grain and vignette in screen space

export const SCENE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uText;
uniform float uTime;
uniform float uAspect;
uniform float uLine;      // headline row height, uv-y units
uniform float uDrift;     // headline scroll speed, rows per second
uniform float uTextAmt;   // headline opacity
uniform float uHue;       // spectrum rotation
uniform float uLeak;      // light-leak intensity
out vec4 fragColor;
${NOISE}

const float TAU = 6.2831853;

// Cosine spectrum: red -> yellow -> green -> cyan -> blue -> magenta.
vec3 spectrum(float t) {
  return clamp(0.5 + 0.5 * cos(TAU * (t + uHue + vec3(0.0, -0.333, -0.667))), 0.0, 1.0);
}

// Overlay blend of a black fill: darks crush to black, brights survive
// (2b - 1), so the bubble and the leak glow through the letters.
vec3 overlayBlack(vec3 base) {
  return max(2.0 * base - 1.0, 0.0);
}

// The room behind everything: walls, desk light, a monitor of scrolling
// code on the right, and the prism light leak on the left. p is centered,
// height-normalized; uv is the matching 0..1 screen coordinate.
vec3 room(vec2 p, vec2 uv, float t) {
  vec3 col = mix(vec3(0.14, 0.065, 0.08), vec3(0.34, 0.19, 0.23), smoothstep(0.0, 0.9, uv.y));
  col += vec3(0.10, 0.07, 0.17) * smoothstep(0.4, 1.0, uv.x) * smoothstep(0.15, 0.8, uv.y);
  col *= 0.85 + 0.3 * fbm(p * 2.2 + vec2(0.0, t * 0.02));                    // haze

  // Desk: warm bounce light, a bright front edge, and streaks of key light.
  float desk = smoothstep(0.30, 0.18, uv.y);
  col = mix(col, vec3(0.32, 0.11, 0.08), desk * 0.8);
  col += vec3(1.0, 0.45, 0.2) * exp(-abs(uv.y - 0.205) * 140.0) * 0.35;
  float streak = smoothstep(0.55, 0.85, vnoise(vec2(p.x * 2.5, uv.y * 55.0)));
  col += vec3(1.0, 0.5, 0.25) * streak * desk * 0.22 * smoothstep(0.9, 0.2, abs(p.x) / uAspect);

  // Monitor: a dim teal screen with rows of code-like dashes, scrolling.
  vec2 m = (uv - vec2(0.84, 0.66)) / vec2(0.2, 0.27);
  float screen = smoothstep(1.0, 0.94, max(abs(m.x), abs(m.y)));
  if (screen > 0.0) {
    float rows = 54.0;
    float ry = uv.y * rows + t * 0.6;
    float row = floor(ry);
    float indent = floor(hash12(vec2(row, 3.1)) * 4.0) * 0.035;
    float len = 0.15 + hash12(vec2(row, 7.7)) * 0.7;
    float sx = (m.x * 0.5 + 0.5) - indent;
    float dash = step(0.35, hash12(vec2(floor(sx * 110.0), row))) * step(0.0, sx) * step(sx, len);
    float glyph = dash * smoothstep(0.3, 0.15, abs(fract(ry) - 0.5)) * step(0.2, hash12(vec2(row, 1.3)));
    vec3 glass = vec3(0.08, 0.07, 0.12) + vec3(0.25, 0.85, 0.75) * glyph * 0.3;
    glass += vec3(0.1, 0.3, 0.3) * 0.08 * (1.0 - length(m) * 0.6);
    col = mix(col, glass, screen * 0.75);
  }

  // Prism light leak: a broad band on the left running red -> yellow ->
  // green -> cyan from its outer edge in, breathing and sliding a little.
  float leakX = -0.36 * uAspect + 0.035 * sin(t * 0.21) + 0.06 * (uv.y - 0.5);
  float w = 0.16 + 0.02 * sin(t * 0.33);
  float across = (p.x - leakX) / w;
  float env = smoothstep(-1.5, -0.55, across) * smoothstep(1.6, 0.35, across);
  float fall = smoothstep(-0.1, 0.8, uv.y) * 0.8 + 0.2;
  col += spectrum(0.0 + clamp(across * 0.5 + 0.5, 0.0, 1.0) * 0.55) * env * fall * 1.1 * uLeak;
  col += vec3(1.0, 0.3, 0.15) * exp(-abs(across + 0.4) * 1.2) * 0.12 * fall * uLeak; // halation
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5); // height-normalized, centered
  float t = uTime;
  vec3 col = room(p, uv, t);

  // --- Thin-film bubble: glassy and mostly clear, warm core, iridescent rim.
  vec2 c = vec2(0.03 * sin(t * 0.17), 0.05 + 0.012 * sin(t * 0.5));
  float R = 0.3;
  vec2 q = (p - c) / R;
  float r = length(q);
  col += vec3(0.6, 0.25, 0.12) * exp(-max(r - 1.0, 0.0) * 5.0) * 0.28;       // bloom
  if (r < 1.0) {
    float nz = sqrt(1.0 - r * r);
    float fres = pow(1.0 - nz, 1.6);
    // What you see through it: the room, shrunk and pulled toward the center.
    vec2 rp = c + (p - c) * (0.45 + 0.3 * nz);
    vec3 behind = room(rp, vec2(rp.x / uAspect + 0.5, rp.y + 0.5), t);
    // Light from the desk below fills the lower half with orange.
    float lit = smoothstep(0.7, -0.9, q.y - q.x * 0.35);
    vec3 core = mix(vec3(0.85, 0.42, 0.48), vec3(1.0, 0.55, 0.25), lit) * (0.45 + 0.55 * lit);
    vec3 body = behind * 0.35 + core;
    // Film thickness: slow swirl plus gravity thinning toward the top.
    vec2 sw = q * 1.3 + vec2(sin(t * 0.13), cos(t * 0.11)) * 0.5;
    float thick = fbm(sw + fbm(sw * 1.5 + t * 0.04) * 1.6) * 1.4 - q.y * 0.3;
    vec3 film = spectrum(thick + fres * 0.5);
    // Toward the edge the film reads as concentric bands, like a real bubble.
    vec3 rimFilm = spectrum(fres * 1.4 + thick * 0.3 + t * 0.03);
    // Swirl streaks: soft darker bands with a faint film tint.
    float band = smoothstep(0.08, 0.0, abs(fract(thick * 2.0) - 0.5) - 0.38);
    body = body * (1.0 - band * 0.22) + film * band * 0.1;
    // Iridescent rim: thin and bright, wider where the film is thicker.
    float rim = smoothstep(0.84 - thick * 0.05, 0.995, r);
    body = mix(body, rimFilm * 1.3, rim * 0.9);
    body += rimFilm * fres * 0.12;
    body += vec3(1.0, 0.95, 0.9) * pow(max(0.0, 1.0 - length(q - vec2(-0.4, 0.42)) * 2.8), 3.0) * 0.45;
    col = mix(col, body, smoothstep(1.0, 0.985, r));
  }

  // --- Headline rows, overlay-blended, drifting upward.
  float row = (uv.y - 0.5) / uLine + 0.5 - t * uDrift;
  float ink = texture(uText, vec2(uv.x, fract(row))).a * uTextAmt;
  col = mix(col, overlayBlack(col), ink);

  fragColor = vec4(col, 1.0);
}
`;

export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uTrail;
uniform vec2 uRes;
uniform float uBlock;     // pixel block size, fraction of height
uniform float uStrength;  // displacement along the trail
uniform float uSplit;     // RGB split along the trail
uniform float uGrain;
uniform float uFringe;    // static lens fringe toward the edges
uniform float uTime;
out vec4 fragColor;
${NOISE}

// Snap the trail lookup to a block grid so whole blocks of the scene shift
// together — that is what makes edges stair-step instead of smear.
vec2 pixelate(vec2 uv) {
  float aspect = uRes.x / uRes.y;
  vec2 g = vec2(uv.x * aspect, uv.y) / uBlock;
  g = (floor(g) + 0.5) * uBlock;
  return vec2(g.x / aspect, g.y);
}

void main() {
  vec2 uv = vUv;
  vec2 v = texture(uTrail, pixelate(uv)).xy;
  float s = length(v);
  vec2 disp = v * uStrength * 0.4;
  vec2 suv = uv - disp;

  // Split along the trail, plus a faint radial fringe like a cheap lens.
  vec2 ca = disp * 0.12 * uSplit + (uv - 0.5) * uFringe * 0.004;
  vec3 col;
  col.r = texture(uScene, suv - ca).r;
  col.g = texture(uScene, suv).g;
  col.b = texture(uScene, suv + ca).b;
  // Displaced blocks pick up a little extra contrast, like a corrupted frame.
  col = mix(col, col * col * 1.6, clamp(s * 0.5, 0.0, 0.35));

  // Vignette.
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 0.9;

  // Film grain: stepped at ~24fps, stronger in the mids, slightly chromatic.
  float frame = floor(uTime * 24.0);
  vec2 px = gl_FragCoord.xy + frame * vec2(37.0, 17.0);
  vec3 n = hash32(px) - 0.5;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float mid = 4.0 * l * (1.0 - l) * 0.7 + 0.3;
  col += (n.x + (n - n.x) * 0.35) * uGrain * mid;

  fragColor = vec4(col, 1.0);
}
`;
