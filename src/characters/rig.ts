import * as THREE from 'three';

/* ============================================================
 * Rig: maps the shared Rigify DEF-* skeleton to friendly keys,
 * repairs the hierarchy (Tripo exports the DEF bones as nine
 * DISCONNECTED chains — arms/legs are not children of the spine),
 * and CANONICALIZES the pose.
 *
 * The 13 models ship with wildly different rest poses (ig11 is a
 * clean arms-down stance, jogo is a T-pose, yuji is frozen
 * mid-stride). So instead of animating relative to each model's
 * rest pose, every key bone is re-targeted at load to a CANONICAL
 * character-space frame (derived from ig11, the cleanest rig).
 * All authored poses are offsets from that shared neutral stance
 * and therefore look identical on every character.
 *
 * Offsets are expressed in character space (+Y up, +Z facing,
 * as-if ancestors were at neutral, FK-compounded):
 *   bone.quaternion = inv(N[parent]) * Q_off * N[bone]
 * where N[x] is the canonical char-space orientation. This is a
 * fixed conjugation per bone — cheap, no per-frame accumulation.
 * ============================================================ */

// NOTE: three's GLTFLoader sanitizes node names (dots removed):
// 'DEF-spine.001' → 'DEF-spine001', 'DEF-hand.R' → 'DEF-handR'.
export const BONE_NAMES = {
  hips: 'DEF-spine',
  spine1: 'DEF-spine001',
  spine2: 'DEF-spine002',
  spine3: 'DEF-spine003',
  neck1: 'DEF-spine004',
  neck2: 'DEF-spine005',
  head: 'DEF-spine006',
  shoulderL: 'DEF-shoulderL',
  shoulderR: 'DEF-shoulderR',
  upperArmL: 'DEF-upper_armL',
  upperArmR: 'DEF-upper_armR',
  forearmL: 'DEF-forearmL',
  forearmR: 'DEF-forearmR',
  handL: 'DEF-handL',
  handR: 'DEF-handR',
  thighL: 'DEF-thighL',
  thighR: 'DEF-thighR',
  shinL: 'DEF-shinL',
  shinR: 'DEF-shinR',
  footL: 'DEF-footL',
  footR: 'DEF-footR',
  toeL: 'DEF-toeL',
  toeR: 'DEF-toeR',
} as const;

export type BoneKey = keyof typeof BONE_NAMES;
export const BONE_KEYS = Object.keys(BONE_NAMES) as BoneKey[];

/* Canonical character-space bone frames [Xaxis, Yaxis(bone dir), Zaxis],
 * measured from ig11's rest pose and cleaned/symmetrized.
 * Character space: +Y up, +Z = facing direction. */
type Basis = [[number, number, number], [number, number, number], [number, number, number]];

const SPINE_B: Basis = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]];
const CANON: Record<BoneKey, Basis> = {
  hips: SPINE_B, spine1: SPINE_B, spine2: SPINE_B, spine3: SPINE_B,
  neck1: SPINE_B, neck2: SPINE_B, head: SPINE_B,
  shoulderL: [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  shoulderR: [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  upperArmL: [[-0.79, -0.12, -0.6], [0.16, -0.99, -0.01], [-0.59, -0.11, 0.8]],
  upperArmR: [[-0.79, 0.12, 0.6], [-0.16, -0.99, -0.01], [0.59, -0.11, 0.8]],
  forearmL: [[-0.79, -0.12, -0.6], [0.14, -0.99, 0.03], [-0.6, -0.05, 0.8]],
  forearmR: [[-0.79, 0.12, 0.6], [-0.14, -0.99, 0.03], [0.6, -0.05, 0.8]],
  handL: [[-0.78, -0.19, -0.59], [0.14, -0.98, 0.12], [-0.61, 0.01, 0.8]],
  handR: [[-0.78, 0.19, 0.59], [-0.14, -0.98, 0.12], [0.61, 0.01, 0.8]],
  thighL: [[-0.11, -0.03, -0.99], [0.05, -1, 0.02], [-0.99, -0.05, 0.11]],
  thighR: [[-0.11, 0.03, 0.99], [-0.05, -1, 0.02], [0.99, -0.05, 0.11]],
  shinL: [[-0.11, -0.03, -0.99], [0.03, -1, 0.02], [-0.99, -0.03, 0.11]],
  shinR: [[-0.11, 0.03, 0.99], [-0.03, -1, 0.02], [0.99, -0.03, 0.11]],
  footL: [[1, 0, 0], [0, -0.63, 0.77], [0, -0.77, -0.63]],
  footR: [[1, 0, 0], [0, -0.63, 0.77], [0, -0.77, -0.63]],
  toeL: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  toeR: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
};

function basisQuat(b: Basis): THREE.Quaternion {
  // orthonormalize with Y (bone direction) as the primary axis
  const y = new THREE.Vector3(...b[1]).normalize();
  const x = new THREE.Vector3(...b[0]);
  x.addScaledVector(y, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y); // right-handed: x × y = z
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

interface RigBoneRec {
  /** null for driven twist/secondary (.001) segments */
  key: BoneKey | null;
  bone: THREE.Object3D;
  restLocalPos: THREE.Vector3;
  /** inv(canonical char quat of parent) */
  pre: THREE.Quaternion;
  /** canonical char quat of this bone */
  post: THREE.Quaternion;
  parentCanon: THREE.Quaternion;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class Rig {
  private recs: RigBoneRec[] = [];
  private recByKey = new Map<BoneKey, RigBoneRec>();
  private hipMetersToLocal = 1;
  readonly missing: string[] = [];

  /**
   * @param root      avatar root — must be at identity, not yet in a scene
   * @param container normalization container (scale/pos may be refined here)
   */
  constructor(root: THREE.Object3D, container: THREE.Object3D) {
    const byName = new Map<string, THREE.Object3D>();
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone || o.name.startsWith('DEF-')) byName.set(o.name, o);
    });
    const get = (key: BoneKey) => byName.get(BONE_NAMES[key]);

    // ---- repair hierarchy (attach() preserves world transforms → skinning intact) ----
    const hips = get('hips');
    const spine3 = get('spine3');
    root.updateMatrixWorld(true);
    if (hips && spine3) {
      const reparent = (childName: string, parent: THREE.Object3D | undefined) => {
        const c = byName.get(childName);
        if (c && parent && c.parent !== parent) parent.attach(c);
      };
      reparent('DEF-pelvisL', hips);
      reparent('DEF-pelvisR', hips);
      reparent('DEF-thighL', hips);
      reparent('DEF-thighR', hips);
      reparent('DEF-shoulderL', spine3);
      reparent('DEF-shoulderR', spine3);
      reparent('DEF-upper_armL', get('shoulderL'));
      reparent('DEF-upper_armR', get('shoulderR'));
      root.updateMatrixWorld(true);
    }

    // ---- measure rest reference heights (before canonicalization) ----
    const headBone = get('head');
    const toeLB = get('toeL');
    const toeRB = get('toeR');
    const restHeadY = headBone ? headBone.getWorldPosition(new THREE.Vector3()).y : 0;
    const restToeY =
      toeLB && toeRB
        ? (toeLB.getWorldPosition(new THREE.Vector3()).y + toeRB.getWorldPosition(new THREE.Vector3()).y) / 2
        : 0;

    // ---- compute canonical char-space orientation N for every rig node ----
    // key bones get the fixed canonical frame; other nodes follow their
    // parent's canonical delta (they keep their rest local rotation).
    const keyByBone = new Map<THREE.Object3D, BoneKey>();
    for (const k of BONE_KEYS) {
      const b = get(k);
      if (b) keyByBone.set(b, k);
      else this.missing.push(BONE_NAMES[k]);
    }

    const canonOf = new Map<THREE.Object3D, THREE.Quaternion>();
    const ROT_Y_180 = new THREE.Quaternion(0, 1, 0, 0);
    // Legs only: arm binds are consistent across the roster, and a stable
    // hand frame is required for the racquet grip. Leg rolls DO vary
    // (nobara's are flipped 180°) and only affect the mesh, not gameplay.
    const LIMB_KEYS = new Set<BoneKey>([
      'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'toeL', 'toeR',
    ]);
    /** Some models bind limb bones with the roll flipped 180° relative to
     *  ig11's convention (e.g. nobara's legs). Compare the model's rest roll
     *  (after aligning bone directions) with the canonical roll and mirror
     *  the canonical frame when they disagree — authored poses stay valid
     *  because offsets are conjugated in character space, not bone space. */
    const matchRoll = (q: THREE.Quaternion, node: THREE.Object3D): THREE.Quaternion => {
      const restWorld = node.getWorldQuaternion(new THREE.Quaternion());
      const restY = new THREE.Vector3(0, 1, 0).applyQuaternion(restWorld);
      const canonY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const arc = new THREE.Quaternion().setFromUnitVectors(restY, canonY);
      const alignedX = new THREE.Vector3(1, 0, 0).applyQuaternion(restWorld).applyQuaternion(arc);
      const canonX = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      if (alignedX.dot(canonX) < 0) q.multiply(ROT_Y_180);
      return q;
    };
    const computeCanon = (node: THREE.Object3D, parentCanon: THREE.Quaternion) => {
      const key = keyByBone.get(node);
      let n: THREE.Quaternion;
      if (key) {
        if (key === 'footL' || key === 'footR' || key === 'toeL' || key === 'toeR') {
          // Feet: anatomical pitch VARIES per model (heel height / mesh
          // differences) — forcing one canonical pitch digs toes into the
          // ground on some characters. Keep each model's rest pitch, but
          // canonicalize yaw (+Z) and roll (X = ±1).
          const isToe = key === 'toeL' || key === 'toeR';
          const restDir = new THREE.Vector3(0, 1, 0).applyQuaternion(
            node.getWorldQuaternion(new THREE.Quaternion()),
          );
          const ry = THREE.MathUtils.clamp(restDir.y, -0.95, isToe ? 0.2 : 0);
          const rz = Math.sqrt(Math.max(0.001, 1 - ry * ry));
          n = matchRoll(basisQuat([[isToe ? -1 : 1, 0, 0], [0, ry, rz], [0, 0, 0]]), node);
        } else {
          n = basisQuat(CANON[key]);
          if (LIMB_KEYS.has(key)) n = matchRoll(n, node);
        }
      } else if (/^DEF-(thigh|shin|upper_arm|forearm)[LR]001$/.test(node.name)) {
        // twist/secondary segments: align exactly with their primary bone —
        // some models (e.g. nobara) ship non-identity rest rotations here,
        // which curves the limb tubes once the primaries are canonicalized.
        n = parentCanon.clone();
      } else {
        n = parentCanon.clone().multiply(node.quaternion);
      }
      canonOf.set(node, n);
      for (const c of node.children) computeCanon(c, n);
    };
    // start from root: root is identity → char space == world at capture time
    computeCanon(root, new THREE.Quaternion());

    // ---- symmetrize the LEG bind positions ----
    // Rotations are canonicalized above, but bone *offsets* keep whatever the
    // model was bound in. Several models are bound mid-stride or slightly
    // knock-kneed (yuji's legs sit one-forward-one-back, maki's thighs splay
    // inward), and no amount of rotation fixes an asymmetric skeleton. Mirror
    // each left/right pair about the character's X axis and average them, so
    // every rig starts from a symmetric stance.
    const mirrorPairs: [BoneKey, BoneKey][] = [
      ['thighL', 'thighR'], ['shinL', 'shinR'],
      ['footL', 'footR'], ['toeL', 'toeR'],
    ];
    const symTmpL = new THREE.Vector3();
    const symTmpR = new THREE.Vector3();
    const symQ = new THREE.Quaternion();
    const symmetrize = (bl: THREE.Object3D | undefined, br: THREE.Object3D | undefined): void => {
      if (!bl || !br || !bl.parent || !br.parent) return;
      const pcL = canonOf.get(bl.parent);
      const pcR = canonOf.get(br.parent);
      if (!pcL || !pcR) return;
      // into character space
      symTmpL.copy(bl.position).applyQuaternion(pcL);
      symTmpR.copy(br.position).applyQuaternion(pcR);
      symTmpR.x = -symTmpR.x;                    // mirror right onto left
      symTmpL.add(symTmpR).multiplyScalar(0.5);  // average the pair
      // back to each parent's local space
      br.position.copy(symTmpL).setX(-symTmpL.x).applyQuaternion(symQ.copy(pcR).invert());
      bl.position.copy(symTmpL).applyQuaternion(symQ.copy(pcL).invert());
    };
    for (const [kl, kr] of mirrorPairs) symmetrize(get(kl), get(kr));
    symmetrize(byName.get('DEF-pelvisL'), byName.get('DEF-pelvisR'));
    // leg twist segments follow the same treatment
    for (const stem of ['thigh', 'shin']) {
      symmetrize(byName.get(`DEF-${stem}L001`), byName.get(`DEF-${stem}R001`));
    }

    const addRec = (bone: THREE.Object3D, k: BoneKey | null) => {
      if (!bone.parent) return;
      const parentCanon = canonOf.get(bone.parent) ?? new THREE.Quaternion();
      const rec: RigBoneRec = {
        key: k,
        bone,
        restLocalPos: bone.position.clone(),
        pre: parentCanon.clone().invert(),
        post: canonOf.get(bone)!.clone(),
        parentCanon: parentCanon.clone(),
      };
      this.recs.push(rec);
      if (k) this.recByKey.set(k, rec);
    };
    for (const k of BONE_KEYS) {
      const bone = get(k);
      if (bone) addRec(bone, k);
    }
    // drive the twist segments too — they must follow their canonicalized primaries
    for (const [name, bone] of byName) {
      if (/^DEF-(thigh|shin|upper_arm|forearm)[LR]001$/.test(name)) addRec(bone, null);
    }

    const hipRec = this.recByKey.get('hips');
    if (hipRec && hipRec.bone.parent) {
      const ws = hipRec.bone.parent.getWorldScale(new THREE.Vector3());
      this.hipMetersToLocal = 1 / Math.max(1e-6, ws.y);
    }

    // ---- apply the neutral pose, then recalibrate height & floor contact ----
    this.applyNeutral();
    root.updateMatrixWorld(true);
    if (headBone && toeLB && toeRB) {
      const nHeadY = headBone.getWorldPosition(new THREE.Vector3()).y;
      const nToeY =
        (toeLB.getWorldPosition(new THREE.Vector3()).y + toeRB.getWorldPosition(new THREE.Vector3()).y) / 2;
      const restSpan = restHeadY - restToeY;
      const neutralSpan = nHeadY - nToeY;
      if (neutralSpan > 1e-4 && restSpan > 1e-4) {
        const ratio = restSpan / neutralSpan;
        if (Math.abs(1 - ratio) > 0.005) container.scale.multiplyScalar(ratio);
        root.updateMatrixWorld(true);
        // put toe joints back at their rest height above the floor
        const nToeY2 =
          (toeLB.getWorldPosition(new THREE.Vector3()).y + toeRB.getWorldPosition(new THREE.Vector3()).y) / 2;
        container.position.y += restToeY * ratio - nToeY2;
        root.updateMatrixWorld(true);
        this.hipMetersToLocal /= ratio;
      }
    }
  }

  boneOf(key: BoneKey): THREE.Object3D | undefined {
    return this.recByKey.get(key)?.bone;
  }

  /** canonical char-space orientation of a bone (the pose-space basis),
   *  as actually used for THIS model (may be roll-flipped vs the reference) */
  canonQuat(key: BoneKey, out: THREE.Quaternion): THREE.Quaternion {
    const r = this.recByKey.get(key);
    return r ? out.copy(r.post) : out.identity();
  }

  /** the shared reference canonical frame (ig11 convention, never flipped) */
  static referenceCanon(key: BoneKey): THREE.Quaternion {
    return basisQuat(CANON[key]);
  }

  applyNeutral(): void {
    for (const rec of this.recs) {
      rec.bone.quaternion.copy(rec.pre).multiply(rec.post);
      if (rec.key === 'hips') rec.bone.position.copy(rec.restLocalPos);
    }
  }

  /**
   * Apply character-space offsets (identity = canonical neutral stance)
   * plus a hip translation offset in character-space meters.
   */
  apply(offsets: ReadonlyMap<BoneKey, THREE.Quaternion>, hipOffset: THREE.Vector3): void {
    for (const rec of this.recs) {
      const off = rec.key ? offsets.get(rec.key) : undefined;
      if (off && off.w !== 1) {
        rec.bone.quaternion.copy(rec.pre).multiply(off).multiply(rec.post);
      } else {
        rec.bone.quaternion.copy(rec.pre).multiply(rec.post);
      }
      if (rec.key === 'hips') {
        _v.copy(hipOffset).multiplyScalar(this.hipMetersToLocal);
        _q.copy(rec.parentCanon).invert();
        _v.applyQuaternion(_q);
        rec.bone.position.copy(rec.restLocalPos).add(_v);
      }
    }
  }
}
