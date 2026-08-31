/* ------------------------------------------------------------------ */
/* Inline-SVG Xbox controller diagram with labeled callouts.           */
/* Pure markup — no interactivity, no font dependence (letter glyphs   */
/* are stroked paths so they stay crisp on any system).                */
/* Colors per Xbox layout: A green, B red, X blue, Y yellow.           */
/* ------------------------------------------------------------------ */

const A = '#3fbf4a';
const B = '#e34b41';
const X = '#3d7fe0';
const Y = '#e6c22e';

const FACE_R = 21;

/** Stroked letter glyphs (drawn, not font-rendered). ~20-unit-tall at (x,y). */
function glyph(letter: 'A' | 'B' | 'X' | 'Y', x: number, y: number): string {
  const s = 'fill="none" stroke="#ffffff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"';
  switch (letter) {
    case 'A':
      return `<path d="M ${x - 7.6} ${y + 10} L ${x} ${y - 10} L ${x + 7.6} ${y + 10} M ${x - 4.9} ${y + 3.4} L ${x + 4.9} ${y + 3.4}" ${s}/>`;
    case 'B':
      return `<path d="M ${x - 6} ${y - 10} L ${x - 6} ${y + 10}
        M ${x - 6} ${y - 10} L ${x + 1.5} ${y - 10} A 5 5 0 0 1 ${x + 1.5} ${y} L ${x - 6} ${y}
        M ${x + 1.5} ${y} A 5 5 0 0 1 ${x + 1.5} ${y + 10} L ${x - 6} ${y + 10}" ${s}/>`;
    case 'X':
      return `<path d="M ${x - 7} ${y - 10} L ${x + 7} ${y + 10} M ${x + 7} ${y - 10} L ${x - 7} ${y + 10}" ${s}/>`;
    case 'Y':
      return `<path d="M ${x - 7} ${y - 10} L ${x} ${y - 1.5} L ${x + 7} ${y - 10} M ${x} ${y - 1.5} L ${x} ${y + 10}" ${s}/>`;
  }
}

/** One face button circle with its letter glyph. */
function face(cx: number, cy: number, color: string, letter: 'A' | 'B' | 'X' | 'Y'): string {
  return `<circle cx="${cx}" cy="${cy}" r="${FACE_R}" fill="${color}" stroke="#101318" stroke-width="2.5"/>
  ${glyph(letter, cx, cy)}`;
}

/** Callout: line from (x1,y1) to (x2,y2), label anchored at the far end. */
function callout(
  x1: number, y1: number, x2: number, y2: number,
  title: string, sub: string, side: 'left' | 'right' | 'down', accent = '#ffd42a',
): string {
  const anchor = side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle';
  const tx = side === 'left' ? x2 - 8 : side === 'right' ? x2 + 8 : x2;
  const ty1 = side === 'down' ? y2 + 20 : y2 - 4;
  const ty2 = side === 'down' ? y2 + 39 : y2 + 15;
  return `<g class="cc-callout">
    <path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${accent}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <circle cx="${x1}" cy="${y1}" r="4.5" fill="${accent}" stroke="#101318" stroke-width="1.5"/>
    <text x="${tx}" y="${ty1}" text-anchor="${anchor}" font-size="18" font-weight="900" fill="${accent}">${title}</text>
    <text x="${tx}" y="${ty2}" text-anchor="${anchor}" font-size="13.5" font-weight="700" fill="#e8ecf4">${sub}</text>
  </g>`;
}

/**
 * The full diagram. Controller drawn centered and scaled up; callouts fan
 * out left/right/down. viewBox 0 0 960 560.
 */
export function controllerDiagramSVG(): string {
  // controller center + scale
  const cx = 480;
  const cy = 268;
  const S = 1.22;
  // scaled anchor helper (points inside the scaled <g>)
  const px = (x: number): number => cx + (x - cx) * S;
  const py = (y: number): number => cy + (y - cy) * S;

  const body = `
  <defs>
    <linearGradient id="ccPadBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a4150"/>
      <stop offset="55%" stop-color="#262b36"/>
      <stop offset="100%" stop-color="#181c25"/>
    </linearGradient>
    <radialGradient id="ccPadFace" cx="50%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#454d5e"/>
      <stop offset="100%" stop-color="#2b303c"/>
    </radialGradient>
  </defs>
  <g transform="translate(${cx} ${cy}) scale(${S}) translate(${-cx} ${-cy})">
    <!-- bumpers -->
    <path d="M ${cx - 168} ${cy - 88} q 58 -30 146 -20 l -3 20 q -80 -8 -136 14 z" fill="#333947" stroke="#0d0f14" stroke-width="3"/>
    <path d="M ${cx + 168} ${cy - 88} q -58 -30 -146 -20 l 3 20 q 80 -8 136 14 z" fill="#333947" stroke="#0d0f14" stroke-width="3"/>
    <!-- body silhouette -->
    <path d="M ${cx} ${cy - 92}
      c 46 0 78 -10 108 -10 c 52 0 84 34 96 86 c 10 44 16 86 2 112
      c -12 22 -44 26 -66 8 c -20 -16 -34 -44 -56 -52 c -26 -10 -56 -10 -84 -10
      c -28 0 -58 0 -84 10 c -22 8 -36 36 -56 52 c -22 18 -54 14 -66 -8
      c -14 -26 -8 -68 2 -112 c 12 -52 44 -86 96 -86 c 30 0 62 10 108 10 z"
      fill="url(#ccPadBody)" stroke="#0d0f14" stroke-width="4"/>
    <!-- face plate glow -->
    <ellipse cx="${cx}" cy="${cy - 6}" rx="150" ry="74" fill="url(#ccPadFace)" opacity="0.55"/>

    <!-- left stick -->
    <circle cx="${cx - 108}" cy="${cy - 34}" r="30" fill="#14171e" stroke="#0d0f14" stroke-width="3"/>
    <circle cx="${cx - 108}" cy="${cy - 34}" r="20" fill="#3a4150" stroke="#525a6c" stroke-width="3"/>
    <circle cx="${cx - 108}" cy="${cy - 38}" r="12" fill="#2b303c"/>

    <!-- right stick -->
    <circle cx="${cx + 52}" cy="${cy + 26}" r="26" fill="#14171e" stroke="#0d0f14" stroke-width="3"/>
    <circle cx="${cx + 52}" cy="${cy + 26}" r="17" fill="#3a4150" stroke="#525a6c" stroke-width="3"/>
    <circle cx="${cx + 52}" cy="${cy + 23}" r="10" fill="#2b303c"/>

    <!-- d-pad -->
    <g transform="translate(${cx - 52} ${cy + 26})">
      <path d="M -9 -26 h18 v17 h17 v18 h-17 v17 h-18 v-17 h-17 v-18 h17 z"
        fill="#20242e" stroke="#0d0f14" stroke-width="3"/>
      <path d="M 0 -18 l6 8 h-12 z M 0 18 l6 -8 h-12 z M -18 0 l8 6 v-12 z M 18 0 l-8 6 v-12 z" fill="#525a6c"/>
    </g>

    <!-- ABXY cluster -->
    ${face(cx + 108, cy + 4, A, 'A')}
    ${face(cx + 148, cy - 36, B, 'B')}
    ${face(cx + 68, cy - 36, X, 'X')}
    ${face(cx + 108, cy - 76, Y, 'Y')}

    <!-- view / menu buttons -->
    <circle cx="${cx - 34}" cy="${cy - 34}" r="9" fill="#20242e" stroke="#0d0f14" stroke-width="2.5"/>
    <rect x="${cx - 38.5}" y="${cy - 38}" width="10" height="8" rx="1.5" fill="none" stroke="#8b93a5" stroke-width="1.8"/>
    <circle cx="${cx + 34}" cy="${cy - 34}" r="9" fill="#20242e" stroke="#0d0f14" stroke-width="2.5"/>
    <path d="M ${cx + 29} ${cy - 37.5} h10 M ${cx + 29} ${cy - 34} h10 M ${cx + 29} ${cy - 30.5} h10" stroke="#8b93a5" stroke-width="1.8"/>

    <!-- xbox nub -->
    <circle cx="${cx}" cy="${cy - 66}" r="13" fill="#111419" stroke="#0d0f14" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy - 66}" r="8.5" fill="none" stroke="#79ff8e" stroke-width="2" opacity="0.85"/>
  </g>`;

  /** callout that attaches at the edge of a face button, not its center */
  const faceCallout = (
    bx: number, by: number, ex: number, ey: number,
    title: string, sub: string, accent: string,
  ): string => {
    const fx = px(bx), fy = py(by);
    const dx = ex - fx, dy = ey - fy;
    const len = Math.hypot(dx, dy) || 1;
    const r = FACE_R * S + 1.5;
    const ax = fx + (dx / len) * r;
    const ay = fy + (dy / len) * r;
    return callout(ax, ay, ex, ey, title, sub, 'right', accent);
  };

  const callouts = `
  ${callout(px(cx - 140), py(cy - 96), 196, 62, 'LB — SPRINT', 'Hold to run · costs stamina', 'left', '#6ef0c8')}
  ${callout(px(cx - 108), py(cy - 34), 196, 150, 'LEFT STICK', 'Move · Aim your shot', 'left', '#8fd0e8')}
  ${callout(px(cx - 52), py(cy + 26), 196, 344, 'D-PAD', 'Navigate menus', 'left', '#c9c9d9')}
  ${callout(px(cx + 34), py(cy - 34), 466, 448, 'START', 'Pause the match', 'down', '#ff9d5c')}

  ${faceCallout(cx + 108, cy - 76, 768, 76, 'Y — FLAT POWER', 'or A+B together', Y)}
  ${faceCallout(cx + 148, cy - 36, 768, 168, 'B — SLICE', 'Curves &amp; skids low', B)}
  ${faceCallout(cx + 68, cy - 36, 768, 294, 'X — LOB', 'Over their heads', X)}
  ${faceCallout(cx + 108, cy + 4, 768, 392, 'A — TOPSPIN', 'Fast, dips at the net', A)}`;

  return `<svg class="cc-controller-svg" viewBox="0 44 960 452" role="img"
    aria-label="Xbox controller diagram">
    ${body}
    ${callouts}
  </svg>`;
}
