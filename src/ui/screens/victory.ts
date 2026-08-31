import type { CharacterDef, MatchResult, MenuAction } from '../../core/types';
import { ROSTER_BY_ID } from '../../core/roster';
import type { Screen, UiCtx } from '../context';
import { div, el, initials, starSVG } from '../dom';

/* ------------------------------------------------------------------ */
/* Victory screen: GAME, SET & MATCH! + confetti.                      */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = ['#ff4646', '#3d8bff', '#ffd42a', '#3ecf5a', '#b98cff', '#ff9d5c', '#ffffff'];

function portraitEl(def: CharacterDef): HTMLElement {
  const wrap = div('cc-victory-portrait');
  const fallback = div('cc-victory-portrait-fallback', initials(def.name));
  fallback.style.background = `radial-gradient(circle at 35% 30%, ${def.color}, #222 160%)`;
  const img = el('img', 'cc-victory-img') as HTMLImageElement;
  img.alt = def.name;
  img.src = `portraits/${def.id}.png`;
  img.addEventListener('error', () => img.remove());
  wrap.appendChild(fallback);
  wrap.appendChild(img);
  wrap.style.borderColor = def.color;
  return wrap;
}

export interface VictoryApi extends Screen {
  start(result: MatchResult): void;
}

export function createVictoryScreen(ctx: UiCtx): VictoryApi {
  const root = div('cc-screen cc-victory');

  const confetti = div('cc-confetti');
  for (let i = 0; i < 70; i++) {
    const c = div('cc-confetti-bit');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    c.style.animationDelay = `${(Math.random() * 3).toFixed(2)}s`;
    c.style.animationDuration = `${(2.6 + Math.random() * 2.4).toFixed(2)}s`;
    c.style.setProperty('--drift', `${(Math.random() * 120 - 60).toFixed(0)}px`);
    c.style.setProperty('--spin', `${(Math.random() * 720 - 360).toFixed(0)}deg`);
    confetti.appendChild(c);
  }
  root.appendChild(confetti);

  const center = div('cc-victory-center');
  // generated golden burst slowly spinning behind the winner card
  const burst = el('img', 'cc-victory-burst') as HTMLImageElement;
  burst.alt = '';
  burst.src = 'images/victory-burst.png';
  burst.addEventListener('load', () => burst.classList.add('cc-img-ready'));
  burst.addEventListener('error', () => burst.remove());
  center.appendChild(burst);
  const heading = div('cc-victory-heading', 'GAME, SET & MATCH!');
  center.appendChild(heading);

  const starL = div('cc-victory-deco cc-victory-deco-l');
  starL.innerHTML = starSVG(64);
  const starR = div('cc-victory-deco cc-victory-deco-r');
  starR.innerHTML = starSVG(64);
  root.appendChild(starL);
  root.appendChild(starR);

  const card = div('cc-victory-card');
  const portraits = div('cc-victory-portraits');
  const winnerLabel = div('cc-victory-winner');
  const winsTag = div('cc-victory-wins', 'WINS!');
  const score = div('cc-victory-score');
  card.appendChild(portraits);
  card.appendChild(winnerLabel);
  card.appendChild(winsTag);
  card.appendChild(score);
  center.appendChild(card);

  const press = div('cc-press-start cc-victory-press', 'Press Ⓐ to continue');
  center.appendChild(press);
  root.appendChild(center);

  root.addEventListener('click', () => done());

  let armed = false;
  function done(): void {
    if (!armed) return;
    armed = false;
    ctx.sfx('menu_confirm');
    ctx.cb.onVictoryDone();
  }

  return {
    el: root,

    start(result: MatchResult) {
      const winner = result.teams[result.winnerTeam];
      portraits.innerHTML = '';
      for (const id of winner.characterIds) {
        const def = ROSTER_BY_ID.get(id);
        if (def) portraits.appendChild(portraitEl(def));
      }
      winnerLabel.textContent = winner.label;
      winnerLabel.style.color = winner.color;
      score.textContent =
        `${result.finalGames[result.winnerTeam]} – ${result.finalGames[1 - result.winnerTeam]}`;
      armed = false;
      // small arming delay so a mashed button doesn't skip the celebration
      window.setTimeout(() => { armed = true; }, 700);
    },

    handleMenu(action: MenuAction) {
      if (action === 'confirm' || action === 'start') done();
    },
  };
}
