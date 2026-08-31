import * as THREE from 'three';
import { COURT } from '../core/constants';

/* Mario Tennis style camera: elevated behind team 0's baseline, gently
 * tracking the ball laterally and pushing in/out with rally depth. */

export class MatchCamera {
  readonly camera: THREE.PerspectiveCamera;
  private lookTarget = new THREE.Vector3(0, 1, 0);
  private posTarget = new THREE.Vector3();
  private shakeOffset = new THREE.Vector3();

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

  update(dt: number, ballPos: THREE.Vector3, shake: number): void {
    const bx = THREE.MathUtils.clamp(ballPos.x, -6, 6);
    const bz = THREE.MathUtils.clamp(ballPos.z, -COURT.halfLength, COURT.halfLength);
    this.posTarget.set(
      bx * 0.35,
      9.2 + Math.max(0, ballPos.y - 4) * 0.25,
      COURT.halfLength + 8.6 + bz * 0.1,
    );
    this.camera.position.lerp(this.posTarget, 1 - Math.exp(-dt * 3));
    this.lookTarget.lerp(new THREE.Vector3(bx * 0.5, 0.8, bz * 0.28 - 2.5), 1 - Math.exp(-dt * 4));
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
