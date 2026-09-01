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
