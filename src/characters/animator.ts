import * as THREE from 'three';
import type { SwingOpts, SwingSide } from '../core/types';
import { SWING_CONTACT_DELAY } from '../core/types';
import type { Rig } from './rig';
import {
  Pose, Timeline, SPECS, mergeSpecs,
  easeIn, easeInCubic, easeOut, easeOutCubic, easeInOut, easeOutBack, easeLinear,
} from './poses';

/* ============================================================
 * Procedural animation state machine.
 * Evaluates a full-body target pose every frame (static keyposes
 * + procedural oscillation layers), crossfades between states,
 * and hands the result to the Rig.
 * Swing/serve contacts land EXACTLY at SWING_CONTACT_DELAY.
 * ============================================================ */

type StateName =
  | 'idle' | 'ready' | 'run' | 'charge'
  | 'swing' | 'serveToss' | 'serveHold' | 'serveHit'
  | 'victory' | 'defeat';

const TWO_PI = Math.PI * 2;

// compiled shared pose library (read-only after compile)
const compiled = new Map<string, Pose>();
function P(name: keyof typeof SPECS & string): Pose {
  let p = compiled.get(name);
  if (!p) {
    p = new Pose(SPECS[name]);
    compiled.set(name, p);
  }
  return p;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Animator {
  private rig: Rig;
  private seed: number;

  private state: StateName = 'idle';
  private stateT = 0;

  // crossfade
  private from = new Pose();
  private fadeT = 1;
  private fadeDur = 0;

  // scratch
  private target = new Pose();
  private out = new Pose();
  private tmp = new Pose();

  // movement
  private mvSpeed = 0;
  private mvX = 0;
  private mvZ = 1;
  private smSpeed = 0;
  private smX = 0;
  private smZ = 1;
  private runPhase = 0;

  // charge / swing
  private chargeSide: SwingSide = 'fore';
  private timeline: Timeline | null = null;
  private timelineNext: StateName = 'ready';
  private timelineNextFade = 0.25;
  private swinging = false;

  // victory flavor
  private victoryVariant = 0;
  private victoryTempo = 1.8;
  private victoryJump = 0.16;

  constructor(rig: Rig, characterId: string) {
    this.rig = rig;
    this.seed = hashStr(characterId);
    this.victoryVariant = this.seed % 2;
    this.victoryTempo = 1.5 + ((this.seed >> 3) % 5) * 0.16;
    this.victoryJump = 0.1 + ((this.seed >> 6) % 4) * 0.035;
    this.setState('ready', 0);
  }

  // ------------------------------------------------ public API

  isSwinging(): boolean {
    return this.swinging;
  }

  currentState(): StateName {
    return this.state;
  }

  setMovement(speed: number, dirX: number, dirZ: number): void {
    this.mvSpeed = Math.max(0, speed);
    if (Math.abs(dirX) + Math.abs(dirZ) > 1e-4) {
      const inv = 1 / Math.hypot(dirX, dirZ);
      this.mvX = dirX * inv;
      this.mvZ = dirZ * inv;
    }
    if (this.state === 'ready' || this.state === 'idle' || this.state === 'run') {
      if (this.mvSpeed > 0.2 && this.state !== 'run') this.setState('run', 0.16);
      else if (this.mvSpeed <= 0.2 && this.state === 'run') this.setState('ready', 0.24);
    }
  }

  startCharge(side: SwingSide): void {
    this.chargeSide = side;
    if (this.state !== 'charge') this.setState('charge', 0.14);
  }

  cancelCharge(): void {
    if (this.state === 'charge') this.setState('ready', 0.28);
  }

  swing(opts: SwingOpts): void {
    this.timeline = this.buildSwing(opts);
    this.timelineNext = 'ready';
    this.timelineNextFade = 0.28;
    this.swinging = true;
    this.setState('swing', 0); // no crossfade: timeline key0 is the live snapshot
  }

  serveToss(): void {
    const tl = new Timeline();
    // The ball leaves the hand immediately and peaks at ~0.47s, so the body
    // must reach the trophy position by then — not half a second later.
    tl.key(0, this.out.clone(), easeLinear);
    tl.key(0.16, P('serveCrouch'), easeInOut);
    tl.key(0.46, P('serveTrophy'), easeInOut);
    this.timeline = tl;
    this.timelineNext = 'serveHold';
    this.timelineNextFade = 0;
    this.swinging = false;
    this.setState('serveToss', 0);
  }

  serveHit(power: number): void {
    const p = THREE.MathUtils.clamp(power, 0, 1);
    const tl = new Timeline();
    tl.key(0, new Pose().copy(this.out), easeLinear);

    // small extra load right before launching up
    const load = new Pose().copy(P('serveTrophy'));
    load.rot('spine1', -4, 0, 0).rot('upperArmR', 6, 0, -6).hipAdd(0, -0.03 - 0.04 * p, 0);
    tl.key(0.05, load, easeOut);

    const contact = new Pose().copy(P('serveContact'));
    contact.hipAdd(0, 0.05 + 0.16 * p, 0); // jump on big serves
    tl.key(SWING_CONTACT_DELAY, contact, easeIn);

    const follow = new Pose().copy(P('serveFollow'));
    follow.hipAdd(0, 0.04 * p, 0);
    tl.key(0.3, follow, easeOutCubic);

    const land = new Pose().copy(P('serveFollow'));
    land.scale(0.8).hipAdd(0, -0.03, 0);
    tl.key(0.52, land, easeInOut);

    this.timeline = tl;
    this.timelineNext = 'ready';
    this.timelineNextFade = 0.26;
    this.swinging = true;
    this.setState('serveHit', 0);
  }

  playVictory(): void {
    this.setState('victory', 0.35);
  }

  playDefeat(): void {
    this.setState('defeat', 0.5);
  }

  playReady(): void {
    this.swinging = false;
    this.setState('ready', 0.3);
  }

  /** relaxed non-gameplay idle (menus, dev viewer) */
  playIdle(): void {
    this.swinging = false;
    this.setState('idle', 0.4);
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.stateT += dt;

    // movement smoothing
    const k = 1 - Math.exp(-10 * dt);
    this.smSpeed += (this.mvSpeed - this.smSpeed) * k;
    this.smX += (this.mvX - this.smX) * k;
    this.smZ += (this.mvZ - this.smZ) * k;

    this.evaluate(this.stateT, dt, this.target);

    if (this.fadeT < this.fadeDur) {
      this.fadeT += dt;
      const u = easeInOut(THREE.MathUtils.clamp(this.fadeT / this.fadeDur, 0, 1));
      this.out.copy(this.from).lerp(this.target, u);
    } else {
      this.out.copy(this.target);
    }

    this.rig.apply(this.out.q, this.out.hip);
  }

  // ------------------------------------------------ internals

  private setState(s: StateName, fade: number): void {
    this.from.copy(this.out);
    this.fadeT = 0;
    this.fadeDur = fade;
    if (fade <= 0) this.fadeT = 1;
    this.state = s;
    this.stateT = 0;
    if (s !== 'swing' && s !== 'serveHit') this.swinging = false;
  }

  private evaluate(t: number, dt: number, out: Pose): void {
    switch (this.state) {
      case 'idle': return this.evalIdle(t, out);
      case 'ready': return this.evalReady(t, out);
      case 'run': return this.evalRun(t, dt, out);
      case 'charge': return this.evalCharge(t, out);
      case 'swing':
      case 'serveToss':
      case 'serveHit':
        return this.evalTimeline(t, out);
      case 'serveHold': return this.evalServeHold(t, out);
      case 'victory': return this.evalVictory(t, out);
      case 'defeat': return this.evalDefeat(t, out);
    }
  }

  private evalIdle(t: number, out: Pose): void {
    out.copy(P('idle'));
    const br = Math.sin(t * TWO_PI * 0.32 + this.seed);
    out.rot('spine2', 1.6 * br, 0, 0);
    out.rot('spine3', 1.1 * br, 0, 0);
    out.rot('shoulderL', 0, 0, 1.2 * br);
    out.rot('shoulderR', 0, 0, -1.2 * br);
    out.rot('head', -1.4 * br, 1.5 * Math.sin(t * 0.5 + this.seed), 0);
    // tiny weight shift
    const w = Math.sin(t * TWO_PI * 0.11 + this.seed * 0.7);
    out.hipAdd(0.014 * w, 0.004 * Math.sin(t * TWO_PI * 0.32), 0);
    out.rot('hips', 0, 0, -1.4 * w);
  }

  private evalReady(t: number, out: Pose): void {
    out.copy(P('ready'));
    // gentle athletic bounce
    const bp = t * TWO_PI * 1.35 + this.seed;
    out.hipAdd(0, 0.016 * Math.sin(bp * 2) - 0.008, 0);
    // side-to-side weight shift
    const w = Math.sin(t * TWO_PI * 0.45 + this.seed);
    out.hipAdd(0.02 * w, 0, 0);
    out.rot('hips', 0, 0, -1.6 * w);
    out.rot('spine2', 0, 2 * w, 1.2 * w);
    // breathing
    const br = Math.sin(t * TWO_PI * 0.4);
    out.rot('spine2', 1.2 * br, 0, 0);
    // racquet micro sway
    out.rot('upperArmR', 1.5 * Math.sin(bp), 0, -1.5 * Math.sin(bp * 0.5));
    out.rot('upperArmL', 1.5 * Math.sin(bp), 0, 1.5 * Math.sin(bp * 0.5));
  }

  private evalRun(t: number, dt: number, out: Pose): void {
    const speed = this.smSpeed;
    const r = THREE.MathUtils.clamp(speed / 7, 0, 1); // walk→run factor
    const dx = this.smX;
    const dz = this.smZ;
    const aSide = Math.abs(dx);
    const aFwd = Math.abs(dz);
    const wSide = aSide / Math.max(1e-4, aSide + aFwd); // 0 = pure fwd/back, 1 = pure sidestep
    const shuffle = wSide > 0.55 ? (wSide - 0.55) / 0.45 : 0;
    const back = dz < -0.35 ? THREE.MathUtils.clamp((-dz - 0.35) / 0.65, 0, 1) * (1 - shuffle) : 0;

    // stride frequency scales with speed (full cycle = 2 steps)
    const freq = (1.35 + 0.17 * speed) * (1 + 0.18 * shuffle);
    this.runPhase = (this.runPhase + dt * freq * TWO_PI) % (TWO_PI * 1024);
    const ph = this.runPhase;
    const s = Math.sin(ph);
    const c = Math.cos(ph);

    // base: half-ready + run lean
    out.copy(P('ready')).scale(0.45 + 0.15 * shuffle);
    this.tmp.copy(P('runLean')).scale(0.4 + 0.6 * r);
    out.add(this.tmp);

    const fwd = 1 - shuffle;
    // ---- legs (counter-phase) ----
    const A = (16 + 34 * r) * fwd * (1 - 0.35 * back);
    out.rot('thighL', -A * s, 0, 0);
    out.rot('thighR', A * s, 0, 0);
    // knee bends while the leg swings through + on lift
    const K = (18 + 40 * r) * fwd;
    const kneeL = THREE.MathUtils.clamp(Math.sin(ph + 2.3), 0, 1);
    const kneeR = THREE.MathUtils.clamp(Math.sin(ph + 2.3 + Math.PI), 0, 1);
    out.rot('shinL', K * kneeL, 0, 0);
    out.rot('shinR', K * kneeR, 0, 0);
    // ankles: toe-off / heel plant
    out.rot('footL', (-8 + 14 * s) * fwd * r, 0, 0);
    out.rot('footR', (-8 - 14 * s) * fwd * r, 0, 0);

    // ---- sidestep shuffle: legs abduct together, quick small steps ----
    if (shuffle > 0.01) {
      const sd = Math.sign(dx) || 1;
      const S = (10 + 16 * r) * shuffle;
      // legs open/close laterally (gallop), knees stay bent
      out.rot('thighL', -6 * shuffle, 0, (10 + S * s) * shuffle * sd * (sd > 0 ? 1 : 1));
      out.rot('thighR', -6 * shuffle, 0, (-10 + S * s) * shuffle * sd);
      out.rot('shinL', (14 + 8 * Math.max(0, s * sd)) * shuffle, 0, 0);
      out.rot('shinR', (14 + 8 * Math.max(0, -s * sd)) * shuffle, 0, 0);
      // lean into the movement
      out.rot('hips', 0, 0, -8 * shuffle * dx);
      out.rot('spine1', 0, 0, -4 * shuffle * dx);
    }

    // ---- torso ----
    const lean = (7 + 8 * r) * (1 - shuffle) * (back > 0 ? -0.5 : 1);
    out.rot('hips', lean * 0.5, 0, 0);
    out.rot('spine1', lean * 0.5, (5 + 4 * r) * s * fwd, -3 * r * s * fwd);
    out.rot('head', -lean * 0.7, 0, 0);

    // ---- arms (counter-phase with legs; racquet arm swings less) ----
    const B = (14 + 30 * r) * fwd * (1 - 0.5 * shuffle);
    out.rot('upperArmL', B * s, 0, 0);
    out.rot('upperArmR', -B * 0.45 * s, 0, 0);
    out.rot('forearmL', -Math.max(0, -s) * 14 * r * fwd, 0, 0);

    // ---- hip bob: two dips per cycle ----
    const bob = (0.018 + 0.03 * r) * (1 - 0.4 * shuffle);
    out.hipAdd(0, -bob + bob * Math.abs(c), 0);
    // slight lateral sway with steps
    out.hipAdd(0.012 * s * fwd * r, 0, 0);
  }

  private evalCharge(t: number, out: Pose): void {
    const side = this.chargeSide;
    out.copy(side === 'fore' ? P('chargeFore') : side === 'back' ? P('chargeBack') : P('chargeOver'));
    // anticipation bounce while holding the charge
    const bp = t * TWO_PI * 2.1;
    out.hipAdd(0, 0.012 * Math.sin(bp) - 0.006, 0);
    const pump = Math.sin(bp) * (1 - Math.exp(-t * 3));
    if (side === 'fore') {
      out.rot('upperArmR', 0, -1.6 * pump, -2.2 * pump);
      out.rot('spine2', 0, -1.5 * pump, 0);
    } else if (side === 'back') {
      out.rot('upperArmR', 0, 1.6 * pump, 2.2 * pump);
      out.rot('spine2', 0, 1.5 * pump, 0);
    } else {
      out.rot('forearmR', 2.5 * pump, 0, 0);
      out.rot('spine2', -1.2 * pump, 0, 0);
    }
  }

  private evalTimeline(t: number, out: Pose): void {
    const tl = this.timeline;
    if (!tl) {
      out.copy(P('ready'));
      return;
    }
    tl.sample(t, out);
    if (t >= tl.duration) {
      const next = this.timelineNext;
      const fade = this.timelineNextFade;
      this.timeline = null;
      this.setState(next, fade);
      // re-evaluate the new state at t=0 so this frame is valid
      this.evaluate(0, 0, out);
    }
  }

  private evalServeHold(t: number, out: Pose): void {
    out.copy(P('serveTrophy'));
    const sway = Math.sin(t * TWO_PI * 0.7);
    out.rot('spine2', 1.2 * sway, 0, 0);
    out.rot('upperArmL', 1.5 * sway, 0, 1.2 * sway);
    out.hipAdd(0, 0.008 * Math.sin(t * TWO_PI * 1.4), 0);
  }

  private evalVictory(t: number, out: Pose): void {
    const tempo = this.victoryTempo;
    const ph = t * TWO_PI * tempo;
    const hop = Math.max(0, Math.sin(ph));
    if (this.victoryVariant === 0) {
      // racquet pump + hops
      out.copy(P('victoryPump'));
      const pump = Math.sin(ph);
      out.rot('upperArmR', 0, 0, 18 * pump);
      out.rot('forearmR', 22 * pump, 0, 0);
      out.rot('upperArmL', -6 * pump, 0, 4 * pump);
      out.rot('spine1', -3 * pump, 4 * pump, 0);
      out.hipAdd(0, this.victoryJump * hop * hop, 0);
      const land = Math.max(0, -Math.sin(ph)) * 0.5;
      out.rot('thighL', -14 * land, 0, 0);
      out.rot('thighR', -14 * land, 0, 0);
      out.rot('shinL', 22 * land, 0, 0);
      out.rot('shinR', 22 * land, 0, 0);
      out.hipAdd(0, -0.05 * land, 0);
    } else {
      // both arms up, bouncing celebration
      out.copy(P('victoryUp'));
      const b = Math.sin(ph);
      out.rot('upperArmL', 0, 0, 10 * b);
      out.rot('upperArmR', 0, 0, -10 * b);
      out.rot('spine1', 0, 6 * Math.sin(ph * 0.5), 0);
      out.rot('head', -4 * b, 0, 0);
      out.hipAdd(0, this.victoryJump * 1.15 * hop * hop, 0);
      const land = Math.max(0, -b) * 0.5;
      out.rot('thighL', -12 * land, 0, 0);
      out.rot('thighR', -12 * land, 0, 0);
      out.rot('shinL', 20 * land, 0, 0);
      out.rot('shinR', 20 * land, 0, 0);
      out.hipAdd(0, -0.04 * land, 0);
    }
  }

  private evalDefeat(t: number, out: Pose): void {
    out.copy(P('defeat'));
    const sway = Math.sin(t * TWO_PI * 0.28 + this.seed);
    out.rot('spine1', 0, 0, 2.5 * sway);
    out.rot('head', 2 * Math.sin(t * TWO_PI * 0.2), 0, -2 * sway);
    out.hipAdd(0.012 * sway, 0.006 * Math.sin(t * TWO_PI * 0.5), 0);
    // heavy breathing
    out.rot('spine2', 2.2 * Math.sin(t * TWO_PI * 0.55), 0, 0);
  }

  // ------------------------------------------------ swing construction

  private buildSwing(opts: SwingOpts): Timeline {
    const { side } = opts;
    const kind = opts.kind;
    const p = THREE.MathUtils.clamp(opts.power, 0, 1);
    const tl = new Timeline();

    const overhead = side === 'overhead' || kind === 'smash' || kind === 'serve';
    const fore = side === 'fore' && !overhead;

    const chargeP = overhead ? P('chargeOver') : fore ? P('chargeFore') : P('chargeBack');
    const contactP = overhead ? P('contactOver') : fore ? P('contactFore') : P('contactBack');
    const followP = overhead ? P('followOver') : fore ? P('followFore') : P('followBack');

    // key 0: whatever the body is doing right now (charging or not)
    tl.key(0, new Pose().copy(this.out), easeLinear);

    // quick anticipation: settle into (or deepen) the windup
    const windup = new Pose().copy(chargeP);
    const lat = fore ? 1 : -1; // coil direction
    if (kind === 'topspin' || kind === 'lob') windup.hipAdd(0, -0.05, 0); // load low
    if (kind === 'slice') {
      windup.rot('upperArmR', -18, 0, overhead ? 0 : -14 * lat); // racquet prepared higher
      windup.hipAdd(0, 0.02, 0);
    }
    if (kind === 'star') {
      windup.rot('hips', 0, 14 * lat, 0);
      windup.rot('spine1', 0, 8 * lat, 0);
      windup.hipAdd(0, -0.04, 0);
    }
    tl.key(0.055, windup, easeOut);

    // CONTACT — exactly at SWING_CONTACT_DELAY
    const contact = new Pose().copy(contactP);
    if (kind === 'topspin') contact.rot('handR', 0, 0, fore ? 10 : -10); // brushing face
    if (kind === 'slice') {
      contact.rot('upperArmR', -10, 0, 0);
      contact.rot('handR', 0, 0, fore ? -14 : 14); // open face
      contact.hipAdd(0, 0.02, 0);
    }
    if (kind === 'lob') {
      contact.rot('upperArmR', 14, 0, 0);
      contact.rot('handR', -12, 0, fore ? -18 : 18);
      contact.hipAdd(0, -0.03, 0);
    }
    if (kind === 'drop') contact.scale(0.85);
    if (kind === 'flat' || kind === 'star') contact.scale(1.0);
    if (overhead) contact.hipAdd(0, 0.05 + 0.14 * p, 0);
    tl.key(SWING_CONTACT_DELAY, contact, easeIn);

    // FOLLOW-THROUGH
    const follow = new Pose().copy(followP);
    const vigor = 0.8 + 0.4 * p;
    follow.scale(Math.min(1, vigor));
    if (kind === 'topspin') follow.rot('upperArmR', -26, 0, fore ? -10 : 10); // low-to-high finish
    if (kind === 'slice') {
      follow.rot('upperArmR', 30, 0, 0); // high-to-low
      follow.hipAdd(0, 0.02, -0.01);
    }
    if (kind === 'lob') {
      follow.rot('upperArmR', -44, 0, fore ? -18 : 18); // scoop way up
      follow.rot('spine1', -6, 0, 0);
    }
    if (kind === 'drop') follow.scale(0.55);
    if (kind === 'flat') follow.rot('spine1', 0, 8 * -lat, 0);

    if (kind === 'star') {
      // extra dramatic: leap + full body spin, then land
      follow.hipAdd(0, 0.3, 0);
      tl.key(0.26, follow, easeOutCubic);
      const spin1 = new Pose().copy(follow);
      spin1.rot('hips', 0, 120 * -lat, 0).hipAdd(0, 0.1, 0);
      tl.key(0.38, spin1, easeLinear);
      const spin2 = new Pose().copy(follow);
      spin2.rot('hips', 0, 240 * -lat, 0).hipAdd(0, 0.02, 0);
      tl.key(0.5, spin2, easeLinear);
      const land = new Pose().copy(P('ready'));
      land.rot('hips', 0, 350 * -lat > 180 ? -10 * lat : 350 * -lat, 0); // wrap to ~full turn
      land.hipAdd(0, -0.06, 0);
      tl.key(0.64, land, easeOut);
      const settle = new Pose().copy(P('ready'));
      tl.key(0.8, settle, easeInOut);
      return tl;
    }

    if (kind === 'drop') {
      tl.key(0.24, follow, easeOutCubic);
      tl.key(0.4, new Pose().copy(follow).scale(0.8), easeInOut);
    } else if (overhead) {
      tl.key(0.3, follow, easeOutCubic);
      const land = new Pose().copy(follow);
      land.scale(0.85).hipAdd(0, -0.05, 0);
      land.rot('thighL', -8, 0, 0).rot('thighR', -8, 0, 0).rot('shinL', 14, 0, 0).rot('shinR', 14, 0, 0);
      tl.key(0.5, land, easeInOut);
    } else {
      tl.key(0.28 - 0.03 * p, follow, easeOutCubic);
      const settle = new Pose().copy(follow).scale(0.82);
      tl.key(0.48, settle, easeInOut);
    }
    return tl;
  }
}
