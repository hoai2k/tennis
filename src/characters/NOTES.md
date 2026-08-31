# src/characters — implementation notes

## Files
- `index.ts` — public API: `loadAvatar(def)`, `preloadAvatars(defs)`; `AvatarImpl` implements the full `Avatar` contract from `core/types.ts` (glow, racquet attach, dispose).
- `loader.ts` — GLTFLoader + MeshoptDecoder, height/floor/centering normalization, shadow + material prep.
- `rig.ts` — bone mapping, hierarchy repair, canonical re-targeting (the important part, see below).
- `poses.ts` — pose math (quat blending, easing, timelines) + the authored pose library.
- `animator.ts` — procedural animation state machine (idle/ready/run/charge/swing/serve/victory/defeat).
- `racquet.ts` — procedural cartoon racquet (~0.68 m), accent-colored per character.
- `devViewer.ts` + `/charviewer.html` — dev-only viewer (`npx vite`, open `/charviewer.html?id=yuji`). Buttons for every animation; `window.drive(action, t)` steps deterministically for screenshots; `?portrait=1` renders the character-select portrait framing.

## Model findings (important)
- Node names are sanitized by three's GLTFLoader: `DEF-spine.001` → `DEF-spine001`, `DEF-hand.R` → `DEF-handR`.
- The DEF skeleton ships as **nine disconnected chains** (arms/legs/spine are not parented together). We re-parent at load (`attach`, world transforms preserved so skinning is unaffected): thighs+pelvis → DEF-spine, shoulders → DEF-spine003, upper arms → shoulders.
- Models face **+Z** as authored (toe bones point +Z); no facing correction needed.
- **Rest poses differ wildly per model**: ig11 is a clean arms-down stance, jogo is a T-pose, yuji is frozen mid-stride, nobara stands with crossed legs. Therefore poses are NOT authored relative to rest. Instead every key bone is re-targeted at load to a **canonical character-space frame** (measured from ig11, the cleanest rig). All authored poses are offsets from that shared neutral and look identical on all 13 models.
- Per-model quirks handled in `rig.ts`:
  - Foot/toe pitch varies anatomically → canonical yaw/roll but the model's own rest pitch is kept (otherwise some characters go "en pointe", e.g. nobara).
  - Some models bind **leg rolls flipped 180°** (nobara) → roll-matching mirrors the canonical frame for legs/feet only. Arms/hands stay on the reference frame so the racquet grip is identical everywhere.
  - `.001` twist segments are actively driven to align with their primary bone (some models ship non-identity rest rotations there, which curved the limbs).
  - After neutralization, container scale/offset are recalibrated from head/toe joints so height ≈ `def.height` and feet sit on y=0 even for models whose rest pose was crouched/striding.
- Several models include **built-in weapon props** skinned to the hands (nobara's hammer, and staff/weapon bits on others). They cannot be removed (single mesh/atlas); the racquet is simply added alongside. Reads as character flavor.
- Contact timing: `swing()`/`serveHit()` place the contact keyframe exactly at `SWING_CONTACT_DELAY` (0.12 s); the timeline's first key is a live snapshot of the current pose, so contact is exact whether or not a charge preceded it. Measured contact points (yuji): forehand ≈ (−0.86, 1.03, 0.82), backhand ≈ (+0.64, 0.88, 0.17), serve ≈ (0.28, 2.47, 0.17) — char right = −X in root space.
- `getRacquetPos` tracks a marker Object3D at the string-bed center.

## Contract deviations
- None against `core/types.ts`. Extra dev-only members on the impl (`debugAnimator`, `debugRacquet`) are not part of the `Avatar` interface.
