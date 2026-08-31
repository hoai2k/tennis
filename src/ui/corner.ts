import { div, el, iconSVG } from './dom';

/* ------------------------------------------------------------------ */
/* Persistent bottom-right icon buttons:                               */
/* sound / fullscreen / help / settings.                               */
/* Mouse-first; instructions & settings are also in the pause menu.    */
/* ------------------------------------------------------------------ */

export interface CornerButtons {
  el: HTMLElement;
  /** re-read the mute state (e.g. after the settings modal changed it) */
  syncMute(): void;
}

export function createCornerButtons(hooks: {
  openInstructions(): void;
  openSettings(): void;
  isMuted(): boolean;
  toggleMute(): void;
}): CornerButtons {
  const bar = div('cc-corner');

  const mk = (
    kind: 'fullscreen' | 'help' | 'gear' | 'sound' | 'muted',
    label: string,
    act: () => void,
  ): HTMLElement => {
    const b = el('button', 'cc-corner-btn');
    b.innerHTML = iconSVG(kind);
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      act();
    });
    bar.appendChild(b);
    return b;
  };

  const soundBtn = mk('sound', 'Sound on/off', () => {
    hooks.toggleMute();
    syncMute();
  });

  function syncMute(): void {
    const m = hooks.isMuted();
    soundBtn.innerHTML = iconSVG(m ? 'muted' : 'sound');
    soundBtn.title = m ? 'Sound off — click to unmute' : 'Sound on — click to mute';
    soundBtn.setAttribute('aria-label', soundBtn.title);
    soundBtn.classList.toggle('cc-corner-off', m);
  }
  syncMute();

  mk('fullscreen', 'Fullscreen', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* ignore */ });
    } else {
      void document.documentElement.requestFullscreen().catch(() => { /* ignore */ });
    }
  });
  mk('help', 'Instructions', hooks.openInstructions);
  mk('gear', 'Settings', hooks.openSettings);

  return { el: bar, syncMute };
}
