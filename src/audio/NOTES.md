# Audio module notes

Owner: audio agent. Entry point: `createAudio(initial: GameSettings): AudioApi` in `src/audio/index.ts`.

## Usage

- `unlock()` must be called from a user-gesture handler (pointerdown/keydown).
  It creates/resumes the AudioContext and starts any `setMusic(...)` mode that
  was requested before unlock. Calling it repeatedly is safe (idempotent + re-resume).
- `sfx()`/`chargeLoop()` are silent no-ops before unlock (no queueing — stale
  one-shots after unlock would be confusing).
- `setMusic(sameMode)` is a no-op (never restarts the track).

## Design choices / contract adaptations

- No changes to `src/core/types.ts` were needed; `AudioApi` is implemented as-is.
- Music uses plain `HTMLAudioElement`s with JS-driven volume ramps (0.6 s
  crossfades, `el.volume = fade * musicVolume`) instead of
  MediaElementAudioSourceNode — identical audible result, works even if
  AudioContext construction fails, and avoids element/context wiring issues.
- SFX are 100% procedural WebAudio. All builders are pure functions over
  `BaseAudioContext` (see `sfx.ts` `SFX_BUILDERS`), so the exact same synthesis
  code renders into an `OfflineAudioContext` for headless testing
  (`window.__renderSfxOffline(name)` in `devTest.ts`).
- `charge_loop` appears in `SfxName`, so `sfx('charge_loop')` plays a finite
  ~1 s one-shot riser burst. The sustained hold-shimmer is `chargeLoop(true/false)`
  as per the API (starts/stops cleanly with ramps).
- `SfxOpts.gain` is clamped to 0..1, `rate` to 0.25..4, `pan` uses
  `StereoPannerNode` with a pass-through fallback where unsupported.
- Shared white/pink/click noise buffers are built once per context and cached
  (WeakMap), including for offline contexts.
- Volume getters return the last values passed to the setters (clamped 0..1),
  seeded from `GameSettings`; persistence to storage is left to the settings UI.

## Dev test page

`/audiotest.html` (repo root) + `src/audio/devTest.ts`: buttons for every SFX,
music modes, volume sliders, charge-loop toggle, SfxOpts demos, and an offline
render smoke test (`__testAllSfx()` — asserts each sfx peak > 0.01).
Run `npx vite` and open `/audiotest.html`.
