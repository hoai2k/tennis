import type { CourtThemeDef, MenuAction } from '../../core/types';
import type { Screen, UiCtx } from '../context';
import { div, el, pop } from '../dom';

/* ------------------------------------------------------------------ */
/* Court + rules select. CourtThemeDef carries no colors, so the UI    */
/* keeps its own palette per theme id (see NOTES.md).                  */
/* ------------------------------------------------------------------ */

interface CourtLook {
  surface: string;
  apron: string;
  line: string;
  sky: string;
  blurb: string;
}

const COURT_LOOKS: Record<string, CourtLook> = {
  shibuya: {
    surface: '#2f6fc4', apron: '#3fa66b', line: '#ffffff',
    sky: 'linear-gradient(180deg,#ffd98a,#ff9d5c)',
    blurb: 'Hard court · big city bounce',
  },
  nevarro: {
    surface: '#c96a3b', apron: '#8a4a2b', line: '#ffe9d0',
    sky: 'linear-gradient(180deg,#f3c17e,#c97a4a)',
    blurb: 'Volcanic clay · slow & gritty',
  },
  night: {
    surface: '#3a2a5e', apron: '#241a3e', line: '#c98aff',
    sky: 'linear-gradient(180deg,#1a1030,#402a6a)',
    blurb: 'Cursed energy · fast & bouncy',
  },
};

const FALLBACK_LOOK: CourtLook = {
  surface: '#3a7a4e', apron: '#2a5a3a', line: '#ffffff',
  sky: 'linear-gradient(180deg,#9ad0ff,#5a9ae0)',
  blurb: 'Exhibition court',
};

function courtPreview(look: CourtLook): HTMLElement {
  const p = div('cc-court-preview');
  p.style.background = look.sky;
  const apron = div('cc-court-apron');
  apron.style.background = look.apron;
  const surf = div('cc-court-surface');
  surf.style.background = look.surface;
  surf.style.setProperty('--line', look.line);
  // court lines drawn with nested divs
  surf.appendChild(div('cc-court-line cc-court-line-mid'));
  surf.appendChild(div('cc-court-line cc-court-line-svc'));
  const net = div('cc-court-net');
  apron.appendChild(surf);
  apron.appendChild(net);
  p.appendChild(apron);
  return p;
}

export interface CourtSelectApi extends Screen {
  start(themes: CourtThemeDef[], showTeamOption: boolean): void;
}

export function createCourtSelect(ctx: UiCtx): CourtSelectApi {
  const root = div('cc-screen cc-courtsel');
  root.appendChild(div('cc-bg-stripes'));
  root.appendChild(div('cc-screen-heading', 'PICK YOUR COURT'));

  const center = div('cc-courtsel-center');
  const cardsRow = div('cc-court-cards');
  const gamesRow = div('cc-rule-row');
  const teamsRow = div('cc-rule-row');
  const playRow = div('cc-play-row');
  center.appendChild(cardsRow);
  center.appendChild(gamesRow);
  center.appendChild(teamsRow);
  center.appendChild(playRow);
  center.appendChild(div('cc-menu-hint', '✚ move · Ⓐ confirm · Ⓑ back'));
  root.appendChild(center);

  // state
  let themes: CourtThemeDef[] = [];
  let showTeams = false;
  let courtIdx = 0;
  let gamesIdx = 0; // index into GAMES
  let teamsIdx = 0; // 0 = side by side, 1 = rivals
  let row = 0; // 0 courts, 1 games, 2 teams(optional), 3 play
  const GAMES: (1 | 2 | 4)[] = [1, 2, 4];

  let courtCards: HTMLElement[] = [];
  let gameOpts: HTMLElement[] = [];
  let teamOpts: HTMLElement[] = [];
  let playBtn: HTMLElement;

  playBtn = el('button', 'cc-btn cc-play-btn', 'PLAY!');
  playBtn.addEventListener('click', () => { row = rowCount() - 1; refresh(); confirmPlay(); });
  playRow.appendChild(playBtn);

  function rowCount(): number {
    return showTeams ? 4 : 3;
  }
  /** map nav row -> logical row (skips teams when hidden) */
  function logicalRow(): 'courts' | 'games' | 'teams' | 'play' {
    if (row === 0) return 'courts';
    if (row === 1) return 'games';
    if (showTeams && row === 2) return 'teams';
    return 'play';
  }

  function build(): void {
    cardsRow.innerHTML = '';
    courtCards = [];
    themes.forEach((t, i) => {
      const look = COURT_LOOKS[t.id] ?? FALLBACK_LOOK;
      const card = div('cc-court-card');
      card.appendChild(courtPreview(look));
      card.appendChild(div('cc-court-name', t.name));
      card.appendChild(div('cc-court-blurb', look.blurb));
      card.addEventListener('click', () => {
        courtIdx = i; row = 0; refresh(); ctx.sfx('menu_move');
      });
      cardsRow.appendChild(card);
      courtCards.push(card);
    });

    gamesRow.innerHTML = '';
    gamesRow.appendChild(div('cc-rule-label', 'GAMES TO WIN'));
    const gBox = div('cc-rule-opts');
    gameOpts = GAMES.map((g, i) => {
      const b = el('button', 'cc-rule-opt', String(g));
      b.addEventListener('click', () => {
        gamesIdx = i; row = 1; refresh(); ctx.sfx('menu_move');
      });
      gBox.appendChild(b);
      return b;
    });
    gamesRow.appendChild(gBox);

    teamsRow.innerHTML = '';
    teamsRow.hidden = !showTeams;
    teamOpts = [];
    if (showTeams) {
      teamsRow.appendChild(div('cc-rule-label', 'TEAMS'));
      const tBox = div('cc-rule-opts');
      teamOpts = ['SIDE BY SIDE', 'RIVALS'].map((o, i) => {
        const b = el('button', 'cc-rule-opt cc-rule-opt-wide', o);
        b.addEventListener('click', () => {
          teamsIdx = i; row = 2; refresh(); ctx.sfx('menu_move');
        });
        tBox.appendChild(b);
        return b;
      });
      teamsRow.appendChild(tBox);
    }
    refresh();
  }

  function refresh(): void {
    const lr = logicalRow();
    courtCards.forEach((c, i) => {
      c.classList.toggle('cc-selected', i === courtIdx);
      c.classList.toggle('cc-focus', lr === 'courts' && i === courtIdx);
    });
    gameOpts.forEach((o, i) => {
      o.classList.toggle('cc-on', i === gamesIdx);
      o.classList.toggle('cc-focus', lr === 'games' && i === gamesIdx);
    });
    teamOpts.forEach((o, i) => {
      o.classList.toggle('cc-on', i === teamsIdx);
      o.classList.toggle('cc-focus', lr === 'teams' && i === teamsIdx);
    });
    playBtn.classList.toggle('cc-focus', lr === 'play');
  }

  function confirmPlay(): void {
    ctx.sfx('menu_confirm');
    pop(playBtn, 'cc-pressed');
    const theme = themes[courtIdx];
    if (!theme) return;
    ctx.cb.onCourtConfirmed(theme, GAMES[gamesIdx], showTeams && teamsIdx === 1);
  }

  return {
    el: root,

    start(t: CourtThemeDef[], showTeamOption: boolean) {
      themes = t;
      showTeams = showTeamOption;
      courtIdx = 0;
      gamesIdx = 0;
      teamsIdx = 0;
      row = 0;
      build();
    },

    handleMenu(action: MenuAction) {
      const lr = logicalRow();
      if (action === 'up') {
        row = (row + rowCount() - 1) % rowCount();
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'down') {
        row = (row + 1) % rowCount();
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'left' || action === 'right') {
        const d = action === 'left' ? -1 : 1;
        if (lr === 'courts' && themes.length) {
          courtIdx = (courtIdx + themes.length + d) % themes.length;
        } else if (lr === 'games') {
          gamesIdx = (gamesIdx + GAMES.length + d) % GAMES.length;
        } else if (lr === 'teams') {
          teamsIdx = (teamsIdx + 2 + d) % 2;
        }
        refresh(); ctx.sfx('menu_move');
      } else if (action === 'confirm' || action === 'start') {
        if (lr === 'play') {
          confirmPlay();
        } else {
          // confirm on any other row hops down a row (Mario-Tennis flow)
          row = (row + 1) % rowCount();
          refresh(); ctx.sfx('menu_move');
        }
      } else if (action === 'back') {
        ctx.sfx('menu_back');
        ctx.nav.toMainMenu();
      }
    },
  };
}
