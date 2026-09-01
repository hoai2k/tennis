/* ============================================================
 * Cursed Court — music manager.
 *
 * Plain HTMLAudioElement playback with JS-driven volume ramps
 * (element.volume = trackFade * musicVolume), which keeps volume
 * control and 0.6s crossfades working on every browser without
 * tying music to the AudioContext / CORS.
 *
 * Modes:
 *   menu     -> "Cursed Court Rally 1" looping
 *   gameplay -> the chosen court's own theme(s), each once and in
 *               order, then an endless reshuffled bag of the house
 *               tracks PLUS that court's themes (no immediate
 *               repeats). Courts with no theme of their own open on
 *               "Cursed Court Rally 2" instead.
 *   victory  -> "Cursed Court Short" once
 *   off      -> fade everything out
 * ============================================================ */

import type { CourtTheme, MusicMode } from '../core/types';

const CROSSFADE_S = 0.6;
const TICK_MS = 30;

const FILE_MENU = 'Cursed Court Rally 1.mp3';
const FILE_GAMEPLAY_INTRO = 'Cursed Court Rally 2.mp3';
const FILE_VICTORY = 'Cursed Court Short.mp3';

/** always in the gameplay shuffle, whatever court is being played */
const HOUSE_TRACKS = [
  'Cursed Court Rally 2.mp3',
  'Mushroom Dash.mp3',
  'Cursed Court Interlude.mp3',
  'Cursed Court Rally 1.mp3',
];

/**
 * Per-court soundtrack. These play first (in order, once each) when a match
 * starts, and stay in the shuffle afterwards.
 *
 * Adding a track is a one-line change: drop the mp3 in `public/music/` and
 * list its filename here. A file that fails to load is skipped immediately
 * rather than stalling the playlist, so a name listed ahead of its upload
 * degrades to the shuffle instead of silence.
 */
const COURT_TRACKS: Record<CourtTheme, string[]> = {
  shibuya: ['Shibuya Hard Court 1.mp3', 'Shibuya Hard Court 2.mp3'],
  night: ['Moonlit Match Point 1.mp3', 'Moonlit Match Point 2.mp3'],
  jujutsuhigh: ['Jujutsu High Lawn 1.mp3', 'Jujutsu High Lawn 2.mp3'],
  nevarro: ['Nevarro Clay 1.mp3', 'Nevarro Clay 2.mp3'],
  dune: ['Dune Sea Rally 1.mp3'],
  mandalore: ['Mandalore Dome 1.mp3'],
  foundry: [], // no Mayhem Foundry track yet — opens on the house intro
  circuit: ['Neon Circuit 1.mp3'],
};

/** base-relative URL (works under vite base './'), spaces escaped */
function trackUrl(file: string): string {
  return encodeURI('music/' + file);
}

interface Playing {
  el: HTMLAudioElement;
  /** current fade level 0..1 */
  fade: number;
  /** fade target 0..1 */
  target: number;
  /** fade speed in level units per second */
  speed: number;
  /** generation this track belongs to (stale handlers are ignored) */
  gen: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class MusicManager {
  private mode: MusicMode = 'off';
  private pendingMode: MusicMode | null = null;
  private unlocked = false;
  private volume: number;
  /** court whose soundtrack gameplay mode should use */
  private court: CourtTheme | null = null;

  private current: Playing | null = null;
  private fadingOut: Playing[] = [];
  private timer: number | null = null;
  private lastTick = 0;

  /** bumped on every mode change so stale 'ended' handlers no-op */
  private gen = 0;

  /** tracks still to play before the next reshuffle */
  private queue: string[] = [];
  /** what the shuffle draws from once the court's opening set is done */
  private shufflePool: string[] = [];
  private lastPlayed: string | null = null;

  constructor(initialVolume: number) {
    this.volume = clamp01(initialVolume);
  }

  /** call from a user gesture; starts any mode requested pre-unlock */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.pendingMode !== null) {
      const m = this.pendingMode;
      this.pendingMode = null;
      this.startMode(m);
    }
  }

  setMode(mode: MusicMode, court?: CourtTheme): void {
    // a new court restarts gameplay music even though the mode is unchanged
    const courtChanged = court !== undefined && court !== this.court;
    if (court !== undefined) this.court = court;
    if (mode === this.mode && !(mode === 'gameplay' && courtChanged)) return;
    this.mode = mode;
    if (!this.unlocked) {
      this.pendingMode = mode;
      return;
    }
    this.startMode(mode);
  }

  getMode(): MusicMode {
    return this.mode;
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    this.applyVolumes();
  }

  getVolume(): number {
    return this.volume;
  }

  // ---------- internals ----------

  private startMode(mode: MusicMode): void {
    this.gen++;
    this.retireCurrent();

    switch (mode) {
      case 'menu':
        this.playFile(FILE_MENU, { loop: true });
        break;
      case 'victory':
        this.playFile(FILE_VICTORY, { loop: false });
        break;
      case 'gameplay': {
        const gen = this.gen;
        const own = (this.court && COURT_TRACKS[this.court]) || [];
        // the court's own theme(s) open the match, each played once
        this.queue = own.length ? [...own] : [FILE_GAMEPLAY_INTRO];
        // ...and stay in the mix once the shuffle takes over
        this.shufflePool = [...new Set([...HOUSE_TRACKS, ...own])];
        this.lastPlayed = null;
        const first = this.queue.shift()!;
        this.lastPlayed = first;
        this.playFile(first, { loop: false, onEnded: () => this.advance(gen) });
        break;
      }
      case 'off':
        break; // current already fading out
    }
  }

  /** crossfade out whatever is playing now */
  private retireCurrent(): void {
    if (this.current) {
      this.current.target = 0;
      this.current.speed = 1 / CROSSFADE_S;
      this.fadingOut.push(this.current);
      this.current = null;
    }
    this.ensureTimer();
  }

  private playFile(file: string, opts: { loop: boolean; onEnded?: () => void; fadeIn?: number }): void {
    const gen = this.gen;
    const el = new Audio(trackUrl(file));
    el.loop = opts.loop;
    el.preload = 'auto';
    el.volume = 0;
    const playing: Playing = {
      el,
      fade: 0,
      target: 1,
      speed: 1 / Math.max(0.05, opts.fadeIn ?? CROSSFADE_S),
      gen,
    };
    if (opts.onEnded) {
      // 'ended' and 'error' both hand off to the next track, but only the
      // first one to fire may — a track that 404s must not also advance
      // when the element later reports itself finished.
      let handedOff = false;
      const handOff = (): void => {
        if (handedOff || gen !== this.gen) return; // stale or already moved on
        handedOff = true;
        opts.onEnded!();
      };
      el.addEventListener('ended', handOff);
      el.addEventListener('error', handOff);
    }
    this.current = playing;
    const p = el.play();
    if (p) p.catch(() => { /* blocked or interrupted; harmless */ });
    this.ensureTimer();
  }

  /** move to the next queued track, reshuffling the pool when it runs dry */
  private advance(gen: number): void {
    if (gen !== this.gen || this.mode !== 'gameplay') return;
    if (this.queue.length === 0) this.refillShuffled();
    const file = this.queue.shift();
    if (!file) return; // nothing playable at all
    this.lastPlayed = file;
    // previous track ended naturally, so no crossfade needed — just a
    // short fade-in to stay click-free
    this.retireCurrent();
    this.playFile(file, {
      loop: false,
      fadeIn: 0.15,
      onEnded: () => this.advance(gen),
    });
  }

  private refillShuffled(): void {
    const bag = [...this.shufflePool];
    // Fisher-Yates
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    // avoid playing the same track twice in a row across bag refills
    if (bag.length > 1 && bag[0] === this.lastPlayed) {
      const k = 1 + ((Math.random() * (bag.length - 1)) | 0);
      [bag[0], bag[k]] = [bag[k], bag[0]];
    }
    this.queue = bag;
  }

  // ---------- fade engine ----------

  private ensureTimer(): void {
    if (this.timer !== null) return;
    this.lastTick = performance.now();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;

    let busy = false;

    if (this.current && this.current.fade !== this.current.target) {
      const c = this.current;
      c.fade = c.target > c.fade
        ? Math.min(c.target, c.fade + c.speed * dt)
        : Math.max(c.target, c.fade - c.speed * dt);
      if (c.fade !== c.target) busy = true;
    }

    for (let i = this.fadingOut.length - 1; i >= 0; i--) {
      const f = this.fadingOut[i];
      f.fade = Math.max(0, f.fade - f.speed * dt);
      if (f.fade <= 0) {
        try {
          f.el.pause();
          f.el.src = '';
        } catch { /* ignore */ }
        this.fadingOut.splice(i, 1);
      } else {
        busy = true;
      }
    }

    this.applyVolumes();

    if (!busy && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private applyVolumes(): void {
    if (this.current) {
      this.current.el.volume = clamp01(this.current.fade * this.volume);
    }
    for (const f of this.fadingOut) {
      f.el.volume = clamp01(f.fade * this.volume);
    }
  }
}
