/* ============================================================
 * Cursed Court — procedural SFX synthesis (WebAudio, no samples).
 *
 * Every SfxName is implemented as a pure "builder" that schedules
 * nodes on any BaseAudioContext (live or Offline) starting at t0
 * and returns the total duration in seconds. This makes the same
 * code testable headlessly via OfflineAudioContext.
 * ============================================================ */

import type { SfxName, SfxOpts } from '../core/types';

// ---------- shared noise buffers (built once per context) ----------

interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  click: AudioBuffer; // tiny decaying tick used for applause grains
}

const noiseCache = new WeakMap<BaseAudioContext, NoiseBuffers>();

export function getNoise(ctx: BaseAudioContext): NoiseBuffers {
  let b = noiseCache.get(ctx);
  if (b) return b;
  const sr = ctx.sampleRate;

  const white = ctx.createBuffer(1, sr, sr);
  const wd = white.getChannelData(0);
  for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;

  // Paul Kellet pink noise approximation
  const pink = ctx.createBuffer(1, sr * 2, sr);
  const pd = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < pd.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }

  const click = ctx.createBuffer(1, Math.max(8, Math.floor(sr * 0.012)), sr);
  const cd = click.getChannelData(0);
  for (let i = 0; i < cd.length; i++) {
    const e = 1 - i / cd.length;
    cd[i] = (Math.random() * 2 - 1) * e * e;
  }

  b = { white, pink, click };
  noiseCache.set(ctx, b);
  return b;
}

// ---------- small synth helpers ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** gain node with click-free attack/hold/release envelope, connected to dest */
function envGain(
  ctx: BaseAudioContext, dest: AudioNode, t0: number,
  peak: number, attack: number, hold: number, release: number,
): GainNode {
  const g = ctx.createGain();
  const p = Math.max(0.0002, peak);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(p, t0 + attack);
  g.gain.setValueAtTime(p, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  g.connect(dest);
  return g;
}

interface FilterSpec {
  type: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  /** sweep time for f0->f1 (defaults to sound duration) */
  sweep?: number;
}

function makeFilter(ctx: BaseAudioContext, t0: number, rate: number, dur: number, spec: FilterSpec): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = spec.type;
  f.frequency.setValueAtTime(Math.max(20, spec.f0 * rate), t0);
  if (spec.f1 !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, spec.f1 * rate), t0 + (spec.sweep ?? dur));
  }
  f.Q.value = spec.q ?? 1;
  return f;
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  /** freq glide time (defaults to dur) */
  glide?: number;
  exp?: boolean;
  dur: number;
  a?: number;
  rel?: number;
  g?: number;
  filter?: FilterSpec;
  /** fixed detune in cents */
  detune?: number;
}

/** one enveloped oscillator */
function tone(ctx: BaseAudioContext, dest: AudioNode, t0: number, rate: number, o: ToneOpts): void {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  const f0 = Math.max(1, o.f0 * rate);
  osc.frequency.setValueAtTime(f0, t0);
  if (o.f1 !== undefined) {
    const f1 = Math.max(1, o.f1 * rate);
    const gt = o.glide ?? o.dur;
    if (o.exp) osc.frequency.exponentialRampToValueAtTime(f1, t0 + gt);
    else osc.frequency.linearRampToValueAtTime(f1, t0 + gt);
  }
  if (o.detune) osc.detune.value = o.detune;
  const a = o.a ?? 0.005;
  const rel = o.rel ?? 0.06;
  const hold = Math.max(0, o.dur - a);
  const g = envGain(ctx, dest, t0, o.g ?? 0.3, a, hold, rel);
  if (o.filter) {
    const f = makeFilter(ctx, t0, rate, o.dur, o.filter);
    osc.connect(f);
    f.connect(g);
  } else {
    osc.connect(g);
  }
  osc.start(t0);
  osc.stop(t0 + o.dur + rel + 0.03);
}

interface NoiseOpts {
  color?: 'white' | 'pink';
  dur: number;
  a?: number;
  rel?: number;
  g?: number;
  filter?: FilterSpec;
  /** extra playbackRate multiplier */
  speed?: number;
}

/** one enveloped (optionally filtered) noise burst */
function noiseBurst(ctx: BaseAudioContext, dest: AudioNode, t0: number, rate: number, o: NoiseOpts): void {
  const bufs = getNoise(ctx);
  const src = ctx.createBufferSource();
  src.buffer = o.color === 'pink' ? bufs.pink : bufs.white;
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = src.buffer.duration;
  src.playbackRate.value = clamp(rate, 0.25, 4) * (o.speed ?? 1);
  const a = o.a ?? 0.004;
  const rel = o.rel ?? 0.06;
  const g = envGain(ctx, dest, t0, o.g ?? 0.3, a, Math.max(0, o.dur - a), rel);
  let node: AudioNode = src;
  if (o.filter) {
    const f = makeFilter(ctx, t0, rate, o.dur, o.filter);
    src.connect(f);
    node = f;
  }
  node.connect(g);
  src.start(t0, Math.random() * 0.7);
  src.stop(t0 + o.dur + rel + 0.03);
}

/** short melodic note with a soft octave sparkle on top */
function pling(
  ctx: BaseAudioContext, dest: AudioNode, t: number, rate: number,
  freq: number, dur = 0.1, g = 0.25, type: OscillatorType = 'triangle',
): void {
  tone(ctx, dest, t, rate, { type, f0: freq, dur, a: 0.004, rel: 0.14, g });
  tone(ctx, dest, t, rate, { type: 'sine', f0: freq * 2, dur: dur * 0.7, a: 0.004, rel: 0.1, g: g * 0.25 });
}

/** sequence of plings */
function fanfare(
  ctx: BaseAudioContext, dest: AudioNode, t0: number, rate: number,
  freqs: number[], step: number, g = 0.3, lastHold = 0.22,
): number {
  freqs.forEach((f, i) => {
    const last = i === freqs.length - 1;
    pling(ctx, dest, t0 + i * step, rate, f, last ? lastHold : step * 0.9, last ? g * 1.15 : g);
  });
  return freqs.length * step + lastHold + 0.3;
}

/** StereoPanner if the context supports it, otherwise pass-through */
export function maybePan(ctx: BaseAudioContext, dest: AudioNode, pan: number): AudioNode {
  const anyCtx = ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
  if (typeof anyCtx.createStereoPanner === 'function') {
    const p = anyCtx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(dest);
    return p;
  }
  return dest;
}

// ---------- compound helpers ----------

/** shared "pock" racquet contact: bandpassed noise + body thump */
function pock(
  ctx: BaseAudioContext, out: AudioNode, t0: number, rate: number,
  bandHz: number, noiseG: number, bodyG: number, bodyF = 150,
): void {
  noiseBurst(ctx, out, t0, rate, {
    dur: 0.045, a: 0.002, rel: 0.05, g: noiseG,
    filter: { type: 'bandpass', f0: bandHz, q: 1.1 },
  });
  tone(ctx, out, t0, rate, {
    type: 'sine', f0: bodyF, f1: bodyF * 0.55, exp: true,
    dur: 0.07, a: 0.002, rel: 0.06, g: bodyG,
  });
}

/** crowd noise swell with amplitude vibrato + optional whoops/whistles */
function crowdSwell(
  ctx: BaseAudioContext, out: AudioNode, t0: number, rate: number,
  dur: number, g: number, whoops: number, whistles: number,
): number {
  const bufs = getNoise(ctx);
  const src = ctx.createBufferSource();
  src.buffer = bufs.pink;
  src.loop = true;
  src.playbackRate.value = clamp(rate, 0.5, 2);

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 950 * rate;
  bp.Q.value = 0.55;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.001, g), t0 + dur * 0.3);
  amp.gain.setValueAtTime(Math.max(0.001, g), t0 + dur * 0.55);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // amplitude vibrato (roar texture)
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 5.5;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = g * 0.35;
  lfo.connect(lfoDepth);
  lfoDepth.connect(amp.gain);

  src.connect(bp);
  bp.connect(amp);
  amp.connect(out);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.05);

  // random "voice" whoops
  for (let i = 0; i < whoops; i++) {
    const wt = t0 + 0.1 + Math.random() * dur * 0.55;
    const f = 380 + Math.random() * 320;
    const wg = g * (0.14 + Math.random() * 0.1);
    tone(ctx, out, wt, rate, { type: 'sine', f0: f, f1: f * 1.7, exp: true, glide: 0.16, dur: 0.3, a: 0.05, rel: 0.18, g: wg });
    tone(ctx, out, wt + 0.16, rate, { type: 'sine', f0: f * 1.7, f1: f * 1.1, exp: true, dur: 0.2, a: 0.02, rel: 0.16, g: wg * 0.8 });
  }

  // whistles (crowd_big)
  for (let i = 0; i < whistles; i++) {
    const wt = t0 + 0.2 + Math.random() * dur * 0.5;
    const f = 1900 + Math.random() * 700;
    tone(ctx, out, wt, rate, { type: 'sine', f0: f, f1: f * 1.45, glide: 0.22, dur: 0.42, a: 0.03, rel: 0.2, g: g * 0.11 });
    tone(ctx, out, wt + 0.22, rate, { type: 'sine', f0: f * 1.45, f1: f * 1.15, dur: 0.25, a: 0.01, rel: 0.18, g: g * 0.09 });
  }

  return dur + 0.4;
}

// ---------- the builders ----------

export type SfxBuilder = (ctx: BaseAudioContext, out: AudioNode, t0: number, rate: number) => number;

export const SFX_BUILDERS: Record<SfxName, SfxBuilder> = {

  bounce: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'triangle', f0: 180, f1: 90, exp: true, dur: 0.08, a: 0.002, rel: 0.07, g: 0.5, filter: { type: 'lowpass', f0: 900, q: 0.8 } });
    noiseBurst(ctx, out, t0, rate, { dur: 0.012, a: 0.001, rel: 0.02, g: 0.12, filter: { type: 'highpass', f0: 2500, q: 0.7 } });
    return 0.2;
  },

  net_cord: (ctx, out, t0, rate) => {
    // dull detuned twang
    tone(ctx, out, t0, rate, { type: 'triangle', f0: 185, f1: 160, dur: 0.24, a: 0.002, rel: 0.22, g: 0.42, filter: { type: 'lowpass', f0: 850, f1: 380, q: 2.5 } });
    tone(ctx, out, t0, rate, { type: 'triangle', f0: 185, f1: 158, dur: 0.24, a: 0.002, rel: 0.22, g: 0.3, detune: 22, filter: { type: 'lowpass', f0: 800, f1: 360, q: 2.5 } });
    noiseBurst(ctx, out, t0, rate, { dur: 0.03, a: 0.001, rel: 0.03, g: 0.25, filter: { type: 'lowpass', f0: 500, q: 1 } });
    return 0.55;
  },

  whiff: (ctx, out, t0, rate) => {
    noiseBurst(ctx, out, t0, rate, { dur: 0.2, a: 0.05, rel: 0.1, g: 0.26, filter: { type: 'bandpass', f0: 700, f1: 2600, q: 1.4 } });
    return 0.4;
  },

  hit_topspin: (ctx, out, t0, rate) => {
    pock(ctx, out, t0, rate, 1600, 0.7, 0.5);
    // rising zing
    tone(ctx, out, t0 + 0.005, rate, { type: 'sawtooth', f0: 500, f1: 1500, exp: true, dur: 0.12, a: 0.008, rel: 0.09, g: 0.14, filter: { type: 'bandpass', f0: 1200, f1: 2200, q: 2 } });
    return 0.3;
  },

  hit_slice: (ctx, out, t0, rate) => {
    pock(ctx, out, t0, rate, 1400, 0.55, 0.45);
    // downward airy swish
    noiseBurst(ctx, out, t0 + 0.01, rate, { dur: 0.18, a: 0.02, rel: 0.09, g: 0.24, filter: { type: 'bandpass', f0: 3200, f1: 750, q: 1.6 } });
    return 0.35;
  },

  hit_flat: (ctx, out, t0, rate) => {
    // loudest, sharpest pock
    pock(ctx, out, t0, rate, 2200, 0.95, 0.65, 160);
    noiseBurst(ctx, out, t0, rate, { dur: 0.025, a: 0.001, rel: 0.03, g: 0.3, filter: { type: 'highpass', f0: 3500, q: 0.8 } });
    return 0.25;
  },

  hit_lob: (ctx, out, t0, rate) => {
    // soft poomph
    tone(ctx, out, t0, rate, { type: 'sine', f0: 130, f1: 70, exp: true, dur: 0.14, a: 0.006, rel: 0.12, g: 0.5 });
    noiseBurst(ctx, out, t0, rate, { dur: 0.08, a: 0.01, rel: 0.07, g: 0.2, filter: { type: 'lowpass', f0: 700, q: 0.9 } });
    // upward whistle
    tone(ctx, out, t0 + 0.05, rate, { type: 'sine', f0: 700, f1: 1600, exp: true, dur: 0.28, a: 0.04, rel: 0.14, g: 0.11 });
    return 0.55;
  },

  hit_drop: (ctx, out, t0, rate) => {
    // muted dink
    tone(ctx, out, t0, rate, { type: 'triangle', f0: 420, f1: 300, exp: true, dur: 0.05, a: 0.003, rel: 0.07, g: 0.35, filter: { type: 'lowpass', f0: 1100, q: 1.2 } });
    tone(ctx, out, t0, rate, { type: 'sine', f0: 140, f1: 90, exp: true, dur: 0.05, a: 0.003, rel: 0.06, g: 0.28 });
    return 0.2;
  },

  hit_smash: (ctx, out, t0, rate) => {
    // big crack
    noiseBurst(ctx, out, t0, rate, { dur: 0.05, a: 0.001, rel: 0.06, g: 1.0, filter: { type: 'bandpass', f0: 2800, q: 0.9 } });
    noiseBurst(ctx, out, t0, rate, { dur: 0.03, a: 0.001, rel: 0.04, g: 0.4, filter: { type: 'highpass', f0: 4500, q: 0.7 } });
    // low boom
    tone(ctx, out, t0 + 0.005, rate, { type: 'sine', f0: 95, f1: 42, exp: true, dur: 0.32, a: 0.004, rel: 0.25, g: 0.8 });
    tone(ctx, out, t0, rate, { type: 'sine', f0: 190, f1: 90, exp: true, dur: 0.09, a: 0.002, rel: 0.08, g: 0.45 });
    return 0.7;
  },

  hit_star: (ctx, out, t0, rate) => {
    const ti = t0 + 0.2; // impact moment after the riser
    // riser
    tone(ctx, out, t0, rate, { type: 'sawtooth', f0: 260, f1: 950, exp: true, dur: 0.2, a: 0.02, rel: 0.04, g: 0.16, filter: { type: 'bandpass', f0: 700, f1: 2200, q: 2 } });
    noiseBurst(ctx, out, t0, rate, { dur: 0.2, a: 0.05, rel: 0.05, g: 0.18, filter: { type: 'bandpass', f0: 900, f1: 3200, q: 1.6 } });
    // impact
    noiseBurst(ctx, out, ti, rate, { dur: 0.06, a: 0.001, rel: 0.08, g: 1.0, filter: { type: 'bandpass', f0: 2400, q: 0.9 } });
    tone(ctx, out, ti, rate, { type: 'sine', f0: 150, f1: 60, exp: true, dur: 0.25, a: 0.003, rel: 0.2, g: 0.75 });
    // sub thump
    tone(ctx, out, ti, rate, { type: 'sine', f0: 55, f1: 40, exp: true, dur: 0.35, a: 0.005, rel: 0.25, g: 0.55 });
    // sparkle arpeggio
    [1318.5, 1568, 2093, 2637].forEach((f, i) => {
      tone(ctx, out, ti + 0.05 + i * 0.055, rate, { type: 'sine', f0: f, dur: 0.07, a: 0.004, rel: 0.22, g: 0.2 });
    });
    return 1.2;
  },

  serve_toss: (ctx, out, t0, rate) => {
    noiseBurst(ctx, out, t0, rate, { dur: 0.16, a: 0.05, rel: 0.09, g: 0.14, filter: { type: 'bandpass', f0: 450, f1: 1400, q: 1.8 } });
    return 0.35;
  },

  serve_hit: (ctx, out, t0, rate) => {
    pock(ctx, out, t0, rate, 2000, 0.85, 0.55, 165);
    return 0.25;
  },

  serve_power: (ctx, out, t0, rate) => {
    pock(ctx, out, t0, rate, 2200, 0.9, 0.6, 160);
    // electric zap layer
    tone(ctx, out, t0, rate, { type: 'sawtooth', f0: 1400, f1: 220, exp: true, dur: 0.14, a: 0.002, rel: 0.1, g: 0.22, filter: { type: 'bandpass', f0: 1600, f1: 500, q: 7 } });
    tone(ctx, out, t0, rate, { type: 'square', f0: 90, f1: 55, exp: true, dur: 0.1, a: 0.002, rel: 0.09, g: 0.16, filter: { type: 'lowpass', f0: 900, q: 2 } });
    noiseBurst(ctx, out, t0, rate, { dur: 0.1, a: 0.002, rel: 0.06, g: 0.2, filter: { type: 'highpass', f0: 5000, q: 0.8 } });
    return 0.35;
  },

  // one-shot burst version of the charge shimmer (the sustained loop
  // lives in SfxEngine.chargeLoop); keeps sfx('charge_loop') audible.
  charge_loop: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'sawtooth', f0: 110, f1: 220, dur: 0.8, a: 0.1, rel: 0.15, g: 0.14, filter: { type: 'lowpass', f0: 400, f1: 2200, q: 5 } });
    tone(ctx, out, t0, rate, { type: 'sawtooth', f0: 110.8, f1: 221.5, dur: 0.8, a: 0.1, rel: 0.15, g: 0.1, detune: 9, filter: { type: 'lowpass', f0: 380, f1: 2000, q: 5 } });
    return 1.1;
  },

  star_appear: (ctx, out, t0, rate) => {
    // magical ascending gliss
    tone(ctx, out, t0, rate, { type: 'sine', f0: 480, f1: 1950, exp: true, dur: 0.32, a: 0.02, rel: 0.12, g: 0.16 });
    tone(ctx, out, t0 + 0.02, rate, { type: 'triangle', f0: 720, f1: 2900, exp: true, dur: 0.3, a: 0.02, rel: 0.12, g: 0.08 });
    // chime
    pling(ctx, out, t0 + 0.3, rate, 1568, 0.1, 0.22, 'sine');
    pling(ctx, out, t0 + 0.42, rate, 2093, 0.14, 0.24, 'sine');
    return 0.9;
  },

  footstep: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'sine', f0: 110, f1: 70, exp: true, dur: 0.035, a: 0.002, rel: 0.04, g: 0.09 });
    noiseBurst(ctx, out, t0, rate, { dur: 0.02, a: 0.002, rel: 0.025, g: 0.05, filter: { type: 'lowpass', f0: 1200, q: 0.8 } });
    return 0.12;
  },

  menu_move: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'square', f0: 660, dur: 0.045, a: 0.003, rel: 0.06, g: 0.16, filter: { type: 'lowpass', f0: 2600, q: 1 } });
    return 0.15;
  },

  menu_confirm: (ctx, out, t0, rate) => {
    pling(ctx, out, t0, rate, 523.25, 0.08, 0.24);       // C5
    pling(ctx, out, t0 + 0.09, rate, 783.99, 0.16, 0.28); // G5
    return 0.5;
  },

  menu_back: (ctx, out, t0, rate) => {
    pling(ctx, out, t0, rate, 783.99, 0.07, 0.2);         // G5
    pling(ctx, out, t0 + 0.08, rate, 523.25, 0.13, 0.22); // C5
    return 0.45;
  },

  menu_error: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'square', f0: 105, dur: 0.2, a: 0.006, rel: 0.08, g: 0.2, filter: { type: 'lowpass', f0: 600, q: 1 } });
    tone(ctx, out, t0, rate, { type: 'square', f0: 108, dur: 0.2, a: 0.006, rel: 0.08, g: 0.16, filter: { type: 'lowpass', f0: 550, q: 1 } });
    return 0.35;
  },

  score_point: (ctx, out, t0, rate) =>
    fanfare(ctx, out, t0, rate, [523.25, 659.25, 783.99], 0.1, 0.3, 0.26),

  score_game: (ctx, out, t0, rate) =>
    fanfare(ctx, out, t0, rate, [392, 523.25, 659.25, 783.99, 1046.5], 0.115, 0.32, 0.42),

  fault: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'sawtooth', f0: 290, f1: 130, exp: true, dur: 0.32, a: 0.01, rel: 0.14, g: 0.32, filter: { type: 'lowpass', f0: 800, f1: 320, q: 1.4 } });
    tone(ctx, out, t0, rate, { type: 'sine', f0: 145, f1: 65, exp: true, dur: 0.32, a: 0.01, rel: 0.14, g: 0.22 });
    return 0.6;
  },

  let: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'triangle', f0: 880, dur: 0.07, a: 0.004, rel: 0.07, g: 0.2 });
    tone(ctx, out, t0 + 0.15, rate, { type: 'triangle', f0: 880, dur: 0.07, a: 0.004, rel: 0.07, g: 0.2 });
    return 0.4;
  },

  crowd_cheer: (ctx, out, t0, rate) =>
    crowdSwell(ctx, out, t0, rate, 1.5, 0.4, 3, 0),

  crowd_big: (ctx, out, t0, rate) =>
    crowdSwell(ctx, out, t0, rate, 2.4, 0.6, 5, 2),

  crowd_ooh: (ctx, out, t0, rate) => {
    // falling formant-ish "awww": pink noise through two gliding bandpasses
    const bufs = getNoise(ctx);
    const src = ctx.createBufferSource();
    src.buffer = bufs.pink;
    src.loop = true;
    src.playbackRate.value = clamp(rate, 0.5, 2);
    const dur = 1.2;
    const amp = envGain(ctx, out, t0, 0.55, 0.12, dur - 0.45, 0.35);
    for (const [f0, f1, q] of [[720, 340, 4], [1150, 560, 5]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f0 * rate, t0);
      bp.frequency.exponentialRampToValueAtTime(f1 * rate, t0 + dur);
      bp.Q.value = q;
      src.connect(bp);
      bp.connect(amp);
    }
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.4);
    return dur + 0.5;
  },

  applause: (ctx, out, t0, rate) => {
    const bufs = getNoise(ctx);
    const dur = 2.0;
    // a few fixed pan positions for stereo spread
    const spots = [-0.6, -0.25, 0.1, 0.4, 0.7].map((p) => maybePan(ctx, out, p));
    let t = t0;
    while (t < t0 + dur) {
      const x = (t - t0) / dur;
      const shape = Math.min(1, x / 0.15, (1 - x) / 0.3); // swell in, die out
      const src = ctx.createBufferSource();
      src.buffer = bufs.click;
      src.playbackRate.value = clamp(rate, 0.25, 4) * (0.6 + Math.random() * 0.9);
      const g = ctx.createGain();
      g.gain.value = Math.max(0.001, (0.12 + Math.random() * 0.3) * shape);
      src.connect(g);
      g.connect(spots[(Math.random() * spots.length) | 0]);
      src.start(t);
      // Poisson-ish inter-clap times
      t += 0.006 + Math.random() * 0.032;
    }
    // faint noise bed underneath
    noiseBurst(ctx, out, t0, rate, { color: 'pink', dur: dur - 0.3, a: 0.3, rel: 0.4, g: 0.06, filter: { type: 'bandpass', f0: 1500, q: 0.5 } });
    return dur + 0.3;
  },

  countdown_tick: (ctx, out, t0, rate) => {
    // woodblock
    tone(ctx, out, t0, rate, { type: 'sine', f0: 850, f1: 600, exp: true, glide: 0.02, dur: 0.04, a: 0.002, rel: 0.06, g: 0.4 });
    tone(ctx, out, t0, rate, { type: 'sine', f0: 1700, f1: 1300, exp: true, glide: 0.015, dur: 0.02, a: 0.001, rel: 0.03, g: 0.14 });
    noiseBurst(ctx, out, t0, rate, { dur: 0.012, a: 0.001, rel: 0.02, g: 0.1, filter: { type: 'bandpass', f0: 2000, q: 3 } });
    return 0.18;
  },

  countdown_go: (ctx, out, t0, rate) => {
    tone(ctx, out, t0, rate, { type: 'triangle', f0: 523.25, f1: 1046.5, exp: true, glide: 0.12, dur: 0.32, a: 0.005, rel: 0.25, g: 0.35 });
    tone(ctx, out, t0 + 0.02, rate, { type: 'sine', f0: 1046.5, f1: 2093, exp: true, glide: 0.12, dur: 0.3, a: 0.01, rel: 0.25, g: 0.14 });
    pling(ctx, out, t0 + 0.14, rate, 1568, 0.12, 0.16, 'sine');
    return 0.7;
  },

  victory_sting: (ctx, out, t0, rate) => {
    // cymbal-ish shimmer (music carries the melody)
    noiseBurst(ctx, out, t0, rate, { dur: 0.25, a: 0.005, rel: 1.1, g: 0.24, filter: { type: 'highpass', f0: 5500, q: 0.7 } });
    noiseBurst(ctx, out, t0, rate, { dur: 0.12, a: 0.003, rel: 0.5, g: 0.15, filter: { type: 'bandpass', f0: 8000, q: 1.2 } });
    [2093, 2637, 3136].forEach((f, i) => {
      tone(ctx, out, t0 + 0.05 + i * 0.07, rate, { type: 'sine', f0: f, dur: 0.06, a: 0.004, rel: 0.5, g: 0.09 });
    });
    return 1.6;
  },
};

export const SFX_NAMES = Object.keys(SFX_BUILDERS) as SfxName[];

/** Schedule one sfx into any context; returns its duration in seconds. */
export function buildSfx(name: SfxName, ctx: BaseAudioContext, out: AudioNode, t0: number, rate = 1): number {
  return SFX_BUILDERS[name](ctx, out, t0, clamp(rate, 0.25, 4));
}

// ---------- sustained charge-loop voice (live context only) ----------

class ChargeVoice {
  private oscs: OscillatorNode[] = [];
  private lfo: OscillatorNode;
  private amp: GainNode;
  private stopped = false;

  constructor(private ctx: AudioContext, out: AudioNode) {
    const t0 = ctx.currentTime;
    this.amp = ctx.createGain();
    this.amp.gain.setValueAtTime(0.0001, t0);
    this.amp.gain.exponentialRampToValueAtTime(0.1, t0 + 0.25);
    this.amp.gain.exponentialRampToValueAtTime(0.2, t0 + 2.2); // slow build while held
    this.amp.connect(out);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(360, t0);
    filter.frequency.exponentialRampToValueAtTime(2400, t0 + 2.2);
    filter.Q.value = 5;
    filter.connect(this.amp);

    // shimmer: LFO wobbles the filter cutoff, speeding up as charge builds
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.setValueAtTime(4.5, t0);
    this.lfo.frequency.linearRampToValueAtTime(9, t0 + 2.2);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(140, t0);
    depth.gain.linearRampToValueAtTime(450, t0 + 2.2);
    this.lfo.connect(depth);
    depth.connect(filter.frequency);
    this.lfo.start(t0);

    for (const detune of [0, 8, -6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t0);
      osc.frequency.exponentialRampToValueAtTime(220, t0 + 2.4);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t0);
      this.oscs.push(osc);
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setValueAtTime(Math.max(0.0002, this.amp.gain.value), t);
    this.amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    const stopAt = t + 0.12;
    for (const o of this.oscs) o.stop(stopAt);
    this.lfo.stop(stopAt);
    const amp = this.amp;
    window.setTimeout(() => amp.disconnect(), 250);
  }
}

// ---------- live engine (bus + volume + pan/gain/rate opts) ----------

export class SfxEngine {
  private bus: GainNode;
  private charge: ChargeVoice | null = null;
  private volume: number;

  constructor(private ctx: AudioContext, initialVolume: number) {
    this.volume = clamp(initialVolume, 0, 1);
    this.bus = ctx.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(ctx.destination);
    getNoise(ctx); // pre-build shared noise buffers once
  }

  setVolume(v: number): void {
    this.volume = clamp(v, 0, 1);
    this.bus.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  getVolume(): number {
    return this.volume;
  }

  play(name: SfxName, opts: SfxOpts = {}): void {
    if (this.ctx.state !== 'running') return;
    let dest: AudioNode = this.bus;
    if (opts.pan) dest = maybePan(this.ctx, this.bus, opts.pan);
    const g = this.ctx.createGain();
    g.gain.value = clamp(opts.gain ?? 1, 0, 1);
    g.connect(dest);
    buildSfx(name, this.ctx, g, this.ctx.currentTime + 0.002, opts.rate ?? 1);
  }

  chargeLoop(on: boolean): void {
    if (on) {
      if (!this.charge && this.ctx.state === 'running') {
        this.charge = new ChargeVoice(this.ctx, this.bus);
      }
    } else if (this.charge) {
      this.charge.stop();
      this.charge = null;
    }
  }

  stopAll(): void {
    this.chargeLoop(false);
  }
}
