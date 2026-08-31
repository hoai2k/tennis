import * as THREE from 'three';
import { BONE_KEYS, type BoneKey } from './rig';

/* ============================================================
 * Pose authoring + blending utilities.
 *
 * A PoseSpec maps friendly bone keys to [x, y, z] euler DEGREES,
 * interpreted in character space (see rig.ts): +Y up, +Z facing.
 * Rough sign cheatsheet (verified in the dev viewer):
 *   torso/head +X  = lean/nod forward
 *   torso      -Y  = twist toward the character's right (racquet) side
 *   thigh      -X  = swing leg forward; shin +X = bend knee
 *   arm swings are authored per-pose and iterated visually.
 * `hip` is a hip translation offset in meters (character space).
 * ============================================================ */

export type EulerDeg = [number, number, number];

export interface PoseSpec {
  bones?: Partial<Record<BoneKey, EulerDeg>>;
  hip?: [number, number, number];
}

/** Compiled full-body pose: one quat per bone key + hip offset. */
export class Pose {
  q = new Map<BoneKey, THREE.Quaternion>();
  hip = new THREE.Vector3();

  constructor(spec?: PoseSpec) {
    for (const k of BONE_KEYS) this.q.set(k, new THREE.Quaternion());
    if (spec) this.set(spec);
  }

  set(spec: PoseSpec): this {
    const e = new THREE.Euler();
    if (spec.bones) {
      for (const k of BONE_KEYS) {
        const deg = spec.bones[k];
        const q = this.q.get(k)!;
        if (deg) {
          e.set(
            THREE.MathUtils.degToRad(deg[0]),
            THREE.MathUtils.degToRad(deg[1]),
            THREE.MathUtils.degToRad(deg[2]),
            'YXZ',
          );
          q.setFromEuler(e);
        } else {
          q.identity();
        }
      }
    }
    if (spec.hip) this.hip.set(spec.hip[0], spec.hip[1], spec.hip[2]);
    else this.hip.set(0, 0, 0);
    return this;
  }

  clone(): Pose {
    return new Pose().copy(this);
  }

  copy(other: Pose): this {
    for (const k of BONE_KEYS) this.q.get(k)!.copy(other.q.get(k)!);
    this.hip.copy(other.hip);
    return this;
  }

  identity(): this {
    for (const k of BONE_KEYS) this.q.get(k)!.identity();
    this.hip.set(0, 0, 0);
    return this;
  }

  /** this = slerp(this, other, t) */
  lerp(other: Pose, t: number): this {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(other);
    for (const k of BONE_KEYS) this.q.get(k)!.slerp(other.q.get(k)!, t);
    this.hip.lerp(other.hip, t);
    return this;
  }

  /** compose another pose ON TOP (this = this ∘ other), weighted */
  add(other: Pose, w = 1): this {
    for (const k of BONE_KEYS) {
      const oq = other.q.get(k)!;
      if (oq.w === 1) continue;
      const q = this.q.get(k)!;
      if (w >= 1) q.multiply(oq);
      else q.multiply(_qa.identity().slerp(oq, w));
    }
    this.hip.addScaledVector(other.hip, w);
    return this;
  }

  /** multiply a single-bone rotation, applied AFTER the current offset
   *  (i.e. in un-rotated character frame — good for swings/bobs). */
  rot(key: BoneKey, xDeg: number, yDeg: number, zDeg: number, w = 1): this {
    if (w === 0 || (xDeg === 0 && yDeg === 0 && zDeg === 0)) return this;
    _e.set(
      THREE.MathUtils.degToRad(xDeg * w),
      THREE.MathUtils.degToRad(yDeg * w),
      THREE.MathUtils.degToRad(zDeg * w),
      'YXZ',
    );
    _qa.setFromEuler(_e);
    const q = this.q.get(key);
    if (q) q.premultiply(_qa);
    return this;
  }

  hipAdd(x: number, y: number, z: number): this {
    this.hip.x += x;
    this.hip.y += y;
    this.hip.z += z;
    return this;
  }

  /** scale the whole pose toward identity (w in 0..1) */
  scale(w: number): this {
    if (w >= 1) return this;
    for (const k of BONE_KEYS) {
      const q = this.q.get(k)!;
      _qa.identity().slerp(q, w);
      q.copy(_qa);
    }
    this.hip.multiplyScalar(w);
    return this;
  }
}

const _qa = new THREE.Quaternion();
const _e = new THREE.Euler();

/* ============================================================
 * Authored pose library (all offsets from the canonical neutral
 * stance — see rig.ts). Character space: +Y up, +Z facing.
 * The character's RIGHT (racquet side) is -X, LEFT is +X.
 * Cheat sheet: torso +X lean fwd · torso -Y coil right ·
 * thigh -X leg fwd · shin +X knee bend · foot +X point toe ·
 * arm euler [x,y,z] = z raise in frontal plane (R arm: -z up),
 * then x fwd tilt (-x fwd), then y horizontal sweep (+y fwd for R arm).
 * ============================================================ */

export const SPECS: Record<string, PoseSpec> = {
  idle: {
    bones: {
      hips: [2, 0, 0], spine1: [2, 0, 0], spine2: [1, 0, 0],
      neck1: [-2, 0, 0], head: [-3, 0, 0],
      upperArmL: [4, 0, 6], upperArmR: [4, 0, -6],
      forearmL: [-9, 0, 2], forearmR: [-9, 0, -2],
      thighL: [-2, 0, 2], thighR: [-2, 0, -2],
      shinL: [4, 0, 0], shinR: [4, 0, 0],
      footL: [-2, 0, 0], footR: [-2, 0, 0],
    },
    hip: [0, -0.012, 0],
  },

  ready: {
    bones: {
      hips: [10, 0, 0], spine1: [9, 0, 0], spine2: [7, 0, 0], spine3: [3, 0, 0],
      neck1: [-8, 0, 0], head: [-14, 0, 0],
      shoulderL: [0, 0, 4], shoulderR: [0, 0, -4],
      upperArmL: [-24, -10, 16], upperArmR: [-24, 10, -16],
      forearmL: [-42, -18, 4], forearmR: [-42, 18, -4],
      handL: [-10, 0, 8], handR: [-38, -25, -10],
      thighL: [-34, 0, 10], thighR: [-34, 0, -10],
      shinL: [46, 0, 0], shinR: [46, 0, 0],
      footL: [-13, 0, -6], footR: [-13, 0, 6],
    },
    hip: [0, -0.13, 0],
  },

  runLean: {
    bones: {
      hips: [8, 0, 0], spine1: [7, 0, 0], spine2: [5, 0, 0],
      neck1: [-6, 0, 0], head: [-11, 0, 0],
      upperArmL: [-12, 0, 10], upperArmR: [-16, 0, -12],
      forearmL: [-72, 0, 4], forearmR: [-64, 0, -6],
      handL: [-8, 0, 0], handR: [-8, 0, -6],
    },
  },

  // ---------------- forehand (right side, -X) ----------------
  // NOTE: torso yaw FK-compounds onto the arms — arm eulers below are
  // authored in the pre-yaw frame (see the compounding note in rig.ts).
  chargeFore: {
    bones: {
      hips: [8, -34, 0], spine1: [6, -16, 0], spine2: [4, -8, -4],
      neck1: [0, 20, 0], head: [-10, 28, 0],
      shoulderR: [0, 0, -8],
      upperArmR: [0, 6, -66], forearmR: [-16, 0, -8], handR: [0, -12, -26],
      upperArmL: [0, -6, 60], forearmL: [-12, 0, 6], handL: [-8, 0, 0],
      thighL: [-30, -14, 12], thighR: [-34, 0, -14],
      shinL: [44, 0, 0], shinR: [48, 0, 0],
      footL: [-12, 0, -6], footR: [-14, 12, 6],
    },
    hip: [0, -0.16, 0.0],
  },

  contactFore: {
    bones: {
      hips: [6, 12, 0], spine1: [4, 6, 0], spine2: [2, 4, 0],
      neck1: [-4, -6, 0], head: [-10, -10, 0],
      shoulderR: [0, 6, -10],
      upperArmR: [0, 14, -58], forearmR: [-6, 6, -2], handR: [0, 0, -12],
      upperArmL: [-35, 0, 25], forearmL: [-32, 0, 5],
      thighL: [-28, 8, 10], thighR: [-30, -6, -14],
      shinL: [40, 0, 0], shinR: [44, 0, 0],
      footL: [-10, 0, -6], footR: [-16, -10, 6],
    },
    hip: [0, -0.12, 0.02],
  },

  followFore: {
    bones: {
      hips: [8, 38, 0], spine1: [6, 16, -6], spine2: [4, 8, -4],
      neck1: [-6, -20, 0], head: [-10, -28, 0],
      shoulderR: [0, 12, -6],
      upperArmR: [-58, 14, -22], forearmR: [-72, 0, 0], handR: [-12, 0, 8],
      upperArmL: [-10, 0, 28], forearmL: [-36, 0, 8],
      thighL: [-24, 12, 8], thighR: [-26, -10, -12],
      shinL: [36, 0, 0], shinR: [42, 0, 0],
      footL: [-10, 0, -6], footR: [-16, -14, 6],
    },
    hip: [0, -0.1, 0.03],
  },

  // ---------------- backhand (left side, +X) ----------------
  chargeBack: {
    bones: {
      hips: [10, 36, 0], spine1: [8, 18, 0], spine2: [5, 8, 4],
      neck1: [0, -20, 0], head: [-10, -30, 0],
      shoulderR: [0, -6, 6],
      upperArmR: [-14, -10, 30], forearmR: [-48, 0, 6], handR: [-12, 16, 12],
      upperArmL: [-8, 0, 20], forearmL: [-34, 0, 6],
      thighL: [-34, 0, 12], thighR: [-30, 12, -12],
      shinL: [48, 0, 0], shinR: [44, 0, 0],
      footL: [-14, -12, -6], footR: [-12, 0, 6],
    },
    hip: [0, -0.16, 0.0],
  },

  contactBack: {
    bones: {
      hips: [6, -10, 0], spine1: [4, -6, 0], spine2: [2, -4, 0],
      neck1: [-4, 6, 0], head: [-10, 10, 0],
      shoulderR: [0, -8, 10],
      upperArmR: [0, -18, 80], forearmR: [-4, -2, 2], handR: [48, 10, 10],
      upperArmL: [6, 0, 26], forearmL: [-20, 0, 6],
      thighL: [-30, -8, 12], thighR: [-28, 6, -12],
      shinL: [44, 0, 0], shinR: [40, 0, 0],
      footL: [-14, 8, -6], footR: [-10, 0, 6],
    },
    hip: [0, -0.12, 0.02],
  },

  followBack: {
    bones: {
      hips: [8, -34, 0], spine1: [6, -14, 6], spine2: [4, -8, 4],
      neck1: [-6, 18, 0], head: [-10, 26, 0],
      shoulderR: [0, -12, 4],
      upperArmR: [-40, -20, 46], forearmR: [-24, -8, -4], handR: [-8, 0, -8],
      upperArmL: [4, 0, 24], forearmL: [-18, 0, 6],
      thighL: [-26, -12, 10], thighR: [-24, 10, -10],
      shinL: [40, 0, 0], shinR: [36, 0, 0],
      footL: [-14, 12, -6], footR: [-10, 0, 6],
    },
    hip: [0, -0.1, 0.03],
  },

  // ---------------- overhead (smash / serve family) ----------------
  chargeOver: {
    bones: {
      hips: [-6, -14, 0], spine1: [-8, -8, 0], spine2: [-6, -4, 0],
      neck1: [-8, 6, 0], head: [-16, 8, 0],
      shoulderR: [0, 0, -12],
      upperArmR: [6, -16, -104], forearmR: [64, -24, -10], handR: [14, 0, -12],
      upperArmL: [-24, 6, 112], forearmL: [-12, 0, 6], handL: [-6, 0, 0],
      thighL: [-22, 0, 10], thighR: [-14, 0, -12],
      shinL: [30, 0, 0], shinR: [24, 0, 0],
      footL: [-8, 0, -6], footR: [-10, 0, 6],
    },
    hip: [0, -0.1, -0.02],
  },

  contactOver: {
    bones: {
      hips: [10, 10, 0], spine1: [8, 6, 0], spine2: [6, 2, 0],
      neck1: [-10, 0, 0], head: [-18, 0, 0],
      shoulderR: [0, 6, -14],
      upperArmR: [6, 14, -164], forearmR: [-8, 0, -2], handR: [12, 0, -4],
      upperArmL: [-10, 0, 24], forearmL: [-30, 0, 6],
      thighL: [-16, 0, 8], thighR: [-8, 0, -10],
      shinL: [20, 0, 0], shinR: [12, 0, 0],
      footL: [4, 0, -4], footR: [8, 0, 4],
    },
    hip: [0, 0.04, 0.03],
  },

  followOver: {
    bones: {
      hips: [22, 26, 0], spine1: [16, 12, 0], spine2: [10, 6, 0],
      neck1: [-8, -10, 0], head: [-12, -16, 0],
      shoulderR: [0, 10, -6],
      upperArmR: [-56, 50, -50], forearmR: [-50, 10, 0], handR: [-12, 0, 6],
      upperArmL: [6, -10, 26], forearmL: [-26, 0, 8],
      thighL: [-26, 0, 10], thighR: [-24, 0, -12],
      shinL: [38, 0, 0], shinR: [36, 0, 0],
      footL: [-12, 0, -6], footR: [-12, 0, 6],
    },
    hip: [0, -0.1, 0.04],
  },

  // ---------------- serve ----------------
  serveCrouch: {
    bones: {
      hips: [14, -18, 0], spine1: [10, -8, 0], spine2: [6, -4, 0],
      neck1: [-10, 8, 0], head: [-16, 12, 0],
      upperArmR: [22, -14, -30], forearmR: [-36, -10, -10], handR: [4, 0, -14],
      upperArmL: [-26, -18, 16], forearmL: [-42, 6, 4],
      thighL: [-26, -10, 10], thighR: [-18, 0, -12],
      shinL: [36, 0, 0], shinR: [28, 0, 0],
      footL: [-10, 0, -6], footR: [-10, 6, 6],
    },
    hip: [0, -0.1, 0.0],
  },

  serveTrophy: {
    bones: {
      hips: [-10, -22, 0], spine1: [-10, -10, 0], spine2: [-8, -6, 2],
      neck1: [-12, 8, 0], head: [-22, 10, 0],
      shoulderL: [0, 0, 14], shoulderR: [0, 0, -10],
      upperArmL: [-12, 6, 152], forearmL: [-8, 0, 8], handL: [-8, 0, 4],
      upperArmR: [30, -24, -96], forearmR: [92, -26, -8], handR: [12, 0, -8],
      thighL: [-20, -8, 8], thighR: [-6, 0, -10],
      shinL: [26, 0, 0], shinR: [14, 0, 0],
      footL: [-8, 0, -4], footR: [-8, 8, 6],
    },
    hip: [0, -0.05, -0.03],
  },

  serveContact: {
    bones: {
      hips: [6, 16, 0], spine1: [4, 8, 0], spine2: [4, 4, 0],
      neck1: [-12, -6, 0], head: [-22, -8, 0],
      shoulderR: [0, 8, -16],
      upperArmR: [10, 18, -168], forearmR: [-6, 0, -2], handR: [16, 0, -4],
      upperArmL: [4, 0, 30], forearmL: [-36, 0, 8],
      thighL: [-10, 0, 8], thighR: [4, 0, -10],
      shinL: [10, 0, 0], shinR: [4, 0, 0],
      footL: [10, 0, -4], footR: [14, 0, 4],
    },
    hip: [0, 0.06, 0.05],
  },

  serveFollow: {
    bones: {
      hips: [24, 22, 0], spine1: [18, 10, 0], spine2: [12, 4, 0],
      neck1: [-10, -8, 0], head: [-14, -12, 0],
      upperArmR: [-58, 54, -44], forearmR: [-54, 12, 0], handR: [-12, 0, 8],
      upperArmL: [8, -8, 24], forearmL: [-24, 0, 8],
      thighL: [-30, 0, 10], thighR: [-22, 0, -12],
      shinL: [42, 0, 0], shinR: [34, 0, 0],
      footL: [-14, 0, -6], footR: [-12, 0, 6],
    },
    hip: [0, -0.12, 0.06],
  },

  // ---------------- emotes ----------------
  victoryUp: {
    bones: {
      hips: [-4, 0, 0], spine1: [-4, 0, 0], spine2: [-4, 0, 0],
      neck1: [-8, 0, 0], head: [-14, 0, 0],
      shoulderL: [0, 0, 12], shoulderR: [0, 0, -12],
      upperArmL: [-10, 0, 148], forearmL: [-14, 0, 6], handL: [-10, 0, 0],
      upperArmR: [-10, 0, -148], forearmR: [-14, 0, -6], handR: [-10, 0, 0],
      thighL: [-4, 0, 6], thighR: [-4, 0, -6],
      shinL: [8, 0, 0], shinR: [8, 0, 0],
      footL: [-4, 0, 0], footR: [-4, 0, 0],
    },
    hip: [0, -0.02, 0],
  },

  victoryPump: {
    bones: {
      hips: [4, -10, 0], spine1: [2, -6, 0], spine2: [0, -4, 0],
      neck1: [-6, 6, 0], head: [-10, 8, 0],
      upperArmR: [10, -20, -70], forearmR: [-96, -10, -10], handR: [-14, 0, -10],
      upperArmL: [16, 10, 24], forearmL: [-40, 0, 8],
      thighL: [-10, 0, 8], thighR: [-10, 0, -8],
      shinL: [16, 0, 0], shinR: [16, 0, 0],
      footL: [-6, 0, 0], footR: [-6, 0, 0],
    },
    hip: [0, -0.04, 0],
  },

  defeat: {
    bones: {
      hips: [16, 0, 0], spine1: [14, 0, 0], spine2: [10, 0, 2],
      neck1: [12, 0, 0], head: [24, 0, 0],
      shoulderL: [0, 0, -10], shoulderR: [0, 0, 10],
      upperArmL: [8, 0, 4], upperArmR: [8, 0, -4],
      forearmL: [-6, 0, 2], forearmR: [-6, 0, -2],
      handL: [-4, 0, 0], handR: [-4, 0, 0],
      thighL: [-12, 0, 4], thighR: [-12, 0, -4],
      shinL: [18, 0, 0], shinR: [18, 0, 0],
      footL: [-6, 0, 0], footR: [-6, 0, 0],
    },
    hip: [0, -0.07, 0],
  },
};

/** merge specs (later override earlier per-bone; hip from last that has it) */
export function mergeSpecs(...specs: PoseSpec[]): PoseSpec {
  const bones: Partial<Record<BoneKey, EulerDeg>> = {};
  let hip: [number, number, number] | undefined;
  for (const s of specs) {
    if (s.bones) Object.assign(bones, s.bones);
    if (s.hip) hip = s.hip;
  }
  return { bones, hip };
}

// ---------------- easing ----------------

export type Ease = (t: number) => number;

export const easeLinear: Ease = (t) => t;
export const easeIn: Ease = (t) => t * t;
export const easeInCubic: Ease = (t) => t * t * t;
export const easeOut: Ease = (t) => 1 - (1 - t) * (1 - t);
export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** slight overshoot — punchy contacts */
export const easeOutBack: Ease = (t) => {
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// ---------------- timeline ----------------

export interface TimelineKey {
  t: number;
  pose: Pose;
  /** easing of the segment ENDING at this key */
  ease: Ease;
}

/** piecewise pose timeline; holds last key past the end */
export class Timeline {
  keys: TimelineKey[] = [];

  key(t: number, pose: Pose, ease: Ease = easeInOut): this {
    this.keys.push({ t, pose, ease });
    this.keys.sort((a, b) => a.t - b.t);
    return this;
  }

  get duration(): number {
    return this.keys.length ? this.keys[this.keys.length - 1].t : 0;
  }

  sample(t: number, out: Pose): void {
    const keys = this.keys;
    if (!keys.length) {
      out.identity();
      return;
    }
    if (t <= keys[0].t) {
      out.copy(keys[0].pose);
      return;
    }
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        const a = keys[i - 1];
        const b = keys[i];
        const u = b.ease((t - a.t) / Math.max(1e-6, b.t - a.t));
        out.copy(a.pose).lerp(b.pose, u);
        return;
      }
    }
    out.copy(keys[keys.length - 1].pose);
  }
}
