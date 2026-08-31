import type { PlayStyle } from '../core/types';

/* ------------------------------------------------------------------ */
/* Tiny DOM helpers shared by all UI modules.                          */
/* ------------------------------------------------------------------ */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function div(cls?: string, text?: string): HTMLDivElement {
  return el('div', cls, text);
}

/** Wrap text so every character gets a dark outline via layered shadows (class hooks). */
export function chunkyText(tag: keyof HTMLElementTagNameMap, cls: string, text: string): HTMLElement {
  const e = el(tag, cls, text) as HTMLElement;
  return e;
}

/** Re-trigger a CSS animation class. */
export function pop(e: HTMLElement, cls: string): void {
  e.classList.remove(cls);
  // force reflow so the animation restarts
  void e.offsetWidth;
  e.classList.add(cls);
}

/* ------------------------------------------------------------------ */
/* Shared palette / metadata                                           */
/* ------------------------------------------------------------------ */

/** Player cursor colors: P1 red, P2 blue, P3 yellow, P4 green. */
export const PAD_COLORS = ['#ff4646', '#3d8bff', '#ffd42a', '#3ecf5a'];
export const CPU_COLOR = '#b9bec9';

export const STYLE_BADGE: Record<PlayStyle, { icon: string; label: string }> = {
  'all-around': { icon: '⚖️', label: 'All-Around' },
  power: { icon: '💪', label: 'Power' },
  speed: { icon: '💨', label: 'Speed' },
  technique: { icon: '🎯', label: 'Technique' },
  tricky: { icon: '🌀', label: 'Tricky' },
  defense: { icon: '🛡️', label: 'Defense' },
};

/** Initials for the portrait fallback tile, e.g. "Yuji Itadori" -> "YI". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Inline SVG bits                                                     */
/* ------------------------------------------------------------------ */

let ballGradientN = 0;

/** Cartoon tennis ball (inline SVG markup). Gradient ids are unique per
 *  instance — duplicate ids break paint-server resolution when the first
 *  copy sits in a hidden subtree. */
export function ballSVG(size: number, cls = ''): string {
  const gid = `ccBallG${ballGradientN++}`;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
  <defs>
    <radialGradient id="${gid}" cx="35%" cy="30%" r="80%">
      <stop offset="0%" stop-color="#f4ff6e"/>
      <stop offset="55%" stop-color="#d8ef3a"/>
      <stop offset="100%" stop-color="#a6bf1c"/>
    </radialGradient>
  </defs>
  <circle cx="20" cy="20" r="19" fill="url(#${gid})" stroke="#6d7f10" stroke-width="2"/>
  <path d="M 6 5 Q 22 20 6 35" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
  <path d="M 34 5 Q 18 20 34 35" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

/** Chunky star (inline SVG markup). */
export function starSVG(size: number, color = '#ffd42a', cls = ''): string {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
  <path d="M20 2 L25.5 14.2 L38 15.6 L28.6 24.4 L31.4 37.4 L20 30.6 L8.6 37.4 L11.4 24.4 L2 15.6 L14.5 14.2 Z"
    fill="${color}" stroke="#7a5a00" stroke-width="2.4" stroke-linejoin="round"/>
</svg>`;
}

/** Crisp icons for the persistent corner buttons. */
export function iconSVG(kind: 'fullscreen' | 'help' | 'gear'): string {
  const common = 'width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
  switch (kind) {
    case 'fullscreen':
      return `<svg ${common} aria-hidden="true">
        <path d="M4 9 V4 h5"/><path d="M20 9 V4 h-5"/>
        <path d="M4 15 v5 h5"/><path d="M20 15 v5 h-5"/>
      </svg>`;
    case 'help':
      return `<svg ${common} aria-hidden="true">
        <circle cx="12" cy="12" r="9.5"/>
        <path d="M9.2 9.4 a2.9 2.9 0 1 1 4.3 2.6 c-1 .6 -1.5 1.1 -1.5 2.2"/>
        <circle cx="12" cy="17.4" r="0.6" fill="currentColor" stroke="none"/>
      </svg>`;
    case 'gear':
      return `<svg ${common} aria-hidden="true">
        <circle cx="12" cy="12" r="3.2"/>
        <path d="M12 2.8 l1 2.4 a7.2 7.2 0 0 1 2.4 1 l2.5 -.8 1.7 2.9 -1.7 2a7.2 7.2 0 0 1 0 2.6 l1.7 2 -1.7 2.9 -2.5 -.8 a7.2 7.2 0 0 1 -2.4 1 l-1 2.4 h-3.4 l-.9 -2.4 a7.2 7.2 0 0 1 -2.4 -1 l-2.5 .8 -1.7 -2.9 1.7 -2 a7.2 7.2 0 0 1 0 -2.6 l-1.7 -2 1.7 -2.9 2.5 .8 a7.2 7.2 0 0 1 2.4 -1 l.9 -2.4 z" stroke-width="1.9"/>
      </svg>`;
  }
}
