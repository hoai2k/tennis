import type {
  CharacterId, ControlSource, CourtThemeDef, GameSettings, MatchResult,
  MenuAction, ScoreState, SfxName, TeamInfo,
} from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import type { Modal, Screen, UiCtx } from './context';
import { createCornerButtons } from './corner';
import { ballSVG, div } from './dom';
import { Hud } from './hud';
import { createInstructionsModal, createPauseMenu, createSettingsModal } from './modals';
import { createCharSelect } from './screens/charSelect';
import { createCourtSelect } from './screens/courtSelect';
import { createMainMenu } from './screens/mainMenu';
import { createTitleScreen } from './screens/title';
import { createVictoryScreen } from './screens/victory';
import './style.css';

/* ============================================================
 * Cursed Court — DOM UI overlay.
 * Entirely driven by the game via UiApi; the game forwards
 * gamepad menu actions through handleMenu(action, padIndex).
 * ============================================================ */

export interface UiCallbacks {
  /** play a ui sound */
  sfx(name: SfxName): void;
  /** user pressed something on the title screen (also: unlock audio, go fullscreen) */
  onTitleAdvance(): void;
  onModeChosen(mode: 'singles' | 'doubles'): void;
  /** char select finished; slots ordered: humans by pad index, then AI slots */
  onCharactersConfirmed(slots: { characterId: CharacterId; control: ControlSource }[]): void;
  onCourtConfirmed(court: CourtThemeDef, gamesToWin: 1 | 2 | 4, splitHumans: boolean): void;
  onVictoryDone(): void;
  onPause(): void;          // called when UI wants game paused (opened a modal during match)
  onResume(): void;         // modal closed during match
  onQuitToMenu(): void;     // from pause menu / victory
  onSettingsChanged(s: GameSettings): void;
}

export interface UiApi {
  handleMenu(action: MenuAction, padIndex: number): void;
  /** screens */
  showTitle(): void;
  showMainMenu(): void;
  showCharacterSelect(activePads: number[], mode: 'singles' | 'doubles'): void;
  /** notify UI a pad joined later (pressed a button while in char select) */
  padJoined(padIndex: number): void;
  showCourtSelect(themes: CourtThemeDef[], showTeamOption: boolean): void;
  showMatchHud(teams: [TeamInfo, TeamInfo]): void;
  hideAll(): void;
  showVictory(result: MatchResult): void;
  /** match hud updates */
  updateScore(s: ScoreState): void;
  announce(text: string, style?: 'normal' | 'big' | 'gold', ms?: number): void;
  showPauseMenu(): void; hidePauseMenu(): void;
  /** charge meter for a player 0..1, -1 hides (positioned near bottom corners by slot) */
  setCharge(slot: number, v: number): void;
  /** full-screen loading overlay with a progress bar (0..1) */
  showLoading(): void;
  setLoadingProgress(fraction: number, label?: string): void;
  hideLoading(): void;
  getSettings(): GameSettings;
}

const SETTINGS_KEY = 'cursed-court.settings.v1';

function loadSettings(initial: GameSettings): GameSettings {
  const merged: GameSettings = { ...DEFAULT_SETTINGS, ...initial };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      if (typeof parsed.musicVolume === 'number') merged.musicVolume = clamp01(parsed.musicVolume);
      if (typeof parsed.sfxVolume === 'number') merged.sfxVolume = clamp01(parsed.sfxVolume);
      if (typeof parsed.rumble === 'boolean') merged.rumble = parsed.rumble;
      if (parsed.crowdDensity === 'full' || parsed.crowdDensity === 'light') {
        merged.crowdDensity = parsed.crowdDensity;
      }
    }
  } catch { /* localStorage unavailable — use defaults */ }
  return merged;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function createUI(root: HTMLElement, cb: UiCallbacks, initial: GameSettings): UiApi {
  const settings = loadSettings(initial);

  // ---------------- layers ----------------
  const uiRoot = div('cc-ui');
  const screenLayer = div('cc-layer cc-screen-layer');
  const hudLayer = div('cc-layer cc-hud-layer');
  const modalLayer = div('cc-layer cc-modal-layer');
  uiRoot.appendChild(screenLayer);
  uiRoot.appendChild(hudLayer);
  uiRoot.appendChild(modalLayer);
  root.appendChild(uiRoot);

  // ---------------- shared context ----------------
  let inMatch = false;

  const ctx: UiCtx = {
    cb,
    settings,
    sfx: (name) => cb.sfx(name),
    nav: {
      toTitle: () => api.showTitle(),
      toMainMenu: () => api.showMainMenu(),
    },
    openSettings: () => openModal('settings'),
    openInstructions: () => openModal('instructions'),
    commitSettings: () => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch { /* ignore */ }
      cb.onSettingsChanged({ ...settings });
    },
  };

  // ---------------- screens ----------------
  const title = createTitleScreen(ctx);
  const mainMenu = createMainMenu(ctx);
  const charSelect = createCharSelect(ctx);
  const courtSelect = createCourtSelect(ctx);
  const victory = createVictoryScreen(ctx);
  const hud = new Hud();
  hudLayer.appendChild(hud.el);

  let currentScreen: Screen | null = null;

  function switchScreen(s: Screen | null): void {
    if (currentScreen === s) return;
    if (currentScreen) {
      currentScreen.onHide?.();
      currentScreen.el.remove();
    }
    currentScreen = s;
    if (s) screenLayer.appendChild(s.el);
  }

  // ---------------- modals ----------------
  interface StackEntry { modal: Modal; name: string }
  const modalStack: StackEntry[] = [];

  function pauseIfNeeded(): void {
    if (inMatch && modalStack.length === 1) cb.onPause();
  }
  function resumeIfNeeded(): void {
    if (inMatch && modalStack.length === 0) cb.onResume();
  }

  function pushModal(modal: Modal, name: string): void {
    modalStack.push({ modal, name });
    modalLayer.appendChild(modal.el);
    pauseIfNeeded();
  }

  function popModal(): void {
    const top = modalStack.pop();
    if (!top) return;
    top.modal.onClose?.();
    top.modal.el.remove();
    resumeIfNeeded();
  }

  function closeAllModals(silent: boolean): void {
    while (modalStack.length) {
      const top = modalStack.pop()!;
      top.modal.onClose?.();
      top.modal.el.remove();
    }
    if (!silent) resumeIfNeeded();
  }

  function openModal(kind: 'settings' | 'instructions'): void {
    if (modalStack.length && modalStack[modalStack.length - 1].name === kind) return;
    const modal = kind === 'settings'
      ? createSettingsModal(ctx, () => popModal())
      : createInstructionsModal(ctx, () => popModal());
    pushModal(modal, kind);
  }

  const pauseMenu = createPauseMenu(ctx, {
    resume() {
      // close everything above + the pause menu itself
      while (modalStack.length && modalStack[modalStack.length - 1].name !== 'pause') popModal();
      if (modalStack.length) popModal(); // the pause menu (triggers onResume)
    },
    quit() {
      inMatch = false;
      closeAllModals(true);
      hud.hide();
      cb.onQuitToMenu();
    },
  });

  function showPauseMenu(): void {
    if (modalStack.some((m) => m.name === 'pause')) return; // idempotent
    pushModal(pauseMenu, 'pause');
  }

  function hidePauseMenu(): void {
    if (!modalStack.some((m) => m.name === 'pause')) return;
    while (modalStack.length && modalStack[modalStack.length - 1].name !== 'pause') popModal();
    if (modalStack.length) popModal();
  }

  // ---------------- loading overlay ----------------
  const loadingEl = div('cc-loading');
  loadingEl.hidden = true;
  const loadingCard = div('cc-loading-card');
  loadingCard.appendChild(div('cc-loading-title', 'ENTERING THE COURT'));
  const loadingTrack = div('cc-loading-track');
  const loadingFill = div('cc-loading-fill');
  loadingTrack.appendChild(loadingFill);
  loadingCard.appendChild(loadingTrack);
  const loadingLabel = div('cc-loading-label', 'Loading\u2026');
  loadingCard.appendChild(loadingLabel);
  const loadingBall = div('cc-loading-ball');
  loadingBall.innerHTML = ballSVG(46, 'cc-loading-ball-svg');
  loadingCard.appendChild(loadingBall);
  loadingEl.appendChild(loadingCard);
  uiRoot.appendChild(loadingEl);

  // ---------------- persistent corner buttons ----------------
  uiRoot.appendChild(createCornerButtons({
    openInstructions: () => openModal('instructions'),
    openSettings: () => openModal('settings'),
  }));

  // ---------------- api ----------------
  const api: UiApi = {
    handleMenu(action: MenuAction, padIndex: number) {
      // modals swallow input first
      const top = modalStack[modalStack.length - 1];
      if (top) {
        top.modal.handleMenu(action, padIndex);
        return;
      }
      if (inMatch) {
        if (action === 'start') {
          cb.onPause();
          showPauseMenu();
          ctx.sfx('menu_confirm');
        }
        return;
      }
      currentScreen?.handleMenu(action, padIndex);
    },

    showLoading() {
      loadingFill.style.width = '0%';
      loadingLabel.textContent = 'Loading\u2026';
      loadingEl.hidden = false;
    },

    setLoadingProgress(fraction: number, label?: string) {
      const pct = Math.max(0, Math.min(1, fraction)) * 100;
      loadingFill.style.width = `${pct.toFixed(1)}%`;
      loadingLabel.textContent = label ?? `${Math.round(pct)}%`;
    },

    hideLoading() {
      loadingEl.hidden = true;
    },

    showTitle() {
      inMatch = false;
      closeAllModals(true);
      hud.hide();
      switchScreen(title);
    },

    showMainMenu() {
      inMatch = false;
      closeAllModals(true);
      hud.hide();
      switchScreen(mainMenu);
    },

    showCharacterSelect(activePads: number[], mode: 'singles' | 'doubles') {
      inMatch = false;
      hud.hide();
      charSelect.start(activePads, mode);
      switchScreen(charSelect);
    },

    padJoined(padIndex: number) {
      charSelect.padJoined(padIndex);
    },

    showCourtSelect(themes: CourtThemeDef[], showTeamOption: boolean) {
      inMatch = false;
      hud.hide();
      courtSelect.start(themes, showTeamOption);
      switchScreen(courtSelect);
    },

    showMatchHud(teams: [TeamInfo, TeamInfo]) {
      switchScreen(null);
      closeAllModals(true);
      inMatch = true;
      hud.show(teams);
    },

    hideAll() {
      inMatch = false;
      closeAllModals(true);
      hud.hide();
      switchScreen(null);
    },

    showVictory(result: MatchResult) {
      inMatch = false;
      closeAllModals(true);
      hud.hide();
      victory.start(result);
      switchScreen(victory);
    },

    updateScore(s: ScoreState) {
      hud.updateScore(s);
    },

    announce(text: string, style: 'normal' | 'big' | 'gold' = 'normal', ms = 1400) {
      hud.announce(text, style, ms);
    },

    showPauseMenu,
    hidePauseMenu,

    setCharge(slot: number, v: number) {
      hud.setCharge(slot, v);
    },

    getSettings() {
      return { ...settings };
    },
  };

  return api;
}
