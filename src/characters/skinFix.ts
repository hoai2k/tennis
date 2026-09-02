import * as THREE from 'three';

/* ============================================================
 * Skin-weight repair: stop arm bones from dragging the body.
 *
 * Every model here was auto-skinned by Tripo, and auto-skinners
 * assign weights by proximity in the BIND pose. These characters
 * bind with their arms hanging at their sides, so the hand sits
 * a couple of centimetres from the thigh, the skirt, the shin or
 * the coat — and a slice of that lower-body geometry gets handed
 * to DEF-handL/R instead of to the leg it belongs to. Measured
 * before this pass, an arm-only rotation moved shin geometry by
 * two thirds of body height on tusken (DEF-handL owned it at
 * weight 1.0), and vulcan's skirt panels rode entirely on elbowR.
 *
 * The rule: an arm bone's influence on a vertex is spurious when
 * that vertex hugs some NON-arm bone far more closely than it
 * hugs the arm bone. "Arm" is decided by hierarchy, not by name
 * — the subtree under each arm root — so fingers, claws, fists
 * and weapon bones parented to a hand still count as arm and
 * keep their weights. Weight is removed on a smooth ramp (no
 * seam at the cutoff) and renormalised onto the vertex's other
 * influences; a vertex left with nothing goes to the body bone
 * it was hugging all along.
 * ============================================================ */

/** auto-generated bones an exporter left unnamed — nothing can be inferred
 *  from these, so a skeleton mostly made of them is not safe to judge */
const UNNAMED = /^(bone_\d+|tripo\w*_?\d*)$/i;
/** skip the whole mesh once this share of its skeleton is unnamed */
const MAX_UNNAMED = 0.25;

/** bones whose whole subtree is "the arm" */
const ARM_ROOT = /(shoulder|clavicle|upper_?arm|elbow|forearm|wrist|hand)/i;
/** ...unless the name is really a leg (guards against e.g. 'handle', 'foreleg') */
const NOT_ARM = /(thigh|shin|calf|knee|ankle|foot|toe|heel|leg)/i;

/* Two independent tests, whichever is harsher:
 *
 * 1. RELATIVE — the vertex hugs a non-arm bone this many times more closely
 *    than it hugs the arm bone. Catches geometry that plainly belongs to
 *    something else (vulcan's skirt panels ride the shoulder at ratio 2.2-3.3
 *    while its own skirtL/R bones sit half the distance away).
 * 2. ABSOLUTE — the vertex is this many of the ARM BONE'S OWN LENGTHS away.
 *    This is the one that catches the real damage: a hand is ~10cm long and
 *    can only credibly skin flesh within about a hand-length, yet tusken's
 *    DEF-handL owns shin vertices 6.9 hand-lengths away, duelist's 10.4 and
 *    quarren's 8.8. Deltoid and trapezius geometry — which legitimately rides
 *    an arm bone that is not its nearest — sits well inside one bone length,
 *    so it survives both tests. */
const RATIO_KEEP = 1.8;
const RATIO_DROP = 2.8;
const LENGTHS_KEEP = 2.0;
const LENGTHS_DROP = 3.5;
/** never judge an influence closer than this (fraction of body height) */
const NEAR_FLOOR = 0.015;
/** and never let a stubby bone claim an unfairly small radius */
const MIN_BONE_LEN = 0.02;
/** ignore influences too small to move anything */
const EPS = 0.004;

export interface SkinFixStats {
  mesh: string;
  verts: number;
  /** vertices that had at least one arm influence trimmed */
  trimmed: number;
  /** vertices left with no influence at all, reassigned to their body bone */
  reassigned: number;
  /** total weight removed from arm bones */
  weightRemoved: number;
  ms: number;
}

/** distance from a point to bone segment `i`, read out of the flat arrays */
function distSeg(px: number, py: number, pz: number, H: Float64Array, T: Float64Array, i: number): number {
  const ax = H[i * 3], ay = H[i * 3 + 1], az = H[i * 3 + 2];
  const abx = T[i * 3] - ax, aby = T[i * 3 + 1] - ay, abz = T[i * 3 + 2] - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const L2 = abx * abx + aby * aby + abz * abz;
  let t = L2 > 0 ? (apx * abx + apy * aby + apz * abz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** 1 below `lo`, 0 above `hi`, smooth in between */
function fade(x: number, lo: number, hi: number): number {
  if (x <= lo) return 1;
  if (x >= hi) return 0;
  const t = (x - lo) / (hi - lo);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Repair one skinned mesh in place. Works in BIND space — the space the
 * weights were authored in — so it does not care what pose the model ships
 * in. Returns null when there is nothing to judge (no arm bones, or no
 * non-arm bones to compare against).
 */
export function fixArmSkinning(sm: THREE.SkinnedMesh): SkinFixStats | null {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
  const geo = sm.geometry;
  const pos = geo.attributes.position;
  const si = geo.attributes.skinIndex as THREE.BufferAttribute;
  const sw = geo.attributes.skinWeight as THREE.BufferAttribute;
  if (!pos || !si || !sw) return null;

  const bones = sm.skeleton.bones;
  const inv = sm.skeleton.boneInverses;
  if (bones.length < 2) return null;

  // Judging a weight means deciding which bone a vertex "belongs" to, and
  // that needs a skeleton whose bones say what they are. frogger, nullbot and
  // saurion's original (non-_rig) skeletons are ~65% bone_17 / tripo0_Limb_3,
  // so an arm there cannot be told from a backpack; leave them alone rather
  // than guess. Their _rig re-exports are clean Rigify and get repaired.
  let unnamed = 0;
  for (const b of bones) if (UNNAMED.test(b.name)) unnamed++;
  if (unnamed / bones.length > MAX_UNNAMED) return null;

  // --- who is "arm"? every bone in the subtree of an arm-named root ---
  const isArm = new Uint8Array(bones.length);
  const index = new Map<THREE.Object3D, number>();
  bones.forEach((b, i) => index.set(b, i));
  const markSubtree = (o: THREE.Object3D) => {
    const i = index.get(o);
    if (i !== undefined) isArm[i] = 1;
    for (const c of o.children) markSubtree(c);
  };
  for (const b of bones) if (ARM_ROOT.test(b.name) && !NOT_ARM.test(b.name)) markSubtree(b);

  const armCount = isArm.reduce((n, v) => n + v, 0);
  if (!armCount || armCount === bones.length) return null;

  // --- bone segments in bind space ---
  const head: THREE.Vector3[] = bones.map((_, i) =>
    new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(inv[i]).invert()));
  const tail: THREE.Vector3[] = bones.map((b, i) => {
    const kids: number[] = [];
    for (const c of b.children) { const j = index.get(c); if (j !== undefined) kids.push(j); }
    if (kids.length) {
      const v = new THREE.Vector3();
      for (const j of kids) v.add(head[j]);
      return v.multiplyScalar(1 / kids.length);
    }
    const p = index.get(b.parent as THREE.Object3D);
    // leaf: carry on in the direction the bone already points
    return p !== undefined
      ? head[i].clone().add(head[i].clone().sub(head[p]).multiplyScalar(0.6))
      : head[i].clone();
  });
  const bodyIdx: number[] = [];
  for (let i = 0; i < bones.length; i++) if (!isArm[i]) bodyIdx.push(i);
  if (!bodyIdx.length) return null;
  const boneLen = bones.map((_, i) => head[i].distanceTo(tail[i]));

  // --- body height, for the absolute floor (bbox corners, not every vertex) ---
  const bind = sm.bindMatrix;
  const p = new THREE.Vector3();
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  let minY = Infinity, maxY = -Infinity;
  for (let c = 0; c < 8; c++) {
    p.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z)
      .applyMatrix4(bind);
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const H = maxY - minY;

  // Flatten the segments the inner loop hammers, plus a midpoint/half-length
  // pair per bone: |p - mid| - half is a cheap lower bound on the true segment
  // distance, so most of the skeleton can be rejected without the full test.
  const HX = new Float64Array(bones.length * 3), TX = new Float64Array(bones.length * 3);
  const MX = new Float64Array(bones.length * 3), HALF = new Float64Array(bones.length);
  for (let i = 0; i < bones.length; i++) {
    HX[i * 3] = head[i].x; HX[i * 3 + 1] = head[i].y; HX[i * 3 + 2] = head[i].z;
    TX[i * 3] = tail[i].x; TX[i * 3 + 1] = tail[i].y; TX[i * 3 + 2] = tail[i].z;
    MX[i * 3] = (head[i].x + tail[i].x) / 2;
    MX[i * 3 + 1] = (head[i].y + tail[i].y) / 2;
    MX[i * 3 + 2] = (head[i].z + tail[i].z) / 2;
    HALF[i] = head[i].distanceTo(tail[i]) / 2;
  }
  const floor = Math.max(1e-6, H * NEAR_FLOOR);
  const minLen = Math.max(1e-6, H * MIN_BONE_LEN);

  let trimmed = 0, reassigned = 0, weightRemoved = 0;
  const w = [0, 0, 0, 0], b4 = [0, 0, 0, 0];

  for (let i = 0; i < pos.count; i++) {
    // fast path: nothing to do unless an arm bone has a real say here
    let anyArm = false;
    for (let k = 0; k < 4; k++) {
      b4[k] = si.getComponent(i, k);
      w[k] = sw.getComponent(i, k);
      if (w[k] > EPS && isArm[b4[k]]) anyArm = true;
    }
    if (!anyArm) continue;

    p.fromBufferAttribute(pos, i).applyMatrix4(bind);
    let dBody = Infinity, nearestBody = bodyIdx[0];
    for (const j of bodyIdx) {
      const mx = p.x - MX[j * 3], my = p.y - MX[j * 3 + 1], mz = p.z - MX[j * 3 + 2];
      if (Math.sqrt(mx * mx + my * my + mz * mz) - HALF[j] >= dBody) continue;
      const d = distSeg(p.x, p.y, p.z, HX, TX, j);
      if (d < dBody) { dBody = d; nearestBody = j; }
    }

    let changed = false, sum = 0;
    for (let k = 0; k < 4; k++) {
      if (w[k] > EPS && isArm[b4[k]]) {
        const dArm = distSeg(p.x, p.y, p.z, HX, TX, b4[k]);
        // An arm bone always keeps whatever it is the closest thing to: that
        // is its own flesh, and the deltoid / trapezius that legitimately
        // rides it. Only geometry that hugs the body more closely than it
        // hugs this bone is up for judgement.
        if (dArm > floor && dArm > dBody) {
          const keep = Math.min(
            fade(dArm / Math.max(dBody, floor), RATIO_KEEP, RATIO_DROP),
            fade(dArm / Math.max(boneLen[b4[k]], minLen), LENGTHS_KEEP, LENGTHS_DROP),
          );
          if (keep < 1) {
            weightRemoved += w[k] * (1 - keep);
            w[k] *= keep;
            changed = true;
          }
        }
      }
      sum += w[k];
    }
    if (!changed) continue;
    trimmed++;

    if (sum < 0.02) {
      // the arm owned this vertex outright — hand it to the bone it hugs
      reassigned++;
      si.setXYZW(i, nearestBody, 0, 0, 0);
      sw.setXYZW(i, 1, 0, 0, 0);
    } else {
      const inv2 = 1 / sum;
      sw.setXYZW(i, w[0] * inv2, w[1] * inv2, w[2] * inv2, w[3] * inv2);
    }
  }

  if (trimmed) { sw.needsUpdate = true; si.needsUpdate = true; }
  return {
    mesh: sm.name || 'mesh', verts: pos.count, trimmed, reassigned,
    weightRemoved: +weightRemoved.toFixed(1),
    ms: +((typeof performance !== 'undefined' ? performance.now() : 0) - t0).toFixed(1),
  };
}

/** repair every skinned mesh under `root` */
export function fixArmSkinningIn(root: THREE.Object3D): SkinFixStats[] {
  const out: SkinFixStats[] = [];
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) { const s = fixArmSkinning(sm); if (s) out.push(s); }
  });
  return out;
}
