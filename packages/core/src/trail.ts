// Cursor trail: a decaying ping-pong field of where the mouse has been.
// Each frame the previous field fades, then the segment the mouse swept since
// last frame is painted in with a soft brush, weighted by speed. Channels:
//   xy — unit direction of motion (mixed in, so it fades and turns smoothly)
//   z  — energy, 0..1, regardless of direction (crossing your own path adds up)
// The brush and weighting are adapted from Unicorn Studio's pixel-trail mouse
// effect as used on macroscope.com.

import { Program, VERTEX, createDoubleFBO } from './gl';
import type { Blit, DoubleFBO } from './gl';
import type { Pointer } from './stage';

const TRAIL = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTrail;
uniform vec2 uPrev;
uniform vec2 uCur;
uniform float uAspect;
uniform float uRadius;
uniform float uDecay;
uniform float uTime;
out vec4 fragColor;

void main() {
  // A faint wobble on the read keeps the fading trail from looking stamped.
  vec2 wobble = vec2(sin(vUv.y * 31.0 + uTime * 1.3), cos(vUv.x * 27.0 + uTime * 1.1)) * 0.0012;
  vec3 prev = texture(uTrail, vUv + wobble).xyz * uDecay;

  vec2 k = vec2(uAspect, 1.0);
  vec2 p = vUv * k, a = uPrev * k, b = uCur * k;
  vec2 ab = b - a;
  float len = length(ab);
  float t = len > 0.0 ? clamp(dot(p - a, ab) / (len * len), 0.0, 1.0) : 0.0;
  float dist = distance(p, a + ab * t);

  float s = smoothstep(uRadius, uRadius * 0.21, dist);
  s *= s;
  float intensity = min(0.7, len * 10.0) * s * 0.4;
  vec2 dir = len > 0.0 ? ab / len : vec2(0.0);

  fragColor = vec4(mix(prev.xy, dir, intensity), mix(prev.z, 1.0, intensity), 1.0);
}
`;

export interface TrailParams {
  /** Brush radius, fraction of height. */
  radius: number;
  /** Seconds for the trail to fall to ~5%. */
  fade: number;
}

export class Trail {
  private gl: WebGL2RenderingContext;
  private blit: Blit;
  private program: Program;
  private field: DoubleFBO | null = null;

  /** scale: field resolution relative to the drawing buffer. */
  constructor(gl: WebGL2RenderingContext, blit: Blit, private scale = 0.5) {
    this.gl = gl;
    this.blit = blit;
    this.program = new Program(gl, VERTEX, TRAIL);
    this.resize();
  }

  /** Read side of the field, for sampling in later passes. */
  get texture() {
    return this.field!.read;
  }

  resize() {
    const gl = this.gl;
    this.field?.dispose();
    const w = Math.max(1, Math.ceil(gl.drawingBufferWidth * this.scale));
    const h = Math.max(1, Math.ceil(gl.drawingBufferHeight * this.scale));
    this.field = createDoubleFBO(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
  }

  update(pointer: Pointer, dt: number, time: number, params: TrailParams) {
    const gl = this.gl;
    const field = this.field!;
    const p = this.program;
    gl.disable(gl.BLEND);
    p.use();
    gl.uniform1i(p.uniforms.uTrail, field.read.attach(0));
    const moved = pointer.active ? 1 : 0;
    gl.uniform2f(p.uniforms.uPrev, pointer.x - pointer.dx * moved, pointer.y - pointer.dy * moved);
    gl.uniform2f(p.uniforms.uCur, pointer.x, pointer.y);
    gl.uniform1f(p.uniforms.uAspect, gl.drawingBufferWidth / gl.drawingBufferHeight);
    gl.uniform1f(p.uniforms.uRadius, params.radius);
    gl.uniform1f(p.uniforms.uDecay, Math.pow(0.05, dt / Math.max(params.fade, 0.01)));
    gl.uniform1f(p.uniforms.uTime, time);
    this.blit(field.write);
    field.swap();
  }
}
