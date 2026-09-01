import type { CharacterDef, CharacterId, ControlSource, MenuAction } from '../../core/types';
import { ROSTER } from '../../core/roster';
import type { Screen, UiCtx } from '../context';
import { CPU_COLOR, PAD_COLORS, STYLE_BADGE, div, el, initials, pop } from '../dom';

/* ------------------------------------------------------------------ */
/* Character select: Mario-Tennis-style grid, multi-cursor,            */
/* CPU picking phase, side info panel + slot roster.                   */
/* ------------------------------------------------------------------ */

const COLS = 7;
/** grid index of the RANDOM tile (sits after the roster) */
const RANDOM_IDX = ROSTER.length;
const GRID_TOTAL = ROSTER.length + 1;

/** random pick, preferring characters nobody has taken yet — three CPUs all
 *  rolling the same fighter reads as a bug even when it is honest chance */
function randomCharacterId(taken: ReadonlySet<CharacterId>): CharacterId {
  const fresh = ROSTER.filter((c) => !taken.has(c.id));
  const pool = fresh.length ? fresh : ROSTER;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

interface HumanCursor {
  pad: number;
  grid: number;
  locked: boolean;
  /** resolved at lock time — the RANDOM tile rolls a concrete character */
  pick?: CharacterId;
  el: HTMLElement; // cursor frame element (re-parented between cards)
}

export interface CharSelectApi extends Screen {
  start(activePads: number[], mode: 'singles' | 'doubles'): void;
  padJoined(padIndex: number): void;
}

export function createCharSelect(ctx: UiCtx): CharSelectApi {
  const root = div('cc-screen cc-charsel');
  root.appendChild(div('cc-bg-stripes'));

  root.appendChild(div('cc-screen-heading cc-charsel-heading', 'CHOOSE YOUR PLAYER'));

  const layout = div('cc-charsel-layout');
  const gridWrap = div('cc-charsel-gridwrap');
  const grid = div('cc-charsel-grid');
  gridWrap.appendChild(grid);
  const side = div('cc-charsel-side');
  layout.appendChild(gridWrap);
  layout.appendChild(side);
  root.appendChild(layout);

  // ------- grid cards -------
  const cards: HTMLElement[] = [];
  ROSTER.forEach((def, i) => {
    const card = div(`cc-char-card cc-series-${def.series}`);
    card.dataset.grid = String(i);
    const port = div('cc-char-portrait');
    port.appendChild(portraitEl(def, 'cc-char-img'));
    card.appendChild(port);
    const name = div('cc-char-name', shortName(def));
    card.appendChild(name);
    const badge = div('cc-char-badge', STYLE_BADGE[def.style].icon);
    badge.title = STYLE_BADGE[def.style].label;
    card.appendChild(badge);
    card.addEventListener('click', () => onCardClick(i));
    card.addEventListener('mouseenter', () => showInfo(def));
    grid.appendChild(card);
    cards.push(card);
  });

  // ------- RANDOM tile: the default pick, so confirming straight away
  // gives you (or the CPU) a surprise character -------
  {
    const card = div('cc-char-card cc-char-random');
    card.dataset.grid = String(RANDOM_IDX);
    const port = div('cc-char-portrait');
    port.appendChild(div('cc-char-random-mark', '?'));
    card.appendChild(port);
    card.appendChild(div('cc-char-name', 'Random'));
    card.appendChild(div('cc-char-badge', '\u2753'));
    card.addEventListener('click', () => onCardClick(RANDOM_IDX));
    card.addEventListener('mouseenter', () => showInfoFor(RANDOM_IDX));
    grid.appendChild(card);
    cards.push(card);
  }

  // ------- side panel: info + slots -------
  const info = div('cc-charsel-info');
  const infoPortrait = div('cc-info-portrait');
  const infoName = div('cc-info-name');
  const infoBadge = div('cc-info-badge');
  const statsBox = div('cc-info-stats');
  const statBars: Record<string, HTMLElement[]> = {};
  for (const stat of ['power', 'speed', 'spin', 'reach'] as const) {
    const row = div('cc-stat-row');
    row.appendChild(div('cc-stat-label', stat.toUpperCase()));
    const bar = div('cc-stat-bar');
    statBars[stat] = [];
    for (let i = 0; i < 5; i++) {
      const seg = div('cc-stat-seg');
      statBars[stat].push(seg);
      bar.appendChild(seg);
    }
    row.appendChild(bar);
    statsBox.appendChild(row);
  }
  const infoTagline = div('cc-info-tagline');
  const infoTop = div('cc-info-top');
  infoTop.appendChild(infoPortrait);
  const infoTitle = div('cc-info-title');
  infoTitle.appendChild(infoName);
  infoTitle.appendChild(infoBadge);
  infoTop.appendChild(infoTitle);
  info.appendChild(infoTop);
  info.appendChild(statsBox);
  info.appendChild(infoTagline);
  side.appendChild(info);

  const slotsBox = div('cc-charsel-slots');
  side.appendChild(slotsBox);

  const hint = div('cc-menu-hint cc-charsel-hint', 'Move: ✚ / stick · Ⓐ pick · Ⓑ undo');
  side.appendChild(hint);

  // flourish overlay
  const flourish = div('cc-getready');
  flourish.appendChild(div('cc-getready-text', 'GET READY!'));
  flourish.hidden = true;
  root.appendChild(flourish);

  // ------------------------------ state ------------------------------
  let mode: 'singles' | 'doubles' = 'singles';
  let totalSlots = 2;
  let humans: HumanCursor[] = []; // kept sorted by pad index
  let cpuPicks: CharacterId[] = [];
  let phase: 'humans' | 'cpu' | 'done' = 'humans';
  let cpuGrid = RANDOM_IDX;
  let cpuCursorEl: HTMLElement | null = null;
  let doneTimer: number | undefined;

  function shortName(def: CharacterDef): string {
    return def.name.split(' ')[0] === 'Cad' || def.name.split(' ')[0] === 'Din'
      ? def.name
      : def.name.split(' ')[0];
  }

  function portraitEl(def: CharacterDef, cls: string): HTMLElement {
    const wrap = div(`${cls}-wrap`);
    const fallback = div(`${cls}-fallback`, initials(def.name));
    fallback.style.background =
      `radial-gradient(circle at 35% 30%, ${def.color} 0%, ${shade(def.color, -35)} 100%)`;
    const img = el('img', cls) as HTMLImageElement;
    img.alt = def.name;
    img.src = `portraits/${def.id}.png`;
    img.addEventListener('error', () => { img.remove(); });
    wrap.appendChild(fallback);
    wrap.appendChild(img);
    return wrap;
  }

  function shade(hex: string, amt: number): string {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number): number => Math.min(255, Math.max(0, v + amt));
    const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
    return `rgb(${r},${g},${b})`;
  }

  /** info panel for any grid index, including the RANDOM tile */
  function showInfoFor(gridIdx: number): void {
    if (gridIdx !== RANDOM_IDX) { showInfo(ROSTER[gridIdx]); return; }
    info.className = 'cc-charsel-info cc-info-random';
    infoPortrait.innerHTML = '';
    infoPortrait.appendChild(div('cc-char-random-mark cc-info-random-mark', '?'));
    infoName.textContent = 'Random';
    infoBadge.textContent = '\u2753 Surprise';
    infoBadge.style.background = '#6a4bbf';
    for (const stat of ['power', 'speed', 'spin', 'reach'] as const) {
      statBars[stat].forEach((seg) => { seg.classList.remove('cc-on'); seg.style.background = ''; });
    }
    infoTagline.textContent = '“Let the court decide.”';
  }

  function showInfo(def: CharacterDef): void {
    info.className = `cc-charsel-info cc-series-${def.series}`;
    infoPortrait.innerHTML = '';
    infoPortrait.appendChild(portraitEl(def, 'cc-info-img'));
    infoName.textContent = def.name;
    const b = STYLE_BADGE[def.style];
    infoBadge.textContent = `${b.icon} ${b.label}`;
    infoBadge.style.background = def.color;
    for (const stat of ['power', 'speed', 'spin', 'reach'] as const) {
      const v = def.stats[stat];
      statBars[stat].forEach((seg, i) => {
        seg.classList.toggle('cc-on', i < v);
        seg.style.background = i < v
          ? `linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.08) 55%), ${def.color}`
          : '';
      });
    }
    infoTagline.textContent = `“${def.tagline}”`;
  }

  // ------------------------- cursors & slots -------------------------

  function makeCursorEl(label: string, color: string, tagPos: number): HTMLElement {
    const c = div('cc-cursor');
    c.style.setProperty('--cursor-color', color);
    const tag = div(`cc-cursor-tag cc-cursor-tag-${tagPos % 4}`, label);
    c.appendChild(tag);
    return c;
  }

  function placeCursor(cur: HTMLElement, gridIdx: number): void {
    const card = cards[gridIdx];
    // stack offset: count existing cursors on this card
    const existing = card.querySelectorAll('.cc-cursor').length;
    cur.style.setProperty('--stack', String(existing));
    card.appendChild(cur);
    pop(cur, 'cc-cursor-pop');
    restack(card);
  }

  function restack(card: HTMLElement): void {
    const curs = card.querySelectorAll<HTMLElement>('.cc-cursor');
    curs.forEach((c, i) => c.style.setProperty('--stack', String(i)));
  }

  /** tell the game which character is under a cursor, so it can start
   *  pulling that model down while the player is still deciding */
  function noteHover(gridIdx: number): void {
    const def = ROSTER[gridIdx];
    if (def) ctx.cb.onCharacterHover?.(def.id);
  }

  /** resolve a grid index to a concrete character (random tile rolls now) */
  function pickAt(gridIdx: number): CharacterId {
    if (gridIdx !== RANDOM_IDX) return ROSTER[gridIdx].id;
    const taken = new Set<CharacterId>(cpuPicks);
    for (const h of humans) if (h.pick) taken.add(h.pick);
    return randomCharacterId(taken);
  }

  function moveCursorTo(cur: HumanCursor | 'cpu', gridIdx: number): void {
    if (cur === 'cpu') {
      const old = cpuCursorEl?.parentElement;
      cpuGrid = gridIdx;
      if (cpuCursorEl) placeCursor(cpuCursorEl, gridIdx);
      if (old) restack(old);
      showInfoFor(gridIdx);
      noteHover(gridIdx);
    } else {
      const old = cur.el.parentElement;
      cur.grid = gridIdx;
      placeCursor(cur.el, gridIdx);
      if (old) restack(old);
      showInfoFor(gridIdx);
      noteHover(gridIdx);
    }
  }

  function navGrid(g: number, action: MenuAction): number {
    const row = Math.floor(g / COLS);
    const col = g % COLS;
    const rowLen = (r: number): number => (r === 0 ? COLS : GRID_TOTAL - COLS);
    let nr = row, nc = col;
    if (action === 'left') nc = (col + rowLen(row) - 1) % rowLen(row);
    else if (action === 'right') nc = (col + 1) % rowLen(row);
    else if (action === 'up' || action === 'down') {
      nr = 1 - row;
      nc = Math.min(nc, rowLen(nr) - 1);
    }
    return nr * COLS + nc;
  }

  function slotLabels(): { label: string; color: string; human: boolean; pad?: number }[] {
    const out: { label: string; color: string; human: boolean; pad?: number }[] = [];
    humans.forEach((h, i) => {
      out.push({ label: `P${h.pad + 1}`, color: PAD_COLORS[h.pad] ?? '#fff', human: true, pad: h.pad });
      void i;
    });
    for (let i = humans.length; i < totalSlots; i++) {
      out.push({ label: `CPU ${i - humans.length + 1}`, color: CPU_COLOR, human: false });
    }
    return out;
  }

  function refreshSlots(): void {
    slotsBox.innerHTML = '';
    const labels = slotLabels();
    labels.forEach((s, i) => {
      const row = div('cc-slot-row');
      const chip = div('cc-slot-chip', s.label);
      chip.style.background = s.color;
      row.appendChild(chip);
      let picked: CharacterDef | undefined;
      let ready = false;
      if (s.human) {
        const h = humans.find((x) => x.pad === s.pad);
        if (h) {
          picked = ROSTER[h.grid];
          ready = h.locked;
        }
      } else {
        const cpuIdx = i - humans.length;
        if (cpuIdx < cpuPicks.length) {
          picked = ROSTER.find((r) => r.id === cpuPicks[cpuIdx]);
          ready = true;
        } else if (phase === 'cpu' && cpuIdx === cpuPicks.length) {
          picked = ROSTER[cpuGrid];
        }
      }
      row.appendChild(div('cc-slot-name', picked && (ready || s.human || phase === 'cpu') ? picked.name : '— — —'));
      const tag = div('cc-slot-ready', ready ? 'READY!' : '');
      if (ready) tag.classList.add('cc-on');
      row.appendChild(tag);
      if (i === Math.ceil(totalSlots / 2) - 1 && totalSlots > 1) row.classList.add('cc-slot-vs');
      slotsBox.appendChild(row);
    });
  }

  function driverPad(): number {
    return humans.length ? humans[0].pad : 0;
  }

  function enterCpuPhaseOrFinish(): void {
    if (cpuSlotCount() <= cpuPicks.length) {
      finish();
      return;
    }
    phase = 'cpu';
    cpuGrid = RANDOM_IDX;
    if (!cpuCursorEl) {
      cpuCursorEl = makeCursorEl(`CPU ${cpuPicks.length + 1}`, CPU_COLOR, 3);
      cpuCursorEl.classList.add('cc-cursor-cpu');
    }
    updateCpuCursorLabel();
    placeCursor(cpuCursorEl, cpuGrid);
    showInfoFor(cpuGrid);
    refreshSlots();
  }

  function updateCpuCursorLabel(): void {
    const tag = cpuCursorEl?.querySelector('.cc-cursor-tag');
    if (tag) tag.textContent = `CPU ${cpuPicks.length + 1}`;
  }

  function cpuSlotCount(): number {
    return totalSlots - humans.length;
  }

  function removeCpuCursor(): void {
    if (cpuCursorEl) {
      const parent = cpuCursorEl.parentElement;
      cpuCursorEl.remove();
      if (parent) restack(parent);
      cpuCursorEl = null;
    }
  }

  function finish(): void {
    phase = 'done';
    removeCpuCursor();
    refreshSlots();
    flourish.hidden = false;
    pop(flourish, 'cc-getready-anim');
    ctx.sfx('crowd_cheer');
    doneTimer = window.setTimeout(() => {
      flourish.hidden = true;
      const slots: { characterId: CharacterId; control: ControlSource }[] = [];
      for (const h of humans) {
        slots.push({ characterId: h.pick ?? pickAt(h.grid), control: h.pad as ControlSource });
      }
      for (const id of cpuPicks) slots.push({ characterId: id, control: 'ai' });
      ctx.cb.onCharactersConfirmed(slots);
    }, 1200);
  }

  function cancelDone(): void {
    if (doneTimer !== undefined) {
      window.clearTimeout(doneTimer);
      doneTimer = undefined;
    }
    flourish.hidden = true;
  }

  function allHumansLocked(): boolean {
    return humans.length > 0 && humans.every((h) => h.locked);
  }

  function afterHumanLock(): void {
    if (!allHumansLocked()) return;
    if (cpuSlotCount() > 0) enterCpuPhaseOrFinish();
    else finish();
  }

  // ----------------------------- actions -----------------------------

  function humanHandle(h: HumanCursor, action: MenuAction): void {
    if (h.locked) {
      if (action === 'back') {
        h.locked = false;
        h.pick = undefined;
        h.el.classList.remove('cc-cursor-locked');
        ctx.sfx('menu_back');
        refreshSlots();
      }
      return;
    }
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      moveCursorTo(h, navGrid(h.grid, action));
      ctx.sfx('menu_move');
      refreshSlots();
    } else if (action === 'confirm') {
      h.locked = true;
      h.pick = pickAt(h.grid);
      h.el.classList.add('cc-cursor-locked');
      pop(cards[h.grid], 'cc-card-pop');
      ctx.sfx('menu_confirm');
      // definitely needed now — start building this avatar for real
      ctx.cb.onCharacterLocked?.(h.pick);
      refreshSlots();
      afterHumanLock();
    } else if (action === 'back') {
      // nothing picked by this pad -> leave the screen entirely
      ctx.sfx('menu_back');
      ctx.nav.toMainMenu();
    }
  }

  function cpuHandle(action: MenuAction): void {
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      moveCursorTo('cpu', navGrid(cpuGrid, action));
      ctx.sfx('menu_move');
      refreshSlots();
    } else if (action === 'confirm') {
      const cpuPick = pickAt(cpuGrid);
      cpuPicks.push(cpuPick);
      pop(cards[cpuGrid], 'cc-card-pop');
      ctx.sfx('menu_confirm');
      ctx.cb.onCharacterLocked?.(cpuPick);
      if (cpuPicks.length >= cpuSlotCount()) {
        finish();
      } else {
        updateCpuCursorLabel();
        refreshSlots();
      }
    } else if (action === 'back') {
      ctx.sfx('menu_back');
      if (cpuPicks.length > 0) {
        cpuPicks.pop();
        updateCpuCursorLabel();
        refreshSlots();
      } else {
        // unwind to human phase: driver un-confirms
        phase = 'humans';
        removeCpuCursor();
        const d = humans[0];
        if (d) {
          d.locked = false;
          d.el.classList.remove('cc-cursor-locked');
        }
        refreshSlots();
      }
    }
  }

  function onCardClick(gridIdx: number): void {
    if (phase === 'cpu') {
      moveCursorTo('cpu', gridIdx);
      refreshSlots();
      cpuHandle('confirm');
      return;
    }
    if (phase !== 'humans') return;
    const h = humans.find((x) => !x.locked) ?? humans[0];
    if (!h || h.locked) return;
    moveCursorTo(h, gridIdx);
    refreshSlots();
    humanHandle(h, 'confirm');
  }

  // ------------------------------ api --------------------------------

  function addHuman(pad: number, startGrid: number): void {
    const cur: HumanCursor = {
      pad,
      grid: startGrid,
      locked: false,
      el: makeCursorEl(`P${pad + 1}`, PAD_COLORS[pad] ?? '#fff', pad),
    };
    humans.push(cur);
    humans.sort((a, b) => a.pad - b.pad);
    placeCursor(cur.el, startGrid);
  }

  return {
    el: root,

    start(activePads: number[], m: 'singles' | 'doubles') {
      cancelDone();
      mode = m;
      void mode;
      totalSlots = m === 'singles' ? 2 : 4;
      // reset
      for (const h of humans) h.el.remove();
      humans = [];
      cpuPicks = [];
      removeCpuCursor();
      phase = 'humans';
      const pads = [...activePads].sort((a, b) => a - b).slice(0, totalSlots);
      pads.forEach((p) => addHuman(p, RANDOM_IDX));
      refreshSlots();
      showInfoFor(humans[0]?.grid ?? RANDOM_IDX);
      if (humans.length === 0) {
        // no pads yet — wait for padJoined; still show info panel
        phase = 'humans';
      }
    },

    padJoined(padIndex: number) {
      if (phase === 'done') return;
      if (humans.some((h) => h.pad === padIndex)) return;
      if (humans.length >= totalSlots) return;
      // a new human invalidates any CPU picking in progress
      if (phase === 'cpu') {
        phase = 'humans';
        cpuPicks = [];
        removeCpuCursor();
      }
      addHuman(padIndex, RANDOM_IDX);
      ctx.sfx('menu_confirm');
      refreshSlots();
    },

    handleMenu(action: MenuAction, padIndex: number) {
      if (phase === 'done') return;
      if (action === 'start') action = 'confirm';
      if (phase === 'cpu') {
        const h = humans.find((x) => x.pad === padIndex);
        if (padIndex === driverPad() || !h) {
          cpuHandle(action);
        } else if (action === 'back' && h) {
          // another pad backs out of its own lock -> cancel CPU picking
          phase = 'humans';
          cpuPicks = [];
          removeCpuCursor();
          h.locked = false;
          h.el.classList.remove('cc-cursor-locked');
          ctx.sfx('menu_back');
          refreshSlots();
        }
        return;
      }
      let h = humans.find((x) => x.pad === padIndex);
      if (!h) {
        // forgiving: an unknown pad pressing a button joins mid-screen
        if (humans.length < totalSlots && padIndex >= 0 && padIndex < 4) {
          addHuman(padIndex, RANDOM_IDX);
          refreshSlots();
          h = humans.find((x) => x.pad === padIndex);
        }
        if (!h) return;
        if (action === 'confirm') return; // joining consumed the press
      }
      humanHandle(h, action);
    },

    onHide() {
      cancelDone();
    },
  };
}
