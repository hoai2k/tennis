import * as THREE from 'three';
import { COURT } from '../core/constants';

/* Mario Tennis style camera: elevated behind team 0's baseline, gently
 * tracking the ball laterally and pushing in/out with rally depth. */

/** Fraction of the frame treated as safe (NDC) before the camera retreats.
 *  These, not the base shot, are what actually set the camera distance in a
 *  rally — the framing loop below retreats until the worst-placed player fits
 *  inside them, so loosening them is what brings the shot in. Y stays tighter
 *  than X to leave room for the scoreboard and the charge meters. */
const SAFE_X = 0.95;
const SAFE_Y = 0.88;
/** headroom above a character's origin that must stay in frame (metres) */
const HEAD_ROOM = 1.3;
/** never retreat further than this beyond the base framing (metres) */
const MAX_PULLBACK = 16;

/** base shot: how far behind the baseline the camera sits, and how high.
 *  Tight enough that the characters read at a glance — the framing logic
 *  below retreats from here whenever someone would fall out of frame. */
const BASE_BACK = 6.1;
const BASE_HEIGHT = 7.6;

export class MatchCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** which baseline this camera sits behind; team 1 views the court mirrored */
  private sign: 1 | -1;
  private lookTarget = new THREE.Vector3(0, 1, 0);
  private posTarget = new THREE.Vector3();
  private shakeOffset = new THREE.Vector3();
  private _probe = new THREE.PerspectiveCamera(48, 1.777, 0.1, 400);
  private _pt = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _back = new THREE.Vector3();

  constructor(aspect: number, team: 0 | 1 = 0) {
    this.sign = team === 0 ? 1 : -1;
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 400);
    this.camera.position.set(0, BASE_HEIGHT, this.sign * (COURT.halfLength + BASE_BACK));
    this.camera.lookAt(0, 0.5, this.sign * -4);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** A side-by-side split pane is tall and narrow: halving the aspect costs
   *  horizontal view, so open the vertical field to win it back — otherwise
   *  the framing logic retreats halfway out of the stadium to fit the court
   *  across the pane's width. */
  setSplit(on: boolean): void {
    this.camera.fov = on ? 64 : 48;
    this.camera.updateProjectionMatrix();
  }

  /** menu/idle orbit view of the stadium */
  idleOrbit(t: number): void {
    const a = t * 0.08;
    this.camera.position.set(Math.sin(a) * 26, 10 + Math.sin(t * 0.05) * 2, Math.cos(a) * 26);
    this.camera.lookAt(0, 2, 0);
  }

  /**
   * Frame the ball and every player. The base shot sits behind team 0's
   * baseline; if anyone (or the ball) would fall outside a safe margin the
   * camera pulls back and lifts until they all fit, so a player retreating
   * deep can never be cropped out while someone else charges the net.
   */
  update(dt: number, ballPos: THREE.Vector3, shake: number, focus: THREE.Vector3[] = []): void {
    const bx = THREE.MathUtils.clamp(ballPos.x, -6, 6);
    const bz = THREE.MathUtils.clamp(ballPos.z, -COURT.halfLength, COURT.halfLength);

    const sg = this.sign;
    this.lookTarget.lerp(
      this._look.set(bx * 0.5 * sg, 0.8, sg * (bz * sg * 0.28 - 2.5)),
      1 - Math.exp(-dt * 4),
    );

    this.posTarget.set(
      bx * 0.35 * sg,
      BASE_HEIGHT + Math.max(0, ballPos.y - 4) * 0.25,
      sg * (COURT.halfLength + BASE_BACK + bz * sg * 0.1),
    );

    // --- keep everyone in shot ---
    // Probe with the target transform, then push it back along the view ray
    // by however much the worst-offending point overflows the safe frame.
    const probe = this._probe;
    probe.position.copy(this.posTarget);
    probe.aspect = this.camera.aspect;
    probe.fov = this.camera.fov;
    probe.updateProjectionMatrix();
    probe.lookAt(this.lookTarget);
    probe.updateMatrixWorld(true);

    let overflow = 1;
    for (const f of focus) {
      // include headroom so a character's head isn't clipped
      this._pt.set(f.x, f.y + HEAD_ROOM, f.z).project(probe);
      overflow = Math.max(overflow, Math.abs(this._pt.x) / SAFE_X, Math.abs(this._pt.y) / SAFE_Y);
      this._pt.set(f.x, f.y, f.z).project(probe);
      overflow = Math.max(overflow, Math.abs(this._pt.x) / SAFE_X, Math.abs(this._pt.y) / SAFE_Y);
    }
    if (overflow > 1) {
      const back = this._back.copy(this.posTarget).sub(this.lookTarget);
      const dist = back.length();
      back.normalize();
      const extra = Math.min((overflow - 1) * dist, MAX_PULLBACK);
      this.posTarget.addScaledVector(back, extra);
      this.posTarget.y += extra * 0.22; // lift a little as we retreat
    }

    this.camera.position.lerp(this.posTarget, 1 - Math.exp(-dt * 3));
    if (shake > 0) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * shake * 0.5,
        (Math.random() - 0.5) * shake * 0.4,
        0,
      );
    } else this.shakeOffset.set(0, 0, 0);
    this.camera.position.add(this.shakeOffset);
    this.camera.lookAt(this.lookTarget);
  }
}
