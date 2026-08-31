# Cursed Court — Progress

Status legend: [ ] todo · [~] in progress · [x] done

## Phase 0 — Foundation (lead)
- [x] Vite + TS + three scaffold, npm deps
- [x] `src/core/types.ts` contracts
- [x] Gamepad input manager (4 pads + keyboard fallback, menu nav events)
- [~] Pre-render character portraits → `public/portraits/*.png` (chars agent)

## Phase 1 — Parallel modules
- [~] `src/world/` procedural stadium (agent: env — running)
- [~] `src/characters/` loader + procedural animation (agent: chars — running)
- [x] `src/audio/` music manager + procedural SFX (agent: audio — done, 31 SFX verified)
- [~] `src/ui/` screens, HUD, icon buttons, controller diagram (agent: ui — running)

## Phase 2 — Game core (lead)
- [x] Ball physics + shot model (topspin/slice/flat/lob/drop, charge, star shots)
- [x] Tennis rules & scoring (15/30/40, deuce, games, final game, serve rotation)
- [x] Player controller (tight movement, charge/combo shots) + AI controller
- [x] Match camera
- [x] State machine wiring all screens (`src/main.ts`)

## Phase 3 — Integration & polish
- [ ] Full flow: title → menu → char select → court select → match → victory
- [ ] Doubles (4 players), pad assignment
- [ ] Playwright smoke test w/ mocked gamepad, screenshots reviewed
- [ ] Production build passes; committed & pushed
