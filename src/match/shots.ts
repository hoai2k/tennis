import * as THREE from 'three';
import { COURT, GRAVITY, SHOT_BASE_SPEED } from '../core/constants';
import type { ShotKind } from '../core/types';

/* Ballistic targeting: produce a launch velocity that carries the ball from
 * `from` to land at `target`, clearing the net. Arcade solve (ignores drag;
 * the small magnus dip is compensated by iterating clearance). */

export interface ShotProfile {
  /** speed multiplier vs SHOT_BASE_SPEED */
  speed: number;
  /** extra net clearance in meters (higher = loopier) */
  clearance: number;
  /** how deep in the opponent court the default target sits, 0..1 of half length */
  depth: [number, number]; // [min, max] fraction
  /** max lateral aim from center, fraction of half width */
  aimWidth: number;
  /** sidespin per unit of lateral aim */
  curve: number;
}

export const SHOT_PROFILES: Record<ShotKind, ShotProfile> = {
  topspin: { speed: 1.0, clearance: 0.55, depth: [0.62, 0.9], aimWidth: 0.85, curve: 0.6 },
  slice:   { speed: 0.82, clearance: 0.4, depth: [0.55, 0.85], aimWidth: 0.85, curve: -1.2 },
  flat:    { speed: 1.22, clearance: 0.16, depth: [0.7, 0.95], aimWidth: 0.92, curve: 0 },
  lob:     { speed: 0.78, clearance: 3.6, depth: [0.78, 0.97], aimWidth: 0.6, curve: 0 },
  drop:    { speed: 0.62, clearance: 0.5, depth: [0.12, 0.3], aimWidth: 0.55, curve: -0.5 },
  smash:   { speed: 1.5, clearance: 0.12, depth: [0.55, 0.9], aimWidth: 0.9, curve: 0 },
  serve:   { speed: 1.18, clearance: 0.28, depth: [0, 0], aimWidth: 1, curve: 0.4 },
  star:    { speed: 1.62, clearance: 0.14, depth: [0.68, 0.95], aimWidth: 0.95, curve: 0.8 },
};

/** Compute landing target for a ground shot.
 * dir: which side the hitter is on (+1 = hitter at z>0, shoots toward -z)
 * aimX/aimY: stick input -1..1 (aimY>0 = deeper) */
export function computeTarget(
  kind: ShotKind, dir: 1 | -1, aimX: number, aimY: number, singles: boolean,
): THREE.Vector3 {
  const p = SHOT_PROFILES[kind];
  const halfW = (singles ? COURT.widthSingles : COURT.widthDoubles) / 2;
  const depthFrac = THREE.MathUtils.lerp(p.depth[0], p.depth[1], (aimY + 1) / 2);
  // safety margins keep default shots in; edges reachable at full aim
  const x = aimX * p.aimWidth * (halfW - 0.45);
  const z = -dir * depthFrac * (COURT.halfLength - 0.55);
  return new THREE.Vector3(x, 0.05, z);
}

/**
 * Solve launch velocity from -> target with given profile speed and net
 * clearance. powerMul scales speed (charge); `sidespin` must be the exact
 * value that will be passed to Ball.launch — the solver compensates for the
 * lateral/vertical magnus drift the ball integrator will apply, so shots
 * actually land on their targets.
 */
export function solveShot(
  from: THREE.Vector3, target: THREE.Vector3, kind: ShotKind,
  powerMul: number, sidespin: number,
): { vel: THREE.Vector3; time: number } {
  const p = SHOT_PROFILES[kind];
  const speed = SHOT_BASE_SPEED * p.speed * powerMul;
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const horiz = Math.hypot(dx, dz);
  let T = Math.max(0.28, horiz / speed);

  const g = GRAVITY;
  // magnus accelerations the ball integrator applies (see Ball.step)
  const spinY = kind === 'topspin' || kind === 'star' ? 1 : kind === 'slice' || kind === 'drop' ? -0.8 : 0;
  const ax = sidespin * 6;
  const ay = spinY * -5.5;
  let vel = new THREE.Vector3();
  for (let i = 0; i < 14; i++) {
    const vy = (target.y - from.y - 0.5 * (g + ay) * T * T) / T;
    vel.set(dx / T - 0.5 * ax * T, vy, dz / T);
    // net clearance check at z=0
    if (Math.sign(from.z) !== Math.sign(target.z) && Math.abs(from.z) > 0.05) {
      const tNet = Math.abs(from.z) / Math.abs(dz / T);
      const yNet = from.y + vy * tNet + 0.5 * (g + ay) * tNet * tNet;
      const need = COURT.netHeightCenter + 0.12 + p.clearance;
      if (yNet < need) { T *= 1.09; continue; }
    }
    break;
  }
  return { vel, time: T };
}
