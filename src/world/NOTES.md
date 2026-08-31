# src/world — procedural stadium notes

## API (src/world/stadium.ts)

```ts
createStadium(theme: CourtTheme, crowdDensity: 'full' | 'light'): StadiumApi
themeDefs(): CourtThemeDef[]   // shibuya / nevarro / night, with names + ballSpeedMul/bounceMul
```

Everything (court, net, stands, banners, crowd, furniture, sky, lights,
floodlights) lives inside `api.group` — just `scene.add(api.group)`.
Call `api.update(dt, excitement)` per frame and `api.cheer(big)` on point wins /
star shots (big=true adds a confetti burst). `api.dispose()` frees all
geometries/materials/textures and detaches the group.

## Renderer expectations (what the dev viewer uses)

- `renderer.shadowMap.enabled = true`, `THREE.PCFSoftShadowMap`
- `renderer.outputColorSpace = THREE.SRGBColorSpace`
- `renderer.toneMapping = THREE.NoToneMapping` — the palette is tuned for
  unmapped bright cartoon colors; ACES will desaturate it.
- The stadium's directional light casts the only shadows (2048 map, ortho
  frustum fit to court + runoff). Night spotlights don't cast shadows (perf).

## Implementation notes

- 100% procedural: CanvasTexture for banners and net cloth, shader gradient
  sky dome, merged BufferGeometries (stands tiers, clouds, skyline, lines).
- Crowd: 2 InstancedMeshes (bodies + heads). Per-frame animation writes only
  the Y-translation element of each instance matrix (no allocations in
  `update()`). 'full' fills ~82% of seats (~550 spectators), 'light' ~32%.
- Confetti: one pooled InstancedMesh (240 quads), active only after
  `cheer(true)`.
- Deterministic: seeded PRNG per theme, so the stadium builds identically
  every run. Build time measured at ~30–70 ms per theme.
- Dev viewer: `worldviewer.html` (`npx vite`, open
  `/worldviewer.html?theme=shibuya|nevarro|night&crowd=light&ex=0.8`).
  Keys: `c` cheer, `b` big cheer + confetti, `1/2/3` switch theme.

## Contract deviations

None — implemented against `src/core/types.ts` as-is.
