import * as THREE from 'three';
import { COURT } from '../core/constants';

/* Mario Tennis style camera: elevated behind team 0's baseline, gently
 * tracking the ball laterally and pushing in/out with rally depth. */

/** fraction of the frame treated as safe (NDC) before the camera retreats */
const SAFE_X = 0.86;
const SAFE_Y = 0.80;
/** never retreat further than this beyond the base framing (metres) */
const MAX_PULLBACK = 13;

export class MatchCamera {
  readonly camera: THREE.PerspectiveCamera;
  private lookTarget = new THREE.Vector3(0, 1, 0);
  private posTarget = new THREE.Vector3();
  private shakeOffset = new THREE.Vector3();
  private _probe = new THREE.PerspectiveCamera(48, 1.777, 0.1, 400);
  private _pt = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _back = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 400);
    this.camera.position.set(0, 9.5, COURT.halfLength + 9);
    this.camera.lookAt(0, 0.5, -4);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
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

    this.lookTarget.lerp(
      this._look.set(bx * 0.5, 0.8, bz * 0.28 - 2.5),
      1 - Math.exp(-dt * 4),
    );

    this.posTarget.set(
      bx * 0.35,
      9.2 + Math.max(0, ballPos.y - 4) * 0.25,
      COURT.halfLength + 8.6 + bz * 0.1,
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
      this._pt.set(f.x, f.y + 2.1, f.z).project(probe);
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
