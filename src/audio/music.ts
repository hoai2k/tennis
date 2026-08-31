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
 *   gameplay -> "Cursed Court Rally 2" once, then an endless
 *               reshuffled bag of [Mushroom Dash, Interlude,
 *               Rally 1] (no immediate repeats)
 *   victory  -> "Cursed Court Short" once
 *   off      -> fade everything out
 * ============================================================ */

import type { MusicMode } from '../core/types';

const CROSSFADE_S = 0.6;
const TICK_MS = 30;

const FILE_MENU = 'Cursed Court Rally 1.mp3';
const FILE_GAMEPLAY_INTRO = 'Cursed Court Rally 2.mp3';
const FILE_VICTORY = 'Cursed Court Short.mp3';
const SHUFFLE_FILES = ['Mushroom Dash.mp3', 'Cursed Court Interlude.mp3', 'Cursed Court Rally 1.mp3'];

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

  private current: Playing | null = null;
  private fadingOut: Playing[] = [];
  private timer: number | null = null;
  private lastTick = 0;

  /** bumped on every mode change so stale 'ended' handlers no-op */
  private gen = 0;

  private bag: string[] = [];
  private lastShuffled: string | null = null;

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

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return; // same mode: never restart
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
        this.bag = [];
        this.lastShuffled = null;
        this.playFile(FILE_GAMEPLAY_INTRO, {
          loop: false,
          onEnded: () => this.playNextShuffled(gen),
        });
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
      el.addEventListener('ended', () => {
        if (gen !== this.gen) return; // mode changed since; ignore
        opts.onEnded!();
      });
    }
    this.current = playing;
    const p = el.play();
    if (p) p.catch(() => { /* blocked or interrupted; harmless */ });
    this.ensureTimer();
  }

  /** endless shuffle mix after the gameplay intro track */
  private playNextShuffled(gen: number): void {
    if (gen !== this.gen || this.mode !== 'gameplay') return;
    if (this.bag.length === 0) {
      this.bag = [...SHUFFLE_FILES];
      // Fisher-Yates
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      // avoid playing the same track twice in a row across bag refills
      if (this.bag.length > 1 && this.bag[0] === this.lastShuffled) {
        const k = 1 + ((Math.random() * (this.bag.length - 1)) | 0);
        [this.bag[0], this.bag[k]] = [this.bag[k], this.bag[0]];
      }
    }
    const file = this.bag.shift()!;
    this.lastShuffled = file;
    // previous track ended naturally, so no crossfade needed — just a
    // short fade-in to stay click-free
    this.retireCurrent();
    this.playFile(file, {
      loop: false,
      fadeIn: 0.15,
      onEnded: () => this.playNextShuffled(gen),
    });
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
