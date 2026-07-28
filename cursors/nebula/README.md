# Nebula cursor

A fixed, fullscreen WebGL2 nebula you can part with your mouse. The cursor
bends a displacement field rather than moving color: clouds thin where you
pass, pile up at the rim, and always heal back to the untouched procedural
cloud. Colors never mix, so the nebula can't be stirred to mud.

**[Live demo →](https://wevial.github.io/nebula-cursor/)** (desktop — move your mouse through the gas)

![The nebula mid-parting — a cursor sweep has carved a lane and left a vortex swirl in the gas](docs/hero.png)

Extracted from a larger scroll-narrative site — this is the pure nebula +
cursor interaction, framework-free.

## Run

```sh
npm install
npm run dev       # local dev server (Vite)
npm run build     # static build -> dist/
npm run preview   # serve the built dist/
```

## How it works

The cloud texture is recomputed every frame: a procedural base nebula (fbm +
domain warp + ridged filaments + dust lanes) sampled through a displacement
field. The cursor writes into that field two ways — a local radial shove
(the parting) and a soft directional drag pushed through a GPU fluid sim (the
wake). The field decays back to zero over ~1s, so the cloud always relaxes to
its rest shape. Divergence of the displacement thins stretched gas and
brightens compressed gas, which is what makes a push read as *parting* rather
than refraction.

| File | Role |
|---|---|
| `src/main.js` | Bootstrap, pointer input, render loop, governor wiring |
| `src/fluid.js` | Velocity sim (advect, pressure projection), displacement update, cloud render + `CONFIG` tuning |
| `src/shaders.js` | All GLSL: sim kernels, procedural base nebula, composite (space gradient + parallax stars + gas-gated glow) |
| `src/perf.js` | FPS governor: quality-tier ladder down to a static CSS fallback |
| `src/gl.js` | WebGL2 helpers: programs, ping-pong FBOs, fullscreen-triangle blit |

Requires WebGL2 + `EXT_color_buffer_float`; otherwise falls back to a static
CSS gradient. Cursor interaction is mouse-only (touch is left free). Respects
`prefers-reduced-motion` (freezes the drift and sim).

Debug: `?tier=0..4` locks a quality tier (4 = static fallback); `?perf` logs
governor decisions to the console.

## License

MIT
