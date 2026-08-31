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
