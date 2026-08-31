import * as THREE from 'three';
import type { Avatar, CharacterDef, SwingOpts, SwingSide } from '../core/types';
import { loadModel } from './loader';
import { Rig } from './rig';
import { Animator } from './animator';
import { buildRacquet, type Racquet } from './racquet';

/* ============================================================
 * Public entry: loadAvatar / preloadAvatars.
 * See PLAN.md — this module owns character loading, the
 * procedural racquet and the procedural animation system.
 * ============================================================ */

// racquet placement in the DEF-hand.R bone frame (canonical frame — see rig.ts).
// Iterated visually in the dev viewer.
const RACQUET_POS = new THREE.Vector3(0, 0.05, 0.01); // meters along hand
const RACQUET_EULER = new THREE.Euler(
  THREE.MathUtils.degToRad(-11),
  THREE.MathUtils.degToRad(55),
  THREE.MathUtils.degToRad(-20),
  'YXZ',
);

class AvatarImpl implements Avatar {
  readonly def: CharacterDef;
  readonly root: THREE.Object3D;

  private rig: Rig;
  private animator: Animator;
  private racquet: Racquet;
  private materials: THREE.MeshStandardMaterial[];
  private meshes: THREE.Mesh[];
  private glowTarget = 0;
  private glowCurrent = 0;
  private glowColor: THREE.Color;
  private disposed = false;

  constructor(def: CharacterDef, root: THREE.Group, container: THREE.Group, meshes: THREE.Mesh[], materials: THREE.MeshStandardMaterial[]) {
    this.def = def;
    this.root = root;
    this.meshes = meshes;
    this.materials = materials;
    this.glowColor = new THREE.Color(def.color);

    // prep glow (materials are per-avatar already — each load parses its own GLB)
    for (const m of materials) {
      m.emissive.copy(this.glowColor);
      m.emissiveIntensity = 0;
    }

    this.rig = new Rig(root, container);

    // ---- racquet on the right hand ----
    this.racquet = buildRacquet(def.color);
    const handR = this.rig.boneOf('handR');
    if (handR) {
      handR.add(this.racquet.group);
      this.placeRacquet(RACQUET_EULER, RACQUET_POS);
    } else {
      // fall back: strap it to the container so the game still works
      container.add(this.racquet.group);
    }

    this.animator = new Animator(this.rig, def.id);
    this.animator.update(0);
  }

  getRacquetPos(out: THREE.Vector3): THREE.Vector3 {
    return this.racquet.headCenter.getWorldPosition(out);
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.animator.update(dt);
    // glow easing
    const k = 1 - Math.exp(-12 * Math.min(dt, 0.1));
    this.glowCurrent += (this.glowTarget - this.glowCurrent) * k;
    if (Math.abs(this.glowCurrent - this.glowTarget) < 0.005) this.glowCurrent = this.glowTarget;
    for (const m of this.materials) m.emissiveIntensity = this.glowCurrent * 0.9;
  }

  setMovement(speed: number, dirX: number, dirZ: number): void {
    this.animator.setMovement(speed, dirX, dirZ);
  }

  startCharge(side: SwingSide): void {
    this.animator.startCharge(side);
  }

  cancelCharge(): void {
    this.animator.cancelCharge();
  }

  swing(opts: SwingOpts): void {
    // each kind/side pair has its own natural contact height (fraction of
    // body height, measured); map the requested world height to a
    // -1 (shin-level) .. +1 (overhead-reach) adjustment factor
    let hf = 0;
    if (opts.contactHeight !== undefined && opts.side !== 'overhead') {
      const key = `${opts.kind}_${opts.side}`;
      const frac = NOMINAL_CONTACT_FRAC[key] ?? 0.59;
      const nominal = frac * this.def.height;
      hf = THREE.MathUtils.clamp((opts.contactHeight - nominal) / (0.5 * this.def.height), -1, 1);
    }
    this.animator.swing(opts, hf);
  }

  isSwinging(): boolean {
    return this.animator.isSwinging();
  }

  serveToss(): void {
    this.animator.serveToss();
  }

  serveHit(power: number): void {
    this.animator.serveHit(power);
  }

  playVictory(): void {
    this.animator.playVictory();
  }

  playDefeat(): void {
    this.animator.playDefeat();
  }

  playReady(): void {
    this.animator.playReady();
  }

  setGlow(intensity: number): void {
    this.glowTarget = THREE.MathUtils.clamp(intensity, 0, 2);
  }

  /** dev/debug access (used by the character viewer) */
  get debugAnimator(): Animator {
    return this.animator;
  }

  /** Place the racquet in the hand-bone frame. The pose/euler constants are
   *  authored against the REFERENCE hand frame; a per-model correction maps
   *  them into the actual (possibly roll-flipped) hand frame. */
  private placeRacquet(euler: THREE.Euler, pos: THREE.Vector3): void {
    const handR = this.rig.boneOf('handR');
    if (!handR) return;
    const ws = handR.getWorldScale(new THREE.Vector3());
    const inv = 1 / Math.max(1e-6, ws.y);
    const corr = this.rig.canonQuat('handR', new THREE.Quaternion()).invert()
      .multiply(Rig.referenceCanon('handR'));
    this.racquet.group.scale.setScalar(inv);
    this.racquet.group.position.copy(pos).applyQuaternion(corr).multiplyScalar(inv);
    this.racquet.group.quaternion.copy(corr).multiply(new THREE.Quaternion().setFromEuler(euler));
  }

  /** dev-only: retune racquet placement in the hand frame (degrees / meters) */
  debugRacquet(rx: number, ry: number, rz: number, px = RACQUET_POS.x, py = RACQUET_POS.y, pz = RACQUET_POS.z): void {
    this.placeRacquet(
      new THREE.Euler(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz), 'YXZ'),
      new THREE.Vector3(px, py, pz),
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.parent?.remove(this.root);
    this.racquet.dispose();
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      const skinned = mesh as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh && skinned.skeleton) skinned.skeleton.dispose();
    }
    for (const m of this.materials) {
      for (const key of ['map', 'normalMap', 'metalnessMap', 'roughnessMap', 'aoMap', 'emissiveMap'] as const) {
        const tex = m[key];
        if (tex) tex.dispose();
      }
      m.dispose();
    }
  }
}

/** measured racquet height at the contact frame / body height, per shot */
const NOMINAL_CONTACT_FRAC: Record<string, number> = {
  topspin_fore: 0.523,
  topspin_back: 0.488,
  slice_fore: 0.578,
  slice_back: 0.503,
  flat_fore: 0.543,
  flat_back: 0.498,
  lob_fore: 0.568,
  lob_back: 0.523,
  drop_fore: 0.578,
  drop_back: 0.503,
  star_fore: 0.543,
  star_back: 0.498,
  smash_fore: 0.543,
  smash_back: 0.498,
};

export async function loadAvatar(
  def: CharacterDef,
  /** 0..1 download progress; fires only while bytes are in flight */
  onProgress?: (fraction: number) => void,
): Promise<Avatar> {
  const { root, container, meshes, materials } = await loadModel(def, onProgress);
  return new AvatarImpl(def, root, container, meshes, materials);
}

/** load several avatars in parallel */
export function preloadAvatars(defs: CharacterDef[]): Promise<Avatar[]> {
  return Promise.all(defs.map((d) => loadAvatar(d)));
}
