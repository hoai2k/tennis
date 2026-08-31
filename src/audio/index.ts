/* ============================================================
 * Cursed Court — audio module entry point.
 *
 *   const audio = createAudio(settings);
 *   button.onclick = () => audio.unlock();   // any user gesture
 *   audio.setMusic('menu');
 *   audio.sfx('hit_topspin', { pan: -0.3 });
 *
 * Music: HTMLAudioElement streams with JS volume crossfades
 * (see music.ts). SFX: fully procedural WebAudio synthesis
 * routed through an sfx bus gain (see sfx.ts).
 * ============================================================ */

import type { AudioApi, GameSettings, MusicMode, SfxName, SfxOpts } from '../core/types';
import { MusicManager } from './music';
import { SfxEngine } from './sfx';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface WindowWithWebkitAC extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function createAudio(initial: GameSettings): AudioApi {
  let musicVolume = clamp01(initial.musicVolume);
  let sfxVolume = clamp01(initial.sfxVolume);

  const music = new MusicManager(musicVolume);

  let ctx: AudioContext | null = null;
  let engine: SfxEngine | null = null;

  function unlock(): void {
    if (!ctx) {
      const w = window as WindowWithWebkitAC;
      const AC = window.AudioContext ?? w.webkitAudioContext;
      if (AC) {
        try {
          ctx = new AC();
          engine = new SfxEngine(ctx, sfxVolume);
        } catch {
          ctx = null;
          engine = null;
        }
      }
    }
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => { /* ignore */ });
    }
    // HTMLAudio playback is also gesture-gated: start queued music now
    music.unlock();
  }

  return {
    unlock,

    setMusic(mode: MusicMode): void {
      music.setMode(mode);
    },

    sfx(name: SfxName, opts?: SfxOpts): void {
      engine?.play(name, opts);
    },

    chargeLoop(on: boolean): void {
      engine?.chargeLoop(on);
    },

    setMusicVolume(v: number): void {
      musicVolume = clamp01(v);
      music.setVolume(musicVolume);
    },

    setSfxVolume(v: number): void {
      sfxVolume = clamp01(v);
      engine?.setVolume(sfxVolume);
    },

    getMusicVolume(): number {
      return musicVolume;
    },

    getSfxVolume(): number {
      return sfxVolume;
    },
  };
}
