/* ------------------------------------------------------------------ */
/* Dev-only harness for the UI module (loaded by uitest.html).         */
/* Mounts the UI with stub callbacks; keyboard simulates pad 0-3       */
/* menu actions; ?screen= URL param jumps straight to a screen.        */
/* NOT part of the game build.                                         */
/* ------------------------------------------------------------------ */

import type {
  CourtThemeDef, GameSettings, MatchResult, MenuAction, ScoreState, TeamInfo,
} from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { themeDefList } from '../world/themes';
import { createUI, type UiApi } from './index';

const root = document.getElementById('ui-root')!;

const log = (...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.log('[uitest]', ...args);
};

const ui: UiApi = createUI(root, {
  sfx: (n) => log('sfx:', n),
  onTitleAdvance: () => { log('onTitleAdvance'); ui.showMainMenu(); },
  onModeChosen: (m) => { log('onModeChosen', m); ui.showCharacterSelect(m === 'singles' ? [0] : [0, 1], m); },
  onCharactersConfirmed: (slots) => { log('onCharactersConfirmed', slots); ui.showCourtSelect(THEMES, slots.filter((s) => s.control !== 'ai').length >= 2); },
  onCourtConfirmed: (court, games, split) => {
    log('onCourtConfirmed', court.id, games, split);
    ui.showMatchHud(FAKE_TEAMS);
    ui.updateScore(FAKE_SCORE);
    ui.announce('15 – LOVE');
  },
  onVictoryDone: () => { log('onVictoryDone'); ui.showMainMenu(); },
  onPause: () => log('onPause'),
  onResume: () => log('onResume'),
  onQuitToMenu: () => { log('onQuitToMenu'); ui.showMainMenu(); },
  onSettingsChanged: (s: GameSettings) => log('onSettingsChanged', s),
}, DEFAULT_SETTINGS);

const THEMES: CourtThemeDef[] = themeDefList();

const FAKE_TEAMS: [TeamInfo, TeamInfo] = [
  { characterIds: ['yuji', 'nobara'], label: 'Yuji & Nobara', color: '#e8514a', human: true },
  { characterIds: ['din', 'ig11'], label: 'Din & IG-11', color: '#3d8bff', human: false },
];

const FAKE_SCORE: ScoreState = {
  points: ['30', '40'],
  games: [1, 2],
  gamesToWin: 4,
  servingTeam: 0,
  isTiebreak: false,
  isDeuce: false,
};

const FAKE_RESULT: MatchResult = {
  winnerTeam: 0,
  teams: FAKE_TEAMS,
  finalGames: [4, 2],
};

/* ---------------- keyboard -> menu actions ---------------- */

let pad = 0;
const KEYMAP: Record<string, MenuAction> = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyJ: 'confirm',
  KeyK: 'back',
  Enter: 'start',
  Backspace: 'back',
};

window.addEventListener('keydown', (e) => {
  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 4) {
      pad = n - 1;
      log('active pad ->', pad);
      return;
    }
  }
  const action = KEYMAP[e.code];
  if (action) {
    e.preventDefault();
    ui.handleMenu(action, pad);
  }
});

/* ---------------- URL param routing ---------------- */

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'title';

function gotoScreen(name: string): void {
  switch (name) {
    case 'title': ui.showTitle(); break;
    case 'menu': ui.showMainMenu(); break;
    case 'chars': ui.showCharacterSelect([0, 1], (params.get('mode') as 'singles' | 'doubles') ?? 'doubles'); break;
    case 'chars1': ui.showCharacterSelect([0], 'singles'); break;
    case 'court': ui.showCourtSelect(THEMES, params.get('teams') !== '0'); break;
    case 'hud': {
      ui.showMatchHud(FAKE_TEAMS);
      ui.updateScore(FAKE_SCORE);
      const a = params.get('announce');
      if (a !== null) {
        ui.announce(
          a || '15 – LOVE',
          (params.get('style') as 'normal' | 'big' | 'gold') ?? 'normal',
          Number(params.get('ms') ?? 60000),
        );
      }
      if (params.get('charge') !== '0') {
        ui.setCharge(0, 0.75);
        ui.setCharge(1, 1.0);
      }
      if (params.get('tiebreak') === '1') {
        ui.updateScore({ ...FAKE_SCORE, points: ['6', '5'], isTiebreak: true });
      }
      break;
    }
    case 'pause': {
      ui.showMatchHud(FAKE_TEAMS);
      ui.updateScore(FAKE_SCORE);
      ui.showPauseMenu();
      break;
    }
    case 'victory': ui.showVictory(FAKE_RESULT); break;
    case 'instructions': ui.showMainMenu(); ui.handleMenu('up', 0); openModal('instructions'); break;
    case 'settings': ui.showMainMenu(); openModal('settings'); break;
    default: ui.showTitle();
  }
}

function openModal(kind: 'instructions' | 'settings'): void {
  // corner buttons are the public path to these modals
  const btns = root.querySelectorAll<HTMLElement>('.cc-corner-btn');
  const idx = kind === 'instructions' ? 1 : 2;
  btns[idx]?.click();
}

gotoScreen(screen);

/* expose for playwright / console poking */
(window as unknown as Record<string, unknown>).ccui = ui;
(window as unknown as Record<string, unknown>).ccGoto = gotoScreen;
(window as unknown as Record<string, unknown>).ccMenu =
  (a: MenuAction, p = 0) => ui.handleMenu(a, p);

log('uitest ready — screen:', screen,
  '· keys: arrows/WASD move · J confirm · K back · Enter start · 1-4 pick pad');
