import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { Ball } from './ball';
import type { Actor } from './actors';
import type { MatchFx } from './effects';

/* AI controller: fills actor.intent each frame. Competent but beatable —
 * reaction delay, positional sloppiness, occasional conservative shots. */

export class AiBrain {
  private reactT = 0;
  private intercept = new THREE.Vector3();
  private hasIntercept = false;
  private plannedBtn: 'a' | 'b' | 'x' | 'y' = 'a';
  private aim = { x: 0, y: 0.4 };
  private wobble = Math.random() * 100;

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
  }): void {
    const a = this.actor;
    const it = a.intent;
    it.shotPressed = '';
    it.moveX = 0; it.moveZ = 0;
    this.wobble += dt;

    const ball = ctx.ball;
    const towardUs = ctx.ballLive && Math.sign(ball.vel.z) === Math.sign(a.dir) && ball.active;

    if (ctx.ballLive && ctx.myTeamMayHit && ctx.iAmReceiver && towardUs) {
      this.reactT += dt;
      if (this.reactT > 0.18) {
        // predict a good contact point: landing spot advanced by post-bounce drift
        const land = new THREE.Vector3();
        const t = ball.predictLanding(land);
        if (t >= 0) {
          this.intercept.set(
            land.x + ball.vel.x * 0.12,
            0,
            land.z + Math.sign(a.dir) * 1.15, // stand a step behind the bounce
          );
        } else {
          this.intercept.set(ball.pos.x, 0, a.pos.z);
        }
        // chance-shot star on our side? go for it
        if (ctx.fx.starActive && Math.sign(ctx.fx.starPos.z) === Math.sign(a.dir)) {
          this.intercept.set(ctx.fx.starPos.x, 0, ctx.fx.starPos.z);
        }
        this.hasIntercept = true;
      }
      if (this.hasIntercept) {
        this.moveToward(this.intercept, dt, 1);
        // start charging when ball is inbound and close-ish in time
        const dist = a.pos.distanceTo(ball.pos);
        if (!a.charging && a.swingLock <= 0 && (dist < 7 || ball.pos.distanceTo(this.intercept) < 6)) {
          this.chooseShot(ctx);
          it.shotPressed = this.plannedBtn;
          it.aimX = this.aim.x; it.aimY = this.aim.y;
        }
        if (a.charging) { it.aimX = this.aim.x; it.aimY = this.aim.y; }
      }
    } else {
      // recover to formation
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
