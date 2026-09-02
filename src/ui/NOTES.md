# UI module notes (for the lead / other agents)

## Contract adaptations (no changes made to src/core/types.ts)

- **`CourtThemeDef` has no visual fields** (colors, blurb). The court-select
  preview art uses a local per-theme palette in `screens/courtSelect.ts`
  (`COURT_LOOKS`, keyed by theme id, with a neutral fallback for unknown ids).
  If themes ever need to drive visuals from data, consider adding
  `colors`/`blurb` to `CourtThemeDef`.
- **Court select prepends a RANDOM card** (index 0, the default selection).
  It is purely a UI construct: on PLAY it rolls one of the real themes and
  `onCourtConfirmed` always receives a real `CourtThemeDef`. With 5+ cards
  the row wraps into a compact grid (`cc-court-cards-many`).
- **No "back" callbacks exist in `UiCallbacks`** (e.g. char select → main
  menu). The UI navigates internally: main menu ⇄ title, char select → main
  menu, court select → main menu (on `back`). If the game keeps its own state
  machine in lockstep, it may want an `onBackTo*` callback; today nothing
  breaks because the game only acts on the forward callbacks.
- **`ScoreState.points` strings** are rendered verbatim (works for '0'..'Ad'
  and tiebreak numerals). `isTiebreak` shows a "TIEBREAK" ribbon.

## Behavior details

- Settings persist to `localStorage` under `cursed-court.settings.v1`,
  merged over the `initial` passed to `createUI` (which is itself merged over
  `DEFAULT_SETTINGS`). Every edit fires `onSettingsChanged` with a copy.
- `showPauseMenu` is idempotent; `handleMenu('start')` during a match calls
  `onPause()` then opens the pause menu. Modals opened from the corner icons
  during a match also call `onPause()` / `onResume()` (stack-based: only the
  first open pauses, only the last close resumes).
- Char select: humans get slots in pad-index order. After all humans lock,
  the **first (lowest) active pad** drives the CPU picks ("CPU n" cursor);
  `back` unwinds CPU picks, then the driver's own lock. A `padJoined` during
  the CPU phase cancels CPU picks and returns to the human phase.
  If an unknown pad sends actions without `padJoined`, it is joined
  automatically (forgiving).
- Portraits load from `portraits/<id>.png` with an `onerror` fallback to a
  colored-initials tile (roster color), so the screen works before portraits
  land.
- The victory screen arms its confirm after ~700 ms so a mashed button does
  not skip the celebration instantly.
- `uitest.html` + `src/ui/devTest.ts` are a dev harness only (keyboard →
  menu actions, `?screen=` param); nothing in the game imports them.

## For the integrator

- Mount: `createUI(document.getElementById('ui-root')!, callbacks, settings)`.
- The UI root uses `pointer-events: none` at the top level; interactive
  layers re-enable it, so the 3D canvas keeps receiving mouse input during
  matches.
- Fullscreen corner button calls `requestFullscreen`/`exitFullscreen`
  directly on `document.documentElement` (per plan).

## HUD placement rule

In-match announcements live in the **top band above the play area**
(`.cc-announce-layer`, `top: 6%`). The camera's framing keeps every player
below ~30% of the frame, so text placed here can never hide the far-side
player — which it did when the layer sat at `top: 30%`. If announcement
font sizes grow, re-check the gap: drive a live doubles rally and compare
`.cc-announce-text`'s `getBoundingClientRect().bottom` against the
projected screen y of each actor's head (`pos.y + 2.4`).

Split view is side-by-side (P1 left, P2 right) and is opt-out via the
CAMERA setting; charge/stamina meters hug the outer edge of their own pane
so they never sit on that pane's player.
