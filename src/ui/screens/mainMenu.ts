import type { MenuAction } from '../../core/types';
import type { Screen, UiCtx } from '../context';
import { ballSVG, div, el, pop } from '../dom';

/* ------------------------------------------------------------------ */
/* Main menu: SINGLES / DOUBLES.                                       */
/* ------------------------------------------------------------------ */

export function createMainMenu(ctx: UiCtx): Screen {
  const root = div('cc-screen cc-mainmenu');
  root.appendChild(div('cc-bg-stripes'));

  const center = div('cc-mainmenu-center');
  center.appendChild(div('cc-screen-heading', 'EXHIBITION'));

  const items: { label: string; sub: string; mode: 'singles' | 'doubles' }[] = [
    { label: 'SINGLES', sub: '1 vs 1', mode: 'singles' },
    { label: 'DOUBLES', sub: '2 vs 2', mode: 'doubles' },
  ];
  let idx = 0;
  const btns: HTMLElement[] = [];
  const list = div('cc-mainmenu-list');

  const choose = (i: number): void => {
    idx = i;
    refresh();
    ctx.sfx('menu_confirm');
    pop(btns[i], 'cc-pressed');
    ctx.cb.onModeChosen(items[i].mode);
  };

  items.forEach((it, i) => {
    const b = el('button', 'cc-btn cc-mode-btn');
    const ball = div('cc-mode-ball');
    ball.innerHTML = ballSVG(44);
    b.appendChild(ball);
    const txt = div('cc-mode-text');
    txt.appendChild(div('cc-mode-label', it.label));
    txt.appendChild(div('cc-mode-sub', it.sub));
    b.appendChild(txt);
    b.addEventListener('click', () => choose(i));
    b.addEventListener('mouseenter', () => {
      if (idx !== i) { idx = i; refresh(); ctx.sfx('menu_move'); }
    });
    btns.push(b);
    list.appendChild(b);
  });
  center.appendChild(list);
  center.appendChild(div('cc-menu-hint', 'Ⓐ confirm · Ⓑ back'));
  root.appendChild(center);

  function refresh(): void {
    btns.forEach((b, i) => b.classList.toggle('cc-focus', i === idx));
  }
  refresh();

  return {
    el: root,
    handleMenu(action: MenuAction) {
      if (action === 'up' || action === 'down') {
        idx = (idx + 1) % items.length;
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'confirm' || action === 'start') {
        choose(idx);
      } else if (action === 'back') {
        ctx.sfx('menu_back');
        ctx.nav.toTitle();
      }
    },
  };
}
