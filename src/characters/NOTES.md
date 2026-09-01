# src/characters — implementation notes

## Files
- `index.ts` — public API: `loadAvatar(def)`, `preloadAvatars(defs)`; `AvatarImpl` implements the full `Avatar` contract from `core/types.ts` (glow, racquet attach, dispose). `loadAvatar` branches: a GLB that ships animation clips gets a `ClipAvatar`, otherwise the procedural `AvatarImpl`.
- `clipAvatar.ts` — Avatar implementation for the **Mech Mayhem robots** (titanus, konga, saurion, nullbot, fenrir, frogger, vulcan). Different skeleton (plain `hips/torso/shoulder/elbow/hand…` names, no DEF-* bones) but ~30 baked fighting-game clips per model (battleIdle, run, light1-3, heavy, crouch, victory, dead, per-mech specials). Tennis actions map onto clips via per-action fallback lists; swing clips are sped up so their hit frame (~38% in) lands at `SWING_CONTACT_DELAY`. Star shots use each mech's signature special (kongaSlam, saurionBite, nullBackhand, fenrirSpike, vulcanSpray, burst). The loader's bind-pose normalization is redone against the *animated* idle pose (several mechs float otherwise), and the racquet mounts on `handR` in a hammer-grip perpendicular to the forearm (along-forearm digs into the floor on hanging-arm rigs). Per-model notes: konga's `bigPunch1` is the LEFT fist, so forehand prefers
`bigPunch2`; titanus gets its own wind-up→release pairing (`punchHold1/2`
charge into `punchRelease1/2` swings), `throwHeave` lobs, `fistLaunch`
(Rocket Fist) stars and a `poundSlam` overhead. `CLIP_HIT_FRAC` overrides the
default ~38% strike frame per clip — `poundSlam` raises fast and slams late,
so at the default it had already driven the racquet into the floor by contact
(now peaks at contact, then slams through).
- `loader.ts` — GLTFLoader + MeshoptDecoder, height/floor/centering normalization, shadow + material prep.
- **Humanoid mech re-rigs** (`*_rig.glb`, the "MECH RIGS" setting, ON by default → `modelUrl()` in `core/roster.ts`): **all seven** mechs ship a second model with the standard Rigify DEF-* skeleton and no clips, driven by the procedural Animator like the rest of the roster. Per-character `FLAVORS` in `animator.ts` layer personality onto the shared states (konga: hunched apelike carriage + chest-beat victory; titanus: wide ponderous stance, slow stride, stomp victory; saurion: raptor lean, quick stride; fenrir: feral lean, loping stride; frogger: wide squat; vulcan: squared gun-platform bearing) — stance applies only to grounded states so swing-contact timing stays exact.
  - **Flavor stances must not bury the racquet.** The racquet hangs from the hand, so a deep hunch/crouch swings it *below the court* — the first konga/saurion stances did exactly that (racquet at −0.20 m at rest, vs 0.81 m unflavored). Both now keep the crouch in the spine/legs/left arm and leave the racquet arm alone; konga's arms reach the floor unaided, so any droop on that side is unaffordable. Verified floor: every mech's racquet clears y=0 in ready/run/swing/serve/victory (`hrig-*` screenshots).
  - History: the saurion/nullbot/frogger `*_rig` exports were initially misaligned — the DEF skeleton sat outside the mesh in bind space, so posing them dragged geometry toward wrong pivots. Fixed at the source (3rd re-export). The check that caught it: load the raw GLB, take the **skinned** bind-pose bounds (not the raw geometry box — that is meaningless for a skinned mesh) and count how many DEF bones fall inside. Aligned models score 33/33 with hips ≈40-55% and head ≈70-90% of body height; the broken ones scored 11-23/33 with bones below the feet.

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
