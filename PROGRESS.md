# Cursed Court — Progress

Status legend: [ ] todo · [~] in progress · [x] done

## Phase 0 — Foundation (lead)
- [~] Vite + TS + three scaffold, npm deps
- [ ] `src/core/types.ts` contracts
- [ ] Gamepad input manager (4 pads + keyboard fallback, menu nav events)
- [ ] Pre-render character portraits → `public/portraits/*.png`

## Phase 1 — Parallel modules
- [ ] `src/world/` procedural stadium (agent: env)
- [ ] `src/characters/` loader + procedural animation (agent: chars)
- [ ] `src/audio/` music manager + procedural SFX (agent: audio)
- [ ] `src/ui/` screens, HUD, icon buttons, controller diagram (agent: ui)

## Phase 2 — Game core (lead)
- [ ] Ball physics + shot model (topspin/slice/flat/lob/drop, charge, star shots)
- [ ] Tennis rules & scoring (15/30/40, deuce, games/sets, tiebreak, serve rotation)
- [ ] Player controller (tight movement, swing magnet) + AI controller
- [ ] Match camera
- [ ] State machine wiring all screens

## Phase 3 — Integration & polish
- [ ] Full flow: title → menu → char select → court select → match → victory
- [ ] Doubles (4 players), pad assignment
- [ ] Playwright smoke test w/ mocked gamepad, screenshots reviewed
- [ ] Production build passes; committed & pushed
