import type { MenuAction } from '../core/types';
import { controllerDiagramSVG } from './controllerDiagram';
import type { Modal, UiCtx } from './context';
import { div, el, pop } from './dom';

/* ------------------------------------------------------------------ */
/* Modals: shared frame, pause menu, settings, instructions.           */
/* All are gamepad-first; mouse clicks also work.                      */
/* ------------------------------------------------------------------ */

function frame(title: string, cls: string): { root: HTMLElement; card: HTMLElement; body: HTMLElement } {
  const root = div(`cc-modal-backdrop ${cls}`);
  const card = div('cc-modal-card');
  const head = div('cc-modal-title', title);
  const body = div('cc-modal-body');
  card.appendChild(head);
  card.appendChild(body);
  root.appendChild(card);
  return { root, card, body };
}

/* ------------------------------- pause ---------------------------- */

export interface PauseMenuHooks {
  resume(): void;
  quit(): void;
}

export function createPauseMenu(ctx: UiCtx, hooks: PauseMenuHooks): Modal {
  const { root, body } = frame('PAUSED', 'cc-pause');
  const items = [
    { label: 'RESUME', act: () => hooks.resume() },
    { label: 'SETTINGS', act: () => ctx.openSettings() },
    { label: 'INSTRUCTIONS', act: () => ctx.openInstructions() },
    { label: 'QUIT TO MENU', act: () => hooks.quit() },
  ];
  let idx = 0;
  const btns: HTMLElement[] = [];
  const list = div('cc-pause-list');
  items.forEach((it, i) => {
    const b = el('button', 'cc-btn cc-pause-btn', it.label);
    b.addEventListener('click', () => {
      idx = i;
      refresh();
      ctx.sfx('menu_confirm');
      it.act();
    });
    b.addEventListener('mouseenter', () => {
      if (idx !== i) { idx = i; refresh(); ctx.sfx('menu_move'); }
    });
    btns.push(b);
    list.appendChild(b);
  });
  body.appendChild(list);

  function refresh(): void {
    btns.forEach((b, i) => b.classList.toggle('cc-focus', i === idx));
  }
  refresh();

  return {
    el: root,
    handleMenu(action: MenuAction) {
      if (action === 'up') {
        idx = (idx + items.length - 1) % items.length;
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'down') {
        idx = (idx + 1) % items.length;
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'confirm') {
        ctx.sfx('menu_confirm');
        pop(btns[idx], 'cc-pressed');
        items[idx].act();
      } else if (action === 'back' || action === 'start') {
        ctx.sfx('menu_back');
        hooks.resume();
      }
    },
  };
}

/* ------------------------------ settings --------------------------- */

interface SettingRow {
  el: HTMLElement;
  adjust(dir: -1 | 1): void;
  activate?(): void;
  refresh(): void;
}

export function createSettingsModal(ctx: UiCtx, close: () => void): Modal {
  const { root, body } = frame('SETTINGS', 'cc-settings');
  const rows: SettingRow[] = [];
  let idx = 0;

  function slider(label: string, get: () => number, set: (v: number) => void): SettingRow {
    const rowEl = div('cc-set-row');
    rowEl.appendChild(div('cc-set-label', label));
    const bar = div('cc-set-slider');
    const segs: HTMLElement[] = [];
    for (let i = 0; i < 10; i++) {
      const s = div('cc-set-seg');
      s.addEventListener('click', () => {
        focusRow(row);
        set((i + 1) / 10);
        row.refresh();
        ctx.commitSettings();
        ctx.sfx('menu_move');
      });
      segs.push(s);
      bar.appendChild(s);
    }
    const val = div('cc-set-value');
    rowEl.appendChild(bar);
    rowEl.appendChild(val);
    const row: SettingRow = {
      el: rowEl,
      adjust(dir) {
        set(Math.min(1, Math.max(0, Math.round((get() + dir * 0.1) * 10) / 10)));
        row.refresh();
        ctx.commitSettings();
        ctx.sfx('menu_move');
      },
      refresh() {
        const v = get();
        segs.forEach((s, i) => s.classList.toggle('cc-on', v >= (i + 1) / 10 - 0.001));
        val.textContent = `${Math.round(v * 100)}%`;
      },
    };
    row.refresh();
    return row;
  }

  function toggle(label: string, options: string[], get: () => number, set: (i: number) => void): SettingRow {
    const rowEl = div('cc-set-row');
    rowEl.appendChild(div('cc-set-label', label));
    const box = div('cc-set-toggle');
    const opts: HTMLElement[] = options.map((o, i) => {
      const b = el('button', 'cc-set-opt', o);
      b.addEventListener('click', () => {
        focusRow(row);
        set(i);
        row.refresh();
        ctx.commitSettings();
        ctx.sfx('menu_move');
      });
      box.appendChild(b);
      return b;
    });
    rowEl.appendChild(box);
    rowEl.appendChild(div('cc-set-value'));
    const row: SettingRow = {
      el: rowEl,
      adjust() {
        set((get() + 1) % options.length);
        row.refresh();
        ctx.commitSettings();
        ctx.sfx('menu_move');
      },
      refresh() {
        opts.forEach((b, i) => b.classList.toggle('cc-on', get() === i));
      },
    };
    row.refresh();
    return row;
  }

  rows.push(slider('MUSIC', () => ctx.settings.musicVolume, (v) => { ctx.settings.musicVolume = v; }));
  rows.push(slider('SFX', () => ctx.settings.sfxVolume, (v) => { ctx.settings.sfxVolume = v; }));
  rows.push(toggle('RUMBLE', ['ON', 'OFF'],
    () => (ctx.settings.rumble ? 0 : 1),
    (i) => { ctx.settings.rumble = i === 0; }));
  rows.push(toggle('CROWD', ['FULL', 'LIGHT'],
    () => (ctx.settings.crowdDensity === 'full' ? 0 : 1),
    (i) => { ctx.settings.crowdDensity = i === 0 ? 'full' : 'light'; }));
  rows.push(toggle('CAMERA', ['MULTI-VIEW', 'SINGLE'],
    () => (ctx.settings.cameraView === 'multi' ? 0 : 1),
    (i) => { ctx.settings.cameraView = i === 0 ? 'multi' : 'single'; }));
  rows.push(toggle('MECH RIGS', ['ORIGINAL', 'HUMANOID'],
    () => (ctx.settings.humanoidRigs ? 1 : 0),
    (i) => { ctx.settings.humanoidRigs = i === 1; }));

  // close button row
  const closeBtn = el('button', 'cc-btn cc-modal-close-btn', 'DONE');
  closeBtn.addEventListener('click', () => { ctx.sfx('menu_back'); close(); });
  const closeRow: SettingRow = {
    el: div('cc-set-row cc-set-row-close'),
    adjust() { /* no-op */ },
    activate() { ctx.sfx('menu_back'); close(); },
    refresh() { /* no-op */ },
  };
  closeRow.el.appendChild(closeBtn);
  rows.push(closeRow);

  for (const r of rows) body.appendChild(r.el);
  body.appendChild(div('cc-modal-hint', '⬆⬇ select · ⬅➡ adjust · Ⓑ close'));

  function focusRow(r: SettingRow): void {
    idx = rows.indexOf(r);
    refresh();
  }
  function refresh(): void {
    rows.forEach((r, i) => {
      r.el.classList.toggle('cc-focus', i === idx);
      if (r === closeRow) closeBtn.classList.toggle('cc-focus', i === idx);
    });
  }
  refresh();

  return {
    el: root,
    handleMenu(action: MenuAction) {
      if (action === 'up') {
        idx = (idx + rows.length - 1) % rows.length;
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'down') {
        idx = (idx + 1) % rows.length;
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'left') {
        rows[idx].adjust(-1);
      } else if (action === 'right') {
        rows[idx].adjust(1);
      } else if (action === 'confirm') {
        const r = rows[idx];
        if (r.activate) r.activate();
        else r.adjust(1);
      } else if (action === 'back' || action === 'start') {
        ctx.sfx('menu_back');
        close();
      }
    },
  };
}

/* ---------------------------- instructions ------------------------- */

export function createInstructionsModal(ctx: UiCtx, close: () => void): Modal {
  const { root, card, body } = frame('HOW TO PLAY', 'cc-instructions');
  card.classList.add('cc-modal-wide');

  const diagram = div('cc-controller-wrap');
  diagram.innerHTML = controllerDiagramSVG();
  body.appendChild(diagram);

  const tips = div('cc-instr-tips');
  const tipData: [string, string][] = [
    ['A then B', 'Drop Shot — dies at the net'],
    ['Hold LB', 'SPRINT — steer freely, swing any time'],
    ['Hold early', 'CHARGE the shot for extra power'],
    ['Swing from a ⭐', 'STAR SHOT!'],
    ['Serve', 'A to toss · A again at the peak = power serve'],
  ];
  for (const [k, v] of tipData) {
    const t = div('cc-instr-tip');
    t.appendChild(el('span', 'cc-instr-key', k));
    t.appendChild(el('span', 'cc-instr-desc', v));
    tips.appendChild(t);
  }
  body.appendChild(tips);

  const foot = div('cc-instr-foot');
  foot.appendChild(div('cc-instr-foot-line', 'Menus:  D-Pad / Stick move · Ⓐ confirm · Ⓑ back'));
  foot.appendChild(div('cc-instr-foot-line cc-instr-kbd',
    'Keyboard (dev):  WASD / Arrows move · J K L I = A B X Y · Shift = Sprint · Enter = Start'));
  body.appendChild(foot);

  const closeBtn = el('button', 'cc-btn cc-modal-close-btn cc-focus', 'GOT IT!');
  closeBtn.addEventListener('click', () => { ctx.sfx('menu_back'); close(); });
  const btnRow = div('cc-modal-btn-row');
  btnRow.appendChild(closeBtn);
  body.appendChild(btnRow);

  return {
    el: root,
    handleMenu(action: MenuAction) {
      if (action === 'confirm' || action === 'back' || action === 'start') {
        ctx.sfx('menu_back');
        close();
      }
    },
  };
}
