import { div, el, iconSVG } from './dom';

/* ------------------------------------------------------------------ */
/* Persistent bottom-right icon buttons: fullscreen / help / settings. */
/* Mouse-first; instructions & settings are also in the pause menu.    */
/* ------------------------------------------------------------------ */

export function createCornerButtons(hooks: {
  openInstructions(): void;
  openSettings(): void;
}): HTMLElement {
  const bar = div('cc-corner');

  const mk = (kind: 'fullscreen' | 'help' | 'gear', label: string, act: () => void): HTMLElement => {
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

  mk('fullscreen', 'Fullscreen', () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => { /* ignore */ });
    } else {
      void document.documentElement.requestFullscreen().catch(() => { /* ignore */ });
    }
  });
  mk('help', 'Instructions', hooks.openInstructions);
  mk('gear', 'Settings', hooks.openSettings);

  return bar;
}
