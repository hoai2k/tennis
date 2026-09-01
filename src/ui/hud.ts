import type { ScoreState, TeamInfo } from '../core/types';
import { ballSVG, div, el, pop, starSVG } from './dom';

/* ------------------------------------------------------------------ */
/* Match HUD: scoreboard (top-left), announcements (center),           */
/* charge meters (bottom corners).                                     */
/* ------------------------------------------------------------------ */

interface ScoreRow {
  root: HTMLElement;
  serve: HTMLElement;
  games: HTMLElement;
  points: HTMLElement;
}

export class Hud {
  readonly el: HTMLElement;
  private board: HTMLElement;
  private rows: ScoreRow[] = [];
  private tiebreakTag: HTMLElement;
  private announceLayer: HTMLElement;
  private announceTimer: number | undefined;
  private chargeEls: { wrap: HTMLElement; fill: HTMLElement; stam: HTMLElement }[] = [];
  private lastPoints: [string, string] = ['', ''];
  private lastGames: [number, number] = [-1, -1];

  constructor() {
    this.el = div('cc-hud');
    this.el.hidden = true;

    this.board = div('cc-scoreboard');
    this.tiebreakTag = div('cc-tiebreak-tag', 'TIEBREAK');
    this.tiebreakTag.hidden = true;
    this.el.appendChild(this.board);
    this.el.appendChild(this.tiebreakTag);

    this.announceLayer = div('cc-announce-layer');
    this.el.appendChild(this.announceLayer);

    // 4 charge meters, hidden until setCharge >= 0
    const chargeLayer = div('cc-charge-layer');
    for (let i = 0; i < 4; i++) {
      const wrap = div(`cc-charge cc-charge-slot${i}`);
      const ring = div('cc-charge-ring');
      const fill = div('cc-charge-fill');
      const label = div('cc-charge-label', `P${i + 1}`);
      // sprint stamina sits under the charge ring
      const stamTrack = div('cc-stamina');
      const stam = div('cc-stamina-fill');
      stamTrack.appendChild(stam);
      ring.appendChild(fill);
      wrap.appendChild(ring);
      wrap.appendChild(stamTrack);
      wrap.appendChild(label);
      wrap.hidden = true;
      chargeLayer.appendChild(wrap);
      this.chargeEls.push({ wrap, fill, stam });
    }
    this.el.appendChild(chargeLayer);
  }

  show(teams: [TeamInfo, TeamInfo]): void {
    this.board.innerHTML = '';
    this.rows = [];
    this.lastPoints = ['', ''];
    this.lastGames = [-1, -1];
    for (let t = 0; t < 2; t++) {
      const info = teams[t];
      const row = div('cc-score-row');
      const chip = div('cc-score-chip');
      chip.style.background = info.color;
      const serve = div('cc-score-serve');
      serve.innerHTML = ballSVG(20);
      serve.style.visibility = 'hidden';
      const label = div('cc-score-label', info.label);
      if (!info.human) label.appendChild(el('span', 'cc-score-cpu', 'CPU'));
      const games = div('cc-score-games', '0');
      const points = div('cc-score-points', '0');
      row.appendChild(chip);
      row.appendChild(serve);
      row.appendChild(label);
      row.appendChild(games);
      row.appendChild(points);
      this.board.appendChild(row);
      this.rows.push({ root: row, serve, games, points });
    }
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
    this.clearAnnounce();
    for (const c of this.chargeEls) c.wrap.hidden = true;
  }

  updateScore(s: ScoreState): void {
    if (this.rows.length !== 2) return;
    for (let t = 0; t < 2; t++) {
      const row = this.rows[t];
      row.serve.style.visibility = s.servingTeam === t ? 'visible' : 'hidden';
      const g = String(s.games[t]);
      if (row.games.textContent !== g) {
        row.games.textContent = g;
        if (this.lastGames[t] >= 0) pop(row.games, 'cc-pop');
      }
      const p = s.points[t];
      if (this.lastPoints[t] !== p) {
        row.points.textContent = p;
        if (this.lastPoints[t] !== '') pop(row.points, 'cc-pop');
      }
      this.lastPoints[t] = p;
      this.lastGames[t] = s.games[t];
      row.points.classList.toggle('cc-score-ad', p === 'Ad');
    }
    this.tiebreakTag.hidden = !s.isTiebreak;
    this.board.classList.toggle('cc-deuce', s.isDeuce);
  }

  announce(text: string, style: 'normal' | 'big' | 'gold' = 'normal', ms = 1400): void {
    this.clearAnnounce();
    const a = div(`cc-announce cc-announce-${style}`);
    if (style === 'gold') {
      const l = div('cc-announce-star cc-announce-star-l');
      l.innerHTML = starSVG(52);
      const r = div('cc-announce-star cc-announce-star-r');
      r.innerHTML = starSVG(52);
      a.appendChild(l);
      a.appendChild(div('cc-announce-text', text));
      a.appendChild(r);
    } else {
      a.appendChild(div('cc-announce-text', text));
    }
    this.announceLayer.appendChild(a);
    this.announceTimer = window.setTimeout(() => {
      a.classList.add('cc-announce-out');
      window.setTimeout(() => a.remove(), 260);
    }, ms);
  }

  private clearAnnounce(): void {
    if (this.announceTimer !== undefined) {
      window.clearTimeout(this.announceTimer);
      this.announceTimer = undefined;
    }
    this.announceLayer.innerHTML = '';
  }

  /** in split view each player's meters live inside their own pane */
  setSplitView(enabled: boolean, slotTeams: (0 | 1)[]): void {
    this.el.classList.toggle('cc-hud-split', enabled);
    this.chargeEls.forEach((c, i) => {
      c.wrap.classList.toggle('cc-meter-top', enabled && slotTeams[i] === 0);
      c.wrap.classList.toggle('cc-meter-bottom', enabled && slotTeams[i] === 1);
    });
  }

  /** sprint stamina 0..1 (-1 hides the whole meter cluster) */
  setStamina(slot: number, v: number): void {
    const c = this.chargeEls[slot];
    if (!c) return;
    if (v < 0) return;
    c.wrap.hidden = false;
    const f = Math.min(1, Math.max(0, v));
    c.stam.style.width = `${(f * 100).toFixed(1)}%`;
    // amber when running low, red when spent
    c.stam.classList.toggle('cc-stamina-low', f < 0.34);
    c.stam.classList.toggle('cc-stamina-out', f <= 0.02);
  }

  setCharge(slot: number, v: number): void {
    const c = this.chargeEls[slot];
    if (!c) return;
    if (v < 0) {
      // the cluster stays up for the stamina bar; just empty the ring
      c.fill.style.background = 'conic-gradient(rgba(255,255,255,0.14) 0deg, rgba(255,255,255,0.14) 360deg)';
      c.wrap.classList.remove('cc-charge-full');
      return;
    }
    c.wrap.hidden = false;
    const clamped = Math.min(1, Math.max(0, v));
    const deg = clamped * 360;
    // green -> yellow -> hot red as it fills
    const hue = 120 - clamped * 105;
    const col = `hsl(${hue} 95% 55%)`;
    c.fill.style.background =
      `conic-gradient(${col} ${deg}deg, rgba(255,255,255,0.14) ${deg}deg)`;
    c.wrap.classList.toggle('cc-charge-full', clamped >= 0.98);
  }
}
