import type { GameSettings, MenuAction, SfxName } from '../core/types';
import type { UiCallbacks } from './index';

/* ------------------------------------------------------------------ */
/* Internal shared context + screen/modal contracts.                   */
/* ------------------------------------------------------------------ */

export interface UiCtx {
  cb: UiCallbacks;
  settings: GameSettings;
  sfx(name: SfxName): void;
  /** internal navigation (screens can go back on their own) */
  nav: {
    toTitle(): void;
    toMainMenu(): void;
  };
  /** open shared modals (used by pause menu + corner buttons) */
  openSettings(): void;
  openInstructions(): void;
  /** persist ctx.settings + notify the game (called after any edit) */
  commitSettings(): void;
}

export interface Screen {
  readonly el: HTMLElement;
  handleMenu(action: MenuAction, padIndex: number): void;
  /** called when the screen is hidden/replaced */
  onHide?(): void;
}

export interface Modal {
  readonly el: HTMLElement;
  handleMenu(action: MenuAction, padIndex: number): void;
  /** called by the modal manager when the modal is dismissed */
  onClose?(): void;
}
