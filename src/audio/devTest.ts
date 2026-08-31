/* ============================================================
 * Cursed Court — audio dev/test page logic (audiotest.html).
 *
 * Buttons for every SFX + music mode + volume sliders, plus an
 * OfflineAudioContext smoke-test helper for headless verification:
 *
 *   window.__renderSfxOffline(name) -> Promise<number>  (peak amp)
 *   window.__testAllSfx()           -> Promise<Record<name, peak>>
 * ============================================================ */

import { createAudio } from './index';
import { buildSfx, SFX_NAMES } from './sfx';
import { DEFAULT_SETTINGS, type MusicMode, type SfxName } from '../core/types';

const audio = createAudio(DEFAULT_SETTINGS);

// unlock on any interaction (also wired to the explicit button)
window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
window.addEventListener('keydown', () => audio.unlock(), { capture: true });

// ---------- offline smoke-test helpers ----------

const RENDER_SECONDS = 4; // longest sfx (crowd_big ~2.8s) fits comfortably

async function renderSfxOffline(name: SfxName): Promise<number> {
  const sr = 44100;
  const octx = new OfflineAudioContext(2, sr * RENDER_SECONDS, sr);
  const out = octx.createGain();
  out.gain.value = 1;
  out.connect(octx.destination);
  buildSfx(name, octx, out, 0.02, 1);
  const buf = await octx.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

async function testAllSfx(): Promise<Record<string, number>> {
  const res: Record<string, number> = {};
  for (const name of SFX_NAMES) {
    res[name] = await renderSfxOffline(name);
  }
  return res;
}

declare global {
  interface Window {
    __audio: ReturnType<typeof createAudio>;
    __sfxNames: SfxName[];
    __renderSfxOffline: (name: SfxName) => Promise<number>;
    __testAllSfx: () => Promise<Record<string, number>>;
  }
}

window.__audio = audio;
window.__sfxNames = SFX_NAMES;
window.__renderSfxOffline = renderSfxOffline;
window.__testAllSfx = testAllSfx;

// ---------- DOM ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, parent: Element, text?: string, cls?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}

function section(title: string): HTMLDivElement {
  const s = el('div', document.body, undefined, 'section');
  el('h2', s, title);
  return s;
}

document.title = 'Cursed Court — audio test';

const header = el('div', document.body, undefined, 'section');
el('h1', header, 'Cursed Court — audio test');
const unlockBtn = el('button', header, 'Unlock audio (user gesture)', 'unlock');
const status = el('span', header, ' locked', 'status');
unlockBtn.addEventListener('click', () => {
  audio.unlock();
  status.textContent = ' unlocked';
});

// music controls
const musicSec = section('Music modes (0.6s crossfade; same mode = no-op)');
(['menu', 'gameplay', 'victory', 'off'] as MusicMode[]).forEach((mode) => {
  const b = el('button', musicSec, mode);
  b.addEventListener('click', () => audio.setMusic(mode));
});

// volumes
const volSec = section('Volumes');
const mkSlider = (label: string, value: number, oninput: (v: number) => void) => {
  const wrap = el('label', volSec, label + ' ');
  const s = el('input', wrap) as HTMLInputElement;
  s.type = 'range';
  s.min = '0';
  s.max = '1';
  s.step = '0.01';
  s.value = String(value);
  s.addEventListener('input', () => oninput(Number(s.value)));
};
mkSlider('music', audio.getMusicVolume(), (v) => audio.setMusicVolume(v));
mkSlider('sfx', audio.getSfxVolume(), (v) => audio.setSfxVolume(v));

// charge loop toggle
const chargeSec = section('Charge loop (hold-style shimmer)');
let chargeOn = false;
const chargeBtn = el('button', chargeSec, 'chargeLoop: OFF');
chargeBtn.addEventListener('click', () => {
  chargeOn = !chargeOn;
  audio.chargeLoop(chargeOn);
  chargeBtn.textContent = 'chargeLoop: ' + (chargeOn ? 'ON' : 'OFF');
});

// every sfx
const sfxSec = section('SFX (' + SFX_NAMES.length + ')');
const grid = el('div', sfxSec, undefined, 'grid');
for (const name of SFX_NAMES) {
  const b = el('button', grid, name);
  b.dataset.sfx = name;
  b.addEventListener('click', () => audio.sfx(name));
}

// sfx opts demo
const optsSec = section('SfxOpts demo (gain / rate / pan)');
el('button', optsSec, 'bounce pan -1').addEventListener('click', () => audio.sfx('bounce', { pan: -1 }));
el('button', optsSec, 'bounce pan +1').addEventListener('click', () => audio.sfx('bounce', { pan: 1 }));
el('button', optsSec, 'bounce rate 0.7').addEventListener('click', () => audio.sfx('bounce', { rate: 0.7 }));
el('button', optsSec, 'bounce rate 1.4').addEventListener('click', () => audio.sfx('bounce', { rate: 1.4 }));
el('button', optsSec, 'hit_flat gain 0.3').addEventListener('click', () => audio.sfx('hit_flat', { gain: 0.3 }));

// offline test runner
const testSec = section('Offline smoke test (renders every sfx, reports peak)');
const runBtn = el('button', testSec, 'Run __testAllSfx()');
const results = el('pre', testSec, '', 'results');
runBtn.addEventListener('click', async () => {
  results.textContent = 'rendering...';
  const r = await testAllSfx();
  results.textContent = Object.entries(r)
    .map(([n, p]) => `${n.padEnd(16)} peak=${p.toFixed(4)} ${p > 0.01 ? 'OK' : 'SILENT!'}`)
    .join('\n');
});
