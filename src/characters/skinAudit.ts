/* ============================================================
 * Dev harness for skin weights (skinaudit.html) — not imported
 * by the game. Answers one question: when only the arm bones
 * move, what else moves with them?
 *
 *   __skinAudit('models/tusken.glb')            measure the drag
 *   __skinAudit('models/tusken.glb', {fix:true})  ...after the repair
 *   __skinProbe('models/tusken.glb')            why a weight is suspect
 *   __skinShot('models/tusken.glb')             raw | repaired, rendered
 *   __boneNames('models/frogger.glb')           what the skeleton is called
 *
 * Run it against any newly added model before wiring it into the
 * roster; `dragged` should be 0 and `armMotion.mean` should barely
 * move between the raw and repaired numbers.
 * ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { fixArmSkinningIn } from './skinFix';

const ARM = /(shoulder|clavicle|upper_?arm|elbow|forearm|wrist|hand)/i;
const NOT_ARM = /(thigh|shin|calf|knee|ankle|foot|toe|heel|leg)/i;
const LEG = /(thigh|shin|calf|leg|foot|toe|knee|ankle)/i;
const PELVIS = /(spine$|spine\.?0*0?1?$|hip|pelvis|waist|root)/i;
/** the arm-only test pose: big, arbitrary, and the same every run */
const TEST_POSE = new THREE.Euler(0.9, 0.6, 1.1);

function distSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a), ap = p.clone().sub(a);
  const L2 = ab.lengthSq();
  const t = L2 > 0 ? THREE.MathUtils.clamp(ap.dot(ab) / L2, 0, 1) : 0;
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

async function load(url: string, fix: boolean) {
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  const g = await l.loadAsync(url);
  g.scene.updateMatrixWorld(true);
  const stats = fix ? fixArmSkinningIn(g.scene) : null;
  let sm: THREE.SkinnedMesh | null = null;
  g.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !sm) sm = o as THREE.SkinnedMesh; });
  return { scene: g.scene, sm: sm as THREE.SkinnedMesh | null, stats };
}

/** rest-pose bone segments, head → mean of bone children */
function segments(bones: THREE.Bone[], world: (b: THREE.Bone, i: number) => THREE.Vector3) {
  const idx = new Map<THREE.Object3D, number>();
  bones.forEach((b, i) => idx.set(b, i));
  const head = bones.map(world);
  const tail = bones.map((b, i) => {
    const kids: number[] = [];
    for (const c of b.children) { const j = idx.get(c); if (j !== undefined) kids.push(j); }
    if (kids.length) {
      const v = new THREE.Vector3();
      for (const j of kids) v.add(head[j]);
      return v.multiplyScalar(1 / kids.length);
    }
    const p = idx.get(b.parent as THREE.Object3D);
    return p !== undefined ? head[i].clone().add(head[i].clone().sub(head[p]).multiplyScalar(0.6)) : head[i].clone();
  });
  const isArm = new Uint8Array(bones.length);
  const mark = (o: THREE.Object3D) => { const i = idx.get(o); if (i !== undefined) isArm[i] = 1; o.children.forEach(mark); };
  for (const b of bones) if (ARM.test(b.name) && !NOT_ARM.test(b.name)) mark(b);
  return { idx, head, tail, isArm };
}

/**
 * Rotate only the arm bones, CPU-skin the mesh before and after, and report
 * how far BODY geometry travelled. Body geometry is anything that hugs a
 * non-arm bone far more closely than any arm bone — a definition that keeps
 * hands (which hang beside the thigh at rest) out of the "leg" bucket.
 */
export async function auditModel(url: string, opts: { verbose?: boolean; fix?: boolean } = {}) {
  const { scene, sm, stats } = await load(url, opts.fix === true);
  if (!sm) return { url, error: 'no skinned mesh' };
  const geo = sm.geometry;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const bones = sm.skeleton.bones, inv = sm.skeleton.boneInverses;
  const n = pos.count;

  const skinAll = () => {
    scene.updateMatrixWorld(true);
    const bm = bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inv[i]));
    const out: THREE.Vector3[] = new Array(n);
    let minY = Infinity, maxY = -Infinity;
    const base = new THREE.Vector3(), tmp = new THREE.Vector3(), acc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      base.fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix);
      acc.set(0, 0, 0);
      let wsum = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k); if (w <= 0) continue;
        acc.addScaledVector(tmp.copy(base).applyMatrix4(bm[si.getComponent(i, k)]), w);
        wsum += w;
      }
      const v = wsum > 0 ? acc.clone().multiplyScalar(1 / wsum) : base.clone();
      out[i] = v;
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
    }
    return { p: out, minY, maxY };
  };

  const rest = skinAll();
  const H = Math.max(1e-6, rest.maxY - rest.minY);
  const { head, tail, isArm } = segments(bones, (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
  const armIdx: number[] = [], bodyIdx: number[] = [];
  bones.forEach((_, i) => (isArm[i] ? armIdx : bodyIdx).push(i));
  if (!armIdx.length) return { url: url.split('/').pop(), error: 'no arm bones matched', bones: bones.map((b) => b.name) };

  const saved = bones.map((b) => b.quaternion.clone());
  const q = new THREE.Quaternion().setFromEuler(TEST_POSE);
  for (let i = 0; i < bones.length; i++) if (isArm[i]) bones[i].quaternion.multiply(q);
  const posed = skinAll();
  for (let i = 0; i < bones.length; i++) bones[i].quaternion.copy(saved[i]);
  scene.updateMatrixWorld(true);

  const nearestOf = (i: number, idx: number[]) => {
    let bd = Infinity, bi = -1;
    for (const b of idx) { const d = distSeg(rest.p[i], head[b], tail[b]); if (d < bd) { bd = d; bi = b; } }
    return { d: bd, i: bi };
  };

  const buckets: Record<string, { n: number; sum: number; max: number; over1: number }> = {};
  const worst: unknown[] = [];
  let armN = 0, armSum = 0;
  for (let i = 0; i < n; i++) {
    const a = nearestOf(i, armIdx), b = nearestOf(i, bodyIdx);
    if (a.d < b.d) { armN++; armSum += posed.p[i].distanceTo(rest.p[i]) / H; continue; }
    if (!(a.d > b.d * 2.5 && a.d > 0.08 * H)) continue;
    const nm = bones[b.i].name;
    const r = LEG.test(nm) ? 'leg' : PELVIS.test(nm) ? 'pelvis/waist' : 'torso/head';
    const d = posed.p[i].distanceTo(rest.p[i]) / H;
    const s = (buckets[r] ??= { n: 0, sum: 0, max: 0, over1: 0 });
    s.n++; s.sum += d; s.max = Math.max(s.max, d);
    if (d > 0.01) {
      s.over1++;
      const infl: unknown[] = [];
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > 0.005) infl.push([bones[si.getComponent(i, k)].name, +w.toFixed(3), isArm[si.getComponent(i, k)] ? 'ARM' : '']);
      }
      worst.push({ r, near: nm, move: +d.toFixed(4), y: +((rest.p[i].y - rest.minY) / H).toFixed(3), infl });
    }
  }

  return {
    url: url.split('/').pop(), verts: n, armBones: armIdx.length, fixStats: stats,
    /** control: geometry that IS the arm must keep moving just as much */
    armMotion: { n: armN, mean: +(armSum / Math.max(1, armN)).toFixed(4) },
    body: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, {
      n: v.n, mean: +(v.sum / v.n).toFixed(5), max: +v.max.toFixed(4),
      over1pct: +(100 * v.over1 / v.n).toFixed(2),
    }])),
    dragged: worst.length,
    worst: (worst as { move: number }[]).sort((x, y) => y.move - x.move).slice(0, opts.verbose ? 12 : 5),
  };
}

/**
 * For every body vertex an arm bone has a real say in, report the geometry a
 * threshold has to separate: distance to the arm bone in body heights, to the
 * bone it actually hugs, and — the telling one — in the arm bone's OWN
 * lengths. That last column is what separates a hand skinning its own flesh
 * (< 1) from a hand skinning a shin (7-10).
 */
export async function probe(url: string, top = 8) {
  const { sm } = await load(url, false);
  if (!sm) return { url, error: 'no skinned mesh' };
  const bones = sm.skeleton.bones;
  const geo = sm.geometry;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const { head, tail, isArm } = segments(bones, (_, i) =>
    new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sm.skeleton.boneInverses[i]).invert()));
  const len = bones.map((_, i) => Math.max(1e-6, head[i].distanceTo(tail[i])));
  const bodyIdx = bones.map((_, i) => i).filter((i) => !isArm[i]);

  const p = new THREE.Vector3();
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const H = Math.max(1e-6, bb.max.y - bb.min.y);

  const rows: { dArmH: number }[] = [];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(sm.bindMatrix);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w < 0.15) continue;
      const bi = si.getComponent(i, k); if (!isArm[bi]) continue;
      const dArm = distSeg(p, head[bi], tail[bi]);
      let dBody = Infinity, nb = -1;
      for (const j of bodyIdx) { const d = distSeg(p, head[j], tail[j]); if (d < dBody) { dBody = d; nb = j; } }
      if (dArm < dBody) continue; // the arm really is the closest thing: legit
      rows.push({
        arm: bones[bi].name, w: +w.toFixed(2), near: bones[nb].name,
        dArmH: +(dArm / H).toFixed(3), dBodyH: +(dBody / H).toFixed(3),
        ratio: +(dArm / Math.max(dBody, 1e-6)).toFixed(2),
        armLens: +(dArm / len[bi]).toFixed(2),
      } as unknown as { dArmH: number });
    }
  }
  rows.sort((a, b) => b.dArmH - a.dArmH);
  return { url: url.split('/').pop(), n: rows.length, top: rows.slice(0, top) };
}

/** side-by-side render of the arm-only test pose: raw | repaired */
export async function shot(url: string, opts: { w?: number; h?: number } = {}) {
  const W = opts.w ?? 520, H = opts.h ?? 640;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2; canvas.height = H;
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  r.setClearColor(0x1b1f2a);
  r.setScissorTest(true);
  const q = new THREE.Quaternion().setFromEuler(TEST_POSE);

  for (let pane = 0; pane < 2; pane++) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    scene.add(key);

    const { scene: model } = await load(url, pane === 1);
    model.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone && ARM.test(b.name) && !NOT_ARM.test(b.name)) b.quaternion.multiply(q);
    });
    model.updateMatrixWorld(true);
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(35, W / H, 0.01, 1000);
    const d = Math.max(size.x, size.y) * 1.75;
    cam.position.set(c.x + d * 0.32, c.y + size.y * 0.06, c.z + d);
    cam.lookAt(c);

    r.setViewport(pane * W, 0, W, H);
    r.setScissor(pane * W, 0, W, H);
    r.render(scene, cam);
  }
  return { ok: true };
}

export async function boneNames(url: string) {
  const { sm } = await load(url, false);
  return sm ? sm.skeleton.bones.map((b) => b.name) : [];
}

const w = window as unknown as Record<string, unknown>;
w.__skinAudit = auditModel;
w.__skinProbe = probe;
w.__skinShot = shot;
w.__boneNames = boneNames;
