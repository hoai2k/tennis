import type { MenuAction } from '../../core/types';
import type { Screen, UiCtx } from '../context';
import { ballSVG, div, el, starSVG } from '../dom';

/* ------------------------------------------------------------------ */
/* Title screen: arched chunky logo, cursed aura, PRESS START.         */
/* ------------------------------------------------------------------ */

/** Build one arched word: each letter its own span with rotation/offset. */
function archedWord(word: string, cls: string, ballIndex = -1): HTMLElement {
  const w = div(`cc-logo-word ${cls}`);
  const n = word.length;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1); // 0..1
    const arc = Math.sin(t * Math.PI); // 0..1..0
    const rot = (t - 0.5) * 14; // degrees
    let letterEl: HTMLElement;
    if (i === ballIndex) {
      letterEl = el('span', 'cc-logo-letter cc-logo-ball');
      letterEl.innerHTML = ballSVG(72, 'cc-logo-ball-svg');
    } else {
      letterEl = el('span', 'cc-logo-letter', word[i]);
    }
    letterEl.style.transform = `translateY(${(-arc * 22).toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
    letterEl.style.animationDelay = `${(i * 0.09).toFixed(2)}s`;
    w.appendChild(letterEl);
  }
  return w;
}

export function createTitleScreen(ctx: UiCtx): Screen {
  const root = div('cc-screen cc-title');
  // generated stadium art behind the striped gradient (fades in when it loads)
  const bgImg = el('img', 'cc-title-bgimg') as HTMLImageElement;
  bgImg.alt = '';
  bgImg.src = 'images/title-bg.jpg';
  bgImg.addEventListener('load', () => bgImg.classList.add('cc-img-ready'));
  bgImg.addEventListener('error', () => bgImg.remove());
  root.appendChild(bgImg);
  root.appendChild(div('cc-bg-stripes'));

  const center = div('cc-title-center');

  // floating decorative stars
  const deco = div('cc-title-deco');
  for (let i = 0; i < 6; i++) {
    const s = div('cc-title-star');
    s.innerHTML = starSVG(26 + (i % 3) * 14, i % 2 ? '#ffd42a' : '#b98cff');
    s.style.left = `${8 + i * 15.5}%`;
    s.style.top = `${i % 2 ? 12 + i * 3 : 66 + i * 2}%`;
    s.style.animationDelay = `${i * 0.55}s`;
    deco.appendChild(s);
  }
  root.appendChild(deco);

  const logo = div('cc-logo');
  const aura = div('cc-logo-aura');
  logo.appendChild(aura);
  logo.appendChild(archedWord('CURSED', 'cc-logo-cursed'));
  logo.appendChild(archedWord('COURT', 'cc-logo-court', 1)); // ball as the O
  // generated logo art replaces the CSS lettering once it loads
  const logoImg = el('img', 'cc-logo-img') as HTMLImageElement;
  logoImg.alt = 'CURSED COURT';
  logoImg.src = 'images/logo.png';
  logoImg.addEventListener('load', () => logo.classList.add('cc-logo-has-img'));
  logoImg.addEventListener('error', () => logoImg.remove());
  logo.appendChild(logoImg);
  center.appendChild(logo);

  center.appendChild(div('cc-title-sub', 'a JJK × Mandalorian tennis showdown'));

  const press = div('cc-press-start', 'PRESS  START');
  center.appendChild(press);

  root.appendChild(center);
  root.appendChild(div('cc-title-foot', '© CURSED COURT tennis federation'));

  const advance = (): void => {
    ctx.sfx('menu_confirm');
    ctx.cb.onTitleAdvance();
  };
  root.addEventListener('click', advance);

  return {
    el: root,
    handleMenu(_action: MenuAction) {
      advance();
    },
  };
}
