import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { Ball } from './ball';
import type { Actor } from './actors';
import type { MatchFx } from './effects';

/* AI controller: fills actor.intent each frame. Competent but beatable —
 * reaction delay, positional sloppiness, occasional conservative shots. */

/** how far ahead the CPU reads the ball, and at what resolution */
const AI_HORIZON = 1.6;
const AI_SAMPLES = 24;
/** ball heights the CPU considers comfortably playable */
const HIT_BAND_LO = 0.35;
const HIT_BAND_HI = 2.1;
/** don't chase a ball already sailing far out of play */
const CHASE_LIMIT_X = COURT.widthDoubles / 2 + 2.5;
const CHASE_LIMIT_Z = COURT.halfLength + 3;

export class AiBrain {
  private reactT = 0;
  private intercept = new THREE.Vector3();
  private hasIntercept = false;
  private plannedBtn: 'a' | 'b' | 'x' | 'y' = 'a';
  private aim = { x: 0, y: 0.4 };
  private wobble = Math.random() * 100;
  /** per-incoming-ball read error (m); rolled when a new ball comes our way */
  private readErr = 0;
  private readErrZ = 0;
  /** a fully blown read: runs to the wrong spot and never swings */
  private willMiss = false;
  private wasIncoming = false;
  private _strike = new THREE.Vector3();
  private _path: THREE.Vector3[] = Array.from({ length: 24 }, () => new THREE.Vector3());
  /** seconds until the ball reaches a hittable point on our side (-1 unknown) */
  private tStrike = -1;

  constructor(private actor: Actor) {}

  /** decide + write actor.intent; matchCtx gives situational info */
  update(dt: number, ctx: {
    ball: Ball;
    ballLive: boolean;
    myTeamMayHit: boolean;
    iAmReceiver: boolean; // designated to take this ball
    opponents: Actor[];
    partner: Actor | null;
    fx: MatchFx;
    singles: boolean;
    rallyLen: number;
  }): void {
    const a = this.actor;
    const it = a.intent;
    it.shotPressed = '';
    it.moveX = 0; it.moveZ = 0;
    this.wobble += dt;

    const ball = ctx.ball;
    const towardUs = ctx.ballLive && Math.sign(ball.vel.z) === Math.sign(a.dir) && ball.active;

    // roll a fresh "read" when a new ball starts coming our way; longer
    // rallies breed bigger mistakes so points actually end (Mario-Tennis CPU feel)
    const incoming = towardUs && ctx.myTeamMayHit;
    if (incoming && !this.wasIncoming) {
      const missChance = Math.min(0.34, 0.045 + ctx.rallyLen * 0.028);
      this.willMiss = Math.random() < missChance;
      // A miss means being genuinely beaten — caught out of position far
      // enough that the ball goes by — not standing next to it doing nothing.
      this.readErr = this.willMiss
        ? (2.8 + Math.random() * 1.8) * (Math.random() < 0.5 ? -1 : 1)
        : (Math.random() - 0.5) * 0.5;
      this.readErrZ = this.willMiss ? (Math.random() - 0.5) * 3.0 : 0;
      this.reactT = this.willMiss ? -0.25 : 0; // and a beat slow to read it

    }
    this.wasIncoming = incoming;

    if (ctx.ballLive && ctx.myTeamMayHit && ctx.iAmReceiver && towardUs) {
      this.reactT += dt;
      if (this.reactT > 0.10) {
        // Meet the ball where it is genuinely playable with the least running:
        // scan its future path for points on our side at a hittable height and
        // take the nearest one. (Waiting for it to drop to waist height puts
        // you metres behind the baseline on a hard serve.)
        ball.sampleForward(AI_HORIZON, AI_SAMPLES, this._path);
        // Take the ball at the EARLIEST point we can actually run to. Picking
        // the merely-nearest point makes the CPU chase a spinning ball's
        // far-future drift, forever trailing it and never setting up.
        let bestI = -1;
        let fallbackI = -1;
        let fallbackD = Infinity;
        for (let i = 0; i < AI_SAMPLES; i++) {
          const sp = this._path[i];
          if (Math.sign(sp.z) !== Math.sign(a.dir)) continue;
          if (sp.y < HIT_BAND_LO || sp.y > HIT_BAND_HI) continue;
          if (Math.abs(sp.x) > CHASE_LIMIT_X || Math.abs(sp.z) > CHASE_LIMIT_Z) continue;
          const d = Math.hypot(sp.x - a.pos.x, sp.z - a.pos.z);
          if (d < fallbackD) { fallbackD = d; fallbackI = i; }
          if (bestI >= 0) continue;
          const t = ((i + 1) / AI_SAMPLES) * AI_HORIZON;
          if (d <= a.maxSpeed * t + a.reachStand) bestI = i; // reachable in time
        }
        if (bestI < 0) bestI = fallbackI;
        if (bestI >= 0) {
          const sp = this._path[bestI];
          this.tStrike = ((bestI + 1) / AI_SAMPLES) * AI_HORIZON;
          this.intercept.set(sp.x + this.readErr, 0, sp.z + this.readErrZ);
        } else {
          const land = this._strike;
          const lt = ball.predictLanding(land);
          this.tStrike = lt;
          this.intercept.set(
            land.x + this.readErr, 0,
            lt >= 0 ? land.z + Math.sign(a.dir) * 1.15 : a.pos.z,
          );
        }
        // chance-shot star on our side? go for it
        if (ctx.fx.starActive && Math.sign(ctx.fx.starPos.z) === Math.sign(a.dir)) {
          this.intercept.set(ctx.fx.starPos.x, 0, ctx.fx.starPos.z);
        }
        this.hasIntercept = true;
      }
      if (this.hasIntercept) {
        this.moveToward(this.intercept, dt, 1);
        // sprint when there is real ground to cover and stamina to spend
        const gap = Math.hypot(this.intercept.x - a.pos.x, this.intercept.z - a.pos.z);
        a.sprintHeld = gap > 2.8 && a.energy > 0.28;
        // start charging when ball is inbound and close-ish in time
        // (a blown read never commits to the swing — the ball passes by)
        // Only wind up once nearly in position — charging costs speed, so
        // committing early is what leaves the CPU stranded mid-court.
        const toSpot = Math.hypot(this.intercept.x - a.pos.x, this.intercept.z - a.pos.z);
        const nearlyThere = toSpot < 2.4;
        const soon = this.tStrike >= 0 && this.tStrike < 0.85;
        // Safety net: if the ball is already inside our reach we swing, full
        // stop. Positional heuristics must never talk us out of a ball we can
        // physically touch.
        const inReachNow = Math.hypot(ball.pos.x - a.pos.x, ball.pos.z - a.pos.z) < a.reachStand * 1.15
          && ball.pos.y < 2.3;
        if (!a.charging && a.swingLock <= 0 && (inReachNow || (!this.willMiss && (nearlyThere || soon)))) {
          this.chooseShot(ctx);
          it.shotPressed = this.plannedBtn;
          it.aimX = this.aim.x; it.aimY = this.aim.y;
        }
        if (a.charging) { it.aimX = this.aim.x; it.aimY = this.aim.y; }
      }
    } else {
      // recover to formation at a jog, saving stamina for the next ball
      a.sprintHeld = false;
      this.reactT = 0;
      this.hasIntercept = false;
      const home = this.homePosition(ctx);
      this.moveToward(home, dt, 0.8);
    }
  }

  private moveToward(p: THREE.Vector3, dt: number, urgency: number): void {
    const a = this.actor;
    const dx = p.x - a.pos.x;
    const dz = p.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.18) return;
    const s = Math.min(1, d / 1.2) * urgency;
    this.actor.intent.moveX = (dx / d) * s;
    this.actor.intent.moveZ = (dz / d) * s;
  }

  private homePosition(ctx: { singles: boolean; partner: Actor | null }): THREE.Vector3 {
    const a = this.actor;
    const zBase = Math.sign(a.dir) * (COURT.halfLength - 1.6);
    if (!ctx.partner) {
      return new THREE.Vector3(Math.sin(this.wobble * 0.3) * 0.4, 0, zBase);
    }
    // doubles: cover our half (by slot order)
    const leftSide = a.slot < (ctx.partner?.slot ?? 99);
    const x = (leftSide ? -1 : 1) * COURT.widthDoubles * 0.22;
    // one up one back-ish
    const z = leftSide ? zBase : Math.sign(a.dir) * (COURT.halfLength * 0.45);
    return new THREE.Vector3(x, 0, z);
  }

  private chooseShot(ctx: { opponents: Actor[]; ball: Ball; fx: MatchFx; singles: boolean }): void {
    const a = this.actor;
    const opps = ctx.opponents;
    const allNet = opps.every((o) => Math.abs(o.pos.z) < COURT.halfLength * 0.45);
    const allDeep = opps.every((o) => Math.abs(o.pos.z) > COURT.halfLength * 0.75);
    const meAtNet = Math.abs(a.pos.z) < COURT.halfLength * 0.5;
    const r = Math.random();

    if (allNet && r < 0.55) this.plannedBtn = 'x';           // lob over net rushers
    else if (allDeep && meAtNet && r < 0.4) this.plannedBtn = 'a'; // (drop needs combo; keep simple topspin/slice)
    else if (r < 0.62) this.plannedBtn = 'a';                // topspin bread & butter
    else if (r < 0.85) this.plannedBtn = 'b';                // slice mix
    else this.plannedBtn = 'y';                              // flat rip

    // aim away from the nearest opponent, with sloppiness
    let bestX = 0, bestScore = -1;
    for (const cand of [-0.85, -0.4, 0, 0.4, 0.85]) {
      const worldX = cand * COURT.widthSingles * 0.5;
      let minD = 99;
      for (const o of opps) minD = Math.min(minD, Math.abs(o.pos.x - worldX));
      const score = minD + Math.random() * 1.5;
      if (score > bestScore) { bestScore = score; bestX = cand; }
    }
    this.aim.x = THREE.MathUtils.clamp(bestX + (Math.random() - 0.5) * 0.25, -1, 1);
    this.aim.y = this.plannedBtn === 'y' ? 0.6 : THREE.MathUtils.lerp(0.1, 0.8, Math.random());
  }

  /** serve behavior: returns 'toss' | 'hit' | '' */
  serveTick(dt: number, tossAirTime: number, tossActive: boolean): 'toss' | 'hit' | '' {
    if (!tossActive) {
      this.reactT += dt;
      if (this.reactT > 0.9 + Math.random() * 0.4) { this.reactT = 0; return 'toss'; }
      return '';
    }
    // hit near apex (~0.47s) with noise
    if (tossAirTime > 0.4 + Math.random() * 0.12) {
      this.aim.x = (Math.random() - 0.5) * 1.4;
      return 'hit';
    }
    return '';
  }

  get serveAimX(): number { return THREE.MathUtils.clamp(this.aim.x, -1, 1); }
}
