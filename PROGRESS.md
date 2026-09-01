# Cursed Court — Progress

Status legend: [ ] todo · [~] in progress · [x] done

## Phase 0 — Foundation (lead)
- [x] Vite + TS + three scaffold, npm deps
- [x] `src/core/types.ts` contracts
- [x] Gamepad input manager (4 pads + keyboard fallback, menu nav events)
- [x] Pre-render character portraits → `public/portraits/*.png`

## Phase 1 — Parallel modules
- [x] `src/world/` procedural stadium (3 themes, crowd, confetti — verified)
- [x] `src/characters/` loader + procedural animation (all 13 rigs, portraits — verified)
- [x] `src/audio/` music manager + procedural SFX (31 SFX verified)
- [x] `src/ui/` screens, HUD, icon buttons, controller diagram (verified at 720p/1080p)

## Phase 2 — Game core (lead)
- [x] Ball physics + shot model (topspin/slice/flat/lob/drop, charge, star shots)
- [x] Tennis rules & scoring (15/30/40, deuce, games, final game, serve rotation)
- [x] Player controller (tight movement, charge/combo shots) + AI controller
- [x] Match camera
- [x] State machine wiring all screens (`src/main.ts`)

## Phase 3 — Integration & polish
- [x] Full flow: title → menu → char select → court select → match → pause → resume (E2E verified)
- [x] Generated artwork wired in (logo, favicon, title bg, court cards, victory burst)
- [x] AI tuning: misread system so rallies end naturally (Mario-Tennis CPU feel)
- [x] Shot solver compensates magnus drift (shots land on target)
- [x] Singles + doubles sims to victory (0 console errors; deuce/Ad flow verified)
- [x] Production build passes
- [x] Final commit, push, merge to main

## Phase 4 — Deployment
- [x] GitHub Actions workflow builds Vite app → GitHub Pages (`.github/workflows/deploy.yml`)
- [x] GitHub Pages enabled; first deploy run succeeded
- [x] Live site verified: bundle byte-identical to the locally play-tested build,
      all 38 game assets (models/music/portraits/images) return 200

**Status: COMPLETE** — merged to `main` and live at https://hoai2k.github.io/tennis/

## Phase 5 — Contact & feel audit
- [x] Measured racquet→ball distance at every hit: was median 0.95m / max 3.4m (visible whiffs)
- [x] Contact magnet: body glides so the animation's contact point lands on the ball → median 0.42m / max 0.62m (ball-on-strings)
- [x] Height-adaptive swings: crouch for low balls, reach for high (racquet tracks requested height ~linearly, per-kind calibrated baselines)
- [x] Mario Tennis parity: double-tap same button boosts charge; charge fills in 0.8s; volleys, combos, stars, power serves all verified present
- [x] Frozen-frame visual verification of hits from the gameplay camera

## Phase 6 — Court expansion (8 themes + Random)
- [x] 5 new court themes: Jujutsu High Lawn (JJK grass + sakura + torii/pagoda),
      Dune Sea (Tatooine twin-sun sand + sandcrawler + vaporators),
      Mandalore Dome (beskar deck + shattered domes + mist),
      Mayhem Foundry (Mech Mayhem iron plates + chimneys + molten horizon),
      Neon Circuit (Mech Mayhem navy/cyan night arena)
- [x] Per-theme banner texts (mech names, MOS EISLEY CUP, etc.)
- [x] Court select: RANDOM card first (default) → rolls a real theme at PLAY;
      9-card wrapped grid layout
- [x] World viewer keys 1-8; smoke-tested demo match on circuit (0 errors)
- [ ] Preview art for the 6 new cards (see image-requests.md)

## Phase 7 — Mech Mayhem roster (19 characters)
- [x] 6 Mech Mayhem characters integrated: Konga, Saurion, Nullbot, Fenrir,
      Frogger, Vulcan (models uploaded by hoai2k)
- [x] ClipAvatar: clip-driven Avatar for the mech rigs (their own baked
      battleIdle/run/attack/victory clips; specials power the star shots)
- [x] Idle-pose re-grounding (saurion/nullbot/frogger floated on bind-pose fit)
- [x] Hammer-grip racquet mount on handR (works across all six rigs)
- [x] Portraits rendered via charviewer portrait mode → public/portraits/
- [x] Char select: 3-row grid nav (20 tiles), Mech Mayhem series styling
- [x] Verified: full singles match to victory (konga/vulcan, foundry) and
      doubles (saurion/nullbot/fenrir/frogger, circuit) — 0 console errors

## Phase 8 — Per-court soundtracks
- [x] 11 new music tracks wired to their courts (uploaded by hoai2k):
      Shibuya Hard Court 1-2, Moonlit Match Point 1-2 (Cursed Night),
      Jujutsu High Lawn 1-2, Nevarro Clay 1-2, Dune Sea Rally 1,
      Mandalore Dome 1, Neon Circuit 1, Mayhem Foundry 1
- [x] Gameplay music: court's own theme(s) once each, then an endless
      shuffle of house tracks + that court's themes (no adjacent repeats)
- [x] `setMusic(mode, court?)`; a new court restarts gameplay music
- [x] Missing/failed track skips instantly instead of stalling the playlist
- [x] Verified all 8 courts over 40-track runs + a live in-match fetch
- [x] Mayhem Foundry 1 added — all 8 courts now have their own theme(s)

## Phase 9 — Titanus (20 characters)
- [x] Titanus ("The Iron Avalanche") added from Mech Mayhem; official
      colors pulled from the source game (#ffa832 amber)
- [x] Its own move mapping: punchHold1/2 charge -> punchRelease1/2 swings,
      throwHeave lob, fistLaunch (Rocket Fist) star, poundSlam overhead
- [x] CLIP_HIT_FRAC per-clip strike timing (poundSlam smash/serve now
      contacts at the top of the raise, 2.63m, instead of past the floor)
- [x] Char select is now exactly 3 rows of 7 (20 roster + Random)
- [x] Verified: singles to victory (titanus/konga, foundry), doubles mixing
      mechs with the older roster (circuit), all 7 mechs regression-checked

## Phase 10 — Humanoid mech rigs + swing tuning
- [x] Per-model clip retuning: nullbot/frogger forehands now use the light3
      arc (racquet at 1.4m, was ankle height), saurion backhand uses the
      quill-fan flare, frogger smash/serve uses the groundPound leap apex,
      nullbot smash timed to the heavy wind-through peak — every stroke on
      every mech contacts at proper height
- [x] "MECH RIGS: ORIGINAL / HUMANOID" setting (persisted, HUMANOID is the
      default); HUMANOID loads *_rig.glb re-rigs driven by the procedural
      tennis animator
- [x] Personality flavors for the humanoid path (konga knuckle stance +
      chest-beat, titanus stomps, fenrir lope, vulcan gun-platform bearing)
- [x] Verified: humanoid singles to victory (konga_rig/titanus_rig,
      network-confirmed), clip doubles regression, settings toggle UI,
      originals byte-identical racquet positions
- [x] saurion/nullbot/frogger *_rig exports fixed at the source and enabled —
      all 7 mechs now run humanoid rigs (33/33 bones inside the bind-pose
      mesh, matching the models that already worked)
- [x] Fixed a self-inflicted regression found while enabling them: konga's and
      saurion's crouch flavors hung the racquet below the court at rest
      (-0.20m); stances now keep the crouch but leave the racquet arm free
