import * as THREE from 'three';
import { COURT, PLAYER_BASE_SPEED } from '../core/constants';
import type { Avatar, PadState, ShotKind, SwingSide } from '../core/types';

/* An actor = one character on court (human- or AI-controlled).
 * The controller fills `intent` each frame; the actor integrates movement,
 * charge state and animation. The MatchController resolves ball contact. */

export interface ActorIntent {
  moveX: number; // world-space desired dir (screen-space == world-space here)
  moveZ: number;
  /** shot button newly pressed this frame ('' = none) */
  shotPressed: 'a' | 'b' | 'x' | 'y' | '';
  aimX: number; // -1..1
  aimY: number;
}

const COMBO_WINDOW = 0.24;
/** sprint tuning: a sustained boost you steer, not a fixed-length dash */
const SPRINT_SPEED_MUL = 1.5;
/** full bar lasts this long at a flat sprint (seconds) */
const SPRINT_DRAIN = 1 / 2.6;
/** and refills in about this long once released */
const SPRINT_REGEN = 1 / 3.4;
/** pause before stamina starts coming back */
const SPRINT_REGEN_DELAY = 0.35;
/** after bottoming out, this much must be banked before sprinting again */
const SPRINT_UNLOCK_AT = 0.25;

export class Actor {
  readonly pos: THREE.Vector3;
  vel = new THREE.Vector3();
  charging = false;
  chargeTime = 0;
  chargeKind: ShotKind = 'topspin';
  chargeSide: SwingSide = 'fore';
  private comboT = 0;
  private firstBtn: 'a' | 'b' | 'x' | 'y' | '' = '';
  /** button that opened the current wind-up (for release detection) */
  get chargeBtn(): 'a' | 'b' | 'x' | 'y' | '' { return this.firstBtn; }
  swingLock = 0; // seconds until able to act after a swing
  intent: ActorIntent = { moveX: 0, moveZ: 0, shotPressed: '', aimX: 0, aimY: 0 };
  readonly maxSpeed: number;
  readonly reach: number;
  readonly powerMul: number;
  readonly spinMul: number;
  /** pad for rumble (humans only) */
  pad: PadState | null = null;

  /* --- sprint (hold LB): sustained extra speed, spends stamina --- */
  /** 0..1 stamina; drains while sprinting, recovers when you let go */
  energy = 1;
  /** set each frame by the controller: is the sprint button held? */
  sprintHeld = false;
  private sprinting = false;
  private regenDelay = 0;
  get isSprinting(): boolean { return this.sprinting; }
  /** stamina is gated: once emptied you must recover a little before re-sprinting */
  private sprintLocked = false;

  /* --- lunge: a committed dive/leap that extends effective reach --- */
  private lungeT = 0;
  private lungeDur = 0;
  private lungeFrom = new THREE.Vector3();
  private lungeTo = new THREE.Vector3();
  private lungeHop = 0;
  get isLunging(): boolean { return this.lungeT < this.lungeDur; }

  constructor(
    readonly avatar: Avatar,
    readonly slot: number,
    readonly team: 0 | 1,
    readonly isHuman: boolean,
  ) {
    const st = avatar.def.stats;
    this.maxSpeed = PLAYER_BASE_SPEED * (0.82 + st.speed * 0.09);
    this.reach = 1.55 + st.reach * 0.14;
    this.powerMul = 0.88 + st.power * 0.055;
    this.spinMul = 0.7 + st.spin * 0.12;
    this.pos = avatar.root.position;
    // face the net
    avatar.root.rotation.y = team === 0 ? Math.PI : 0;
  }

  /** +1 when this actor's shots travel toward -z (team0), else -1 */
  get dir(): 1 | -1 { return this.team === 0 ? 1 : -1; }

  /** forehand is on world +x for team0 (facing -z), world -x for team1 */
  sideForBallX(ballX: number): SwingSide {
    const rightWorld = this.team === 0 ? 1 : -1;
    return Math.sign(ballX - this.pos.x) * rightWorld >= 0 ? 'fore' : 'back';
  }

  beginCharge(btn: 'a' | 'b' | 'x' | 'y', side: SwingSide): void {
    this.charging = true;
    this.chargeTime = 0;
    this.comboT = COMBO_WINDOW;
    this.firstBtn = btn;
    this.chargeKind = btn === 'a' ? 'topspin' : btn === 'b' ? 'slice' : btn === 'x' ? 'lob' : 'flat';
    this.chargeSide = side;
    this.avatar.startCharge(side);
  }

  /** second button press while charging → combo shots; the SAME button
   *  again is Mario Tennis's double-tap, which pumps extra charge in */
  comboPress(btn: 'a' | 'b' | 'x' | 'y'): void {
    if (!this.charging) return;
    if (btn === this.firstBtn) {
      this.chargeTime = Math.min(this.chargeTime + 0.45, 1.4);
      return;
    }
    if (this.comboT > 0) {
      if (this.firstBtn === 'a' && btn === 'b') this.chargeKind = 'drop';
      else if (this.firstBtn === 'b' && btn === 'a') this.chargeKind = 'lob';
      else if ((this.firstBtn === 'a' && btn === 'y') || (this.firstBtn === 'y' && btn === 'a')) this.chargeKind = 'flat';
    }
  }

  cancelCharge(): void {
    if (!this.charging) return;
    this.charging = false;
    this.chargeTime = 0;
    this.avatar.cancelCharge();
  }

  /** charge power 0..1 (fills in ~1s) */
  get charge(): number { return Math.min(1, this.chargeTime / 0.8); }

  /** horizontal reach when standing still */
  get reachStand(): number { return this.reach; }
  /** reach when allowed to dive/leap for it (Mario-Tennis-style stretch) */
  get reachExtended(): number { return this.reach * 1.62; }

  /**
   * Commit to a dive/leap toward a contact point just outside normal reach.
   * The body travels there over `dur` so the racquet arrives with the ball;
   * `hop` lifts the character off the ground for high balls and long dives.
   */
  startLunge(x: number, z: number, dur: number, hop: number): void {
    this.lungeFrom.copy(this.pos);
    this.lungeTo.set(x, 0, z);
    this.lungeDur = Math.max(0.05, dur);
    this.lungeT = 0;
    this.lungeHop = hop;
    this.vel.set(0, 0, 0);
  }

  update(dt: number): void {
    if (this.swingLock > 0) this.swingLock -= dt;

    if (this.charging) {
      this.chargeTime += dt;
      if (this.comboT > 0) this.comboT -= dt;
    }

    // a lunge overrides normal locomotion until it lands
    if (this.lungeT < this.lungeDur) {
      this.lungeT += dt;
      const k = Math.min(1, this.lungeT / this.lungeDur);
      const ease = 1 - (1 - k) * (1 - k); // ease-out: explosive push, soft arrival
      this.pos.x = THREE.MathUtils.lerp(this.lungeFrom.x, this.lungeTo.x, ease);
      this.pos.z = THREE.MathUtils.lerp(this.lungeFrom.z, this.lungeTo.z, ease);
      this.pos.y = this.lungeHop * Math.sin(Math.PI * Math.min(1, k * 1.15));
      this.avatar.setMovement(0, 0, 0);
      this.avatar.update(dt);
      if (this.lungeT >= this.lungeDur) this.pos.y = 0;
      return;
    }

    // --- sprint & stamina ---
    // Sprinting is just a speed multiplier, so you keep full steering and can
    // still wind up and swing out of it; it simply costs stamina.
    const wantsSprint = this.sprintHeld
      && !this.sprintLocked
      && this.energy > 0
      && Math.hypot(this.intent.moveX, this.intent.moveZ) > 0.15
      && !this.avatar.isSwinging();
    this.sprinting = wantsSprint;
    if (wantsSprint) {
      this.energy = Math.max(0, this.energy - SPRINT_DRAIN * dt);
      this.regenDelay = SPRINT_REGEN_DELAY;
      if (this.energy <= 0) this.sprintLocked = true;
    } else {
      if (this.regenDelay > 0) this.regenDelay -= dt;
      else this.energy = Math.min(1, this.energy + SPRINT_REGEN * dt);
      if (this.sprintLocked && this.energy >= SPRINT_UNLOCK_AT) this.sprintLocked = false;
    }

    // movement: full speed normally, slowed while charging, frozen mid-swing
    const speedMul = (this.avatar.isSwinging() ? 0.15 : this.charging ? 0.72 : 1)
      * (this.sprinting ? SPRINT_SPEED_MUL : 1);
    const target = new THREE.Vector3(this.intent.moveX, 0, this.intent.moveZ);
    if (target.lengthSq() > 1) target.normalize();
    target.multiplyScalar(this.maxSpeed * speedMul);
    const accel = 34;
    this.vel.x = THREE.MathUtils.damp(this.vel.x, target.x, accel / this.maxSpeed, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, target.z, accel / this.maxSpeed, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    this.clampToSide();

    // animation: convert world vel to avatar-local (team0 faces -z ⇒ local +x = world -x? avatar faces +z at yaw 0; yaw π flips x and z)
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const f = this.team === 0 ? -1 : 1;
    if (spd > 0.05) {
      this.avatar.setMovement(spd, (this.vel.x / spd) * f, (this.vel.z / spd) * f);
    } else {
      this.avatar.setMovement(0, 0, 0);
    }
    this.avatar.update(dt);
  }

  /** keep the player on their own side of the net and inside the run-off */
  private clampToSide(): void {
    const xLim = COURT.widthDoubles / 2 + 3.2;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -xLim, xLim);
    const zNear = 0.9, zFar = COURT.halfLength + COURT.runoff - 1.5;
    if (this.team === 0) this.pos.z = THREE.MathUtils.clamp(this.pos.z, zNear, zFar);
    else this.pos.z = THREE.MathUtils.clamp(this.pos.z, -zFar, -zNear);
  }

  teleport(x: number, z: number): void {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.lungeT = this.lungeDur = 0;
    this.sprinting = false;
    this.sprintHeld = false;
  }
}
