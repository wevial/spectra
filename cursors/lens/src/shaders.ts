// Thin point-mass gravitational lens. For a pixel at θ from the lens (height
// units), the light came from β = θ − θE² θ / (|θ|² + core²) on the content
// plane. Outside the Einstein radius θE things are pushed outward and
// stretched into arcs; inside, you see a shrunken, mirrored image of what is
// behind the lens. Gravity is achromatic, so there's no color split.
export const LENS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uRes;
uniform vec2 uLens;       // lens center, uv
uniform float uMass;      // Einstein radius θE, fraction of height
uniform float uCore;      // softening radius, fraction of height
uniform vec4 uFit;        // content uv = screen uv * uFit.xy + uFit.zw
out vec4 fragColor;

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 k = vec2(aspect, 1.0);
  vec2 theta = (vUv - uLens) * k;
  float r2 = dot(theta, theta);
  vec2 beta = theta - uMass * uMass * theta / (r2 + uCore * uCore);
  vec2 uv = uLens + beta / k;
  fragColor = vec4(texture(uSource, uv * uFit.xy + uFit.zw).rgb, 1.0);
}
`;
