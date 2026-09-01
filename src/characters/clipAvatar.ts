import * as THREE from 'three';
import type { Avatar, CharacterDef, SwingOpts, SwingSide } from '../core/types';
import { SWING_CONTACT_DELAY } from '../core/types';
import type { LoadedModel } from './loader';
import { buildRacquet, type Racquet } from './racquet';

/* ============================================================
 * ClipAvatar: Avatar implementation for models that ship their
 * own baked animation clips (the Mech Mayhem robots) instead of
 * the shared Rigify DEF-* skeleton the procedural Animator needs.
 *
 * The mech GLBs carry a fighting-game move set (battleIdle, run,
 * light1-3, heavy, crouch, victory, dead, plus per-mech specials
 * like kongaSlam / fenrirSpike). Tennis actions map onto those
 * clips through per-action candidate lists — the first clip a
 * model actually has wins, so each mech keeps its own flavor.
 *
 * Swing timing: match logic applies the ball impulse a fixed
 * SWING_CONTACT_DELAY after swing() is called, so each swing clip
 * is sped up until its estimated hit frame (~38% in) lands on
 * that moment. Fighting-game attacks read great at 2-3x speed.
 * ============================================================ */

/** ordered fallbacks per tennis action; first clip the model has wins */
const CLIP_PICKS: Record<string, string[]> = {
  idle: ['battleIdle', 'walk'],
  run: ['run', 'walk'],
  // titanus holds a cocked fist that its punchRelease swings finish
  chargeFore: ['punchHold1', 'crouch', 'block', 'battleIdle'],
  chargeBack: ['punchHold2', 'crouch', 'block', 'battleIdle'],
  // konga: bigPunch1 is the LEFT fist — bigPunch2 leads with the racquet hand
  swingFore: ['punchRelease1', 'light1', 'bigPunch2', 'saurionClawR', 'light3', 'heavy'],
  swingBack: ['punchRelease2', 'light2', 'bigPunch1', 'saurionClawL', 'light3', 'heavy'],
  swingLob: ['throwHeave', 'kongaLob', 'light3', 'heavy'],
  overhead: ['poundSlam', 'heavy', 'kongaSlam', 'groundPound'],
  star: [
    'fistLaunch', 'kongaSlam', 'saurionBite', 'nullBackhand', 'fenrirSpike',
    'vulcanSpray', 'burst', 'hurricaneSpin', 'heavy',
  ],
  serveToss: ['castRaise', 'crouch', 'taunt'],
  victory: ['victory', 'taunt'],
  defeat: ['dead', 'knockdown'],
};

/** estimated fraction of an attack clip where the hit lands */
const HIT_FRAC = 0.38;

/** clips whose strike lands somewhere other than the usual ~38% in.
 *  titanus' poundSlam raises fast and slams late, so at the default
 *  fraction the racquet was already through the floor at contact. */
const CLIP_HIT_FRAC: Record<string, number> = {
  poundSlam: 0.19,
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class ClipAvatar implements Avatar {
  readonly def: CharacterDef;
  readonly root: THREE.Object3D;

  private mixer: THREE.AnimationMixer;
  private clips = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();

  private baseAction: THREE.AnimationAction | null = null;
  private overrideAction: THREE.AnimationAction | null = null;
  /** seconds left on the current override before the base fades back */
  private overrideTimer = 0;
  /** override that holds its last frame (serve toss, defeat) */
  private overrideHold = false;

  private swingTimer = 0;
  private charging = false;

  private racquet: Racquet;
  private materials: THREE.MeshStandardMaterial[];
  private meshes: THREE.Mesh[];
  private glowTarget = 0;
  private glowCurrent = 0;
  private disposed = false;

  constructor(def: CharacterDef, loaded: LoadedModel) {
    this.def = def;
    this.root = loaded.root;
    this.meshes = loaded.meshes;
    this.materials = loaded.materials;

    const glowColor = new THREE.Color(def.color);
    for (const m of this.materials) {
      m.emissive.copy(glowColor);
      m.emissiveIntensity = 0;
    }

    for (const clip of loaded.gltf.animations) this.clips.set(clip.name, clip);
    this.mixer = new THREE.AnimationMixer(loaded.gltf.scene);

    this.playBase('idle');
    this.mixer.update(0);

    // ---- re-ground & re-scale against the ANIMATED pose ----
    // The loader normalized against the bind pose, but several mech clips
    // carry the hips far from it (saurion/nullbot/frogger float ~2m up
    // otherwise). Measure the skinned bounds in the idle pose and redo the
    // height/floor/centering fit.
    loaded.root.updateMatrixWorld(true);
    const box = this.skinnedBounds();
    if (!box.isEmpty()) {
      const ratio = def.height / Math.max(1e-6, box.getSize(_v).y);
      if (Math.abs(1 - ratio) > 0.02) {
        loaded.container.scale.multiplyScalar(ratio);
        loaded.root.updateMatrixWorld(true);
        this.skinnedBounds(box);
      }
      const center = box.getCenter(_v);
      loaded.container.position.x -= center.x;
      loaded.container.position.y -= box.min.y;
      loaded.container.position.z -= center.z;
      loaded.root.updateMatrixWorld(true);
    }

    // ---- racquet: strapped to the right hand, hammer-grip ----
    // The mech idle stances hang the forearm straight down (or fold it
    // forward), so a racquet ALONG the forearm digs into the floor. Instead
    // it extends perpendicular to the forearm — horizontal-forward while the
    // arm hangs at idle, swinging up past the fist at punch contact.
    this.racquet = buildRacquet(def.color);
    const byName = new Map<string, THREE.Object3D>();
    loaded.gltf.scene.traverse((o) => byName.set(o.name, o));
    const handR = byName.get('handR');
    const elbowR = byName.get('elbowR');
    if (handR) {
      handR.add(this.racquet.group);
      const ws = handR.getWorldScale(_v).y || 1;
      this.racquet.group.scale.setScalar(1 / ws);
      if (elbowR) {
        const d = handR.getWorldPosition(_v).sub(elbowR.getWorldPosition(_v2)).normalize();
        // component of character-forward perpendicular to the forearm;
        // fall back to perpendicular-up when the forearm points forward
        const p = new THREE.Vector3(0, 0, 1).addScaledVector(d, -d.z);
        if (p.lengthSq() < 0.16) p.set(0, 1, 0).addScaledVector(d, -d.y);
        p.normalize();
        const dir = p.addScaledVector(d, 0.25).normalize();
        const dirLocal = dir.applyQuaternion(handR.getWorldQuaternion(_q).invert());
        this.racquet.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirLocal);
        this.racquet.group.position.copy(dirLocal).multiplyScalar(0.06 / ws);
      }
    } else {
      loaded.container.add(this.racquet.group);
    }
  }

  /** world-space bounds of the skinned meshes in the CURRENT pose */
  private skinnedBounds(out = new THREE.Box3()): THREE.Box3 {
    out.makeEmpty();
    const tmp = new THREE.Box3();
    for (const mesh of this.meshes) {
      const sk = mesh as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) {
        sk.computeBoundingBox();
        tmp.copy(sk.boundingBox!).applyMatrix4(sk.matrixWorld);
      } else {
        tmp.setFromObject(mesh);
      }
      out.union(tmp);
    }
    return out;
  }

  // ------------------------- clip helpers -------------------------

  private pick(actionKey: string): THREE.AnimationClip | null {
    for (const name of CLIP_PICKS[actionKey] ?? []) {
      const c = this.clips.get(name);
      if (c) return c;
    }
    return null;
  }

  private actionFor(clip: THREE.AnimationClip): THREE.AnimationAction {
    let a = this.actions.get(clip.name);
    if (!a) {
      a = this.mixer.clipAction(clip);
      this.actions.set(clip.name, a);
    }
    return a;
  }

  private playBase(key: 'idle' | 'run'): void {
    const clip = this.pick(key);
    if (!clip) return;
    const next = this.actionFor(clip);
    if (this.baseAction === next) return;
    next.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    next.enabled = true;
    if (this.baseAction) {
      next.crossFadeFrom(this.baseAction, 0.18, false);
    } else {
      next.setEffectiveWeight(1);
    }
    this.baseAction = next;
  }

  private clearOverride(fade = 0.12): void {
    if (!this.overrideAction) return;
    this.overrideAction.fadeOut(fade);
    this.overrideAction = null;
    this.overrideTimer = 0;
    this.overrideHold = false;
    this.baseAction?.fadeIn(fade);
  }

  /** play a one-shot (or looping) override on top of the base layer */
  private playOverride(
    clip: THREE.AnimationClip,
    opts: { timeScale?: number; loop?: boolean; hold?: boolean; fade?: number },
  ): void {
    const fade = opts.fade ?? 0.08;
    if (this.overrideAction) this.overrideAction.fadeOut(fade);
    const a = this.actionFor(clip);
    a.reset();
    a.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.timeScale = opts.timeScale ?? 1;
    a.fadeIn(fade).play();
    this.baseAction?.fadeOut(fade);
    this.overrideAction = a;
    this.overrideHold = !!opts.hold || !!opts.loop;
    this.overrideTimer = opts.loop || opts.hold
      ? Infinity
      : clip.duration / Math.max(0.01, Math.abs(a.timeScale));
  }

  /** timeScale that puts the clip's hit frame at SWING_CONTACT_DELAY */
  private swingTimeScale(clip: THREE.AnimationClip): number {
    const frac = CLIP_HIT_FRAC[clip.name] ?? HIT_FRAC;
    return THREE.MathUtils.clamp((clip.duration * frac) / SWING_CONTACT_DELAY, 1.2, 4.0);
  }

  private playSwingClip(clip: THREE.AnimationClip): void {
    const ts = this.swingTimeScale(clip);
    this.playOverride(clip, { timeScale: ts, fade: 0.05 });
    this.swingTimer = clip.duration / ts;
  }

  // ------------------------- Avatar API -------------------------

  getRacquetPos(out: THREE.Vector3): THREE.Vector3 {
    return this.racquet.headCenter.getWorldPosition(out);
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.mixer.update(dt);
    if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt);
    if (this.overrideAction && this.overrideTimer !== Infinity) {
      this.overrideTimer -= dt;
      if (this.overrideTimer <= 0) this.clearOverride(0.15);
    }
    // glow easing (matches AvatarImpl)
    const k = 1 - Math.exp(-12 * Math.min(dt, 0.1));
    this.glowCurrent += (this.glowTarget - this.glowCurrent) * k;
    if (Math.abs(this.glowCurrent - this.glowTarget) < 0.005) this.glowCurrent = this.glowTarget;
    for (const m of this.materials) m.emissiveIntensity = this.glowCurrent * 0.9;
  }

  setMovement(speed: number, _dirX: number, _dirZ: number): void {
    // locomotion only steers the base layer; overrides play on top
    if (speed > 0.8) {
      this.playBase('run');
      if (this.baseAction) {
        this.baseAction.timeScale = THREE.MathUtils.clamp(speed / 5.5, 0.75, 2.2);
      }
    } else {
      this.playBase('idle');
      if (this.baseAction) this.baseAction.timeScale = 1;
    }
  }

  startCharge(side: SwingSide): void {
    if (this.charging) return;
    this.charging = true;
    const clip = this.pick(side === 'back' ? 'chargeBack' : 'chargeFore');
    if (clip) this.playOverride(clip, { loop: true, timeScale: 0.9, fade: 0.12 });
  }

  cancelCharge(): void {
    if (!this.charging) return;
    this.charging = false;
    this.clearOverride(0.15);
  }

  swing(opts: SwingOpts): void {
    this.charging = false;
    const key =
      opts.kind === 'star' ? 'star'
      : opts.kind === 'smash' || opts.side === 'overhead' ? 'overhead'
      : opts.kind === 'lob' ? 'swingLob'
      : opts.side === 'back' ? 'swingBack'
      : 'swingFore';
    const clip = this.pick(key) ?? this.pick('swingFore');
    if (clip) this.playSwingClip(clip);
  }

  isSwinging(): boolean {
    return this.swingTimer > 0;
  }

  serveToss(): void {
    const clip = this.pick('serveToss');
    // wind up slowly and hold the top of the raise until serveHit lands
    if (clip) this.playOverride(clip, { timeScale: 0.9, hold: true, fade: 0.15 });
  }

  serveHit(_power: number): void {
    const clip = this.pick('overhead');
    if (clip) this.playSwingClip(clip);
  }

  playVictory(): void {
    const clip = this.pick('victory');
    if (clip) this.playOverride(clip, { loop: true, fade: 0.2 });
  }

  playDefeat(): void {
    const clip = this.pick('defeat');
    if (clip) this.playOverride(clip, { hold: true, fade: 0.2 });
  }

  playReady(): void {
    this.charging = false;
    this.swingTimer = 0;
    this.clearOverride(0.15);
    this.playBase('idle');
  }

  setGlow(intensity: number): void {
    this.glowTarget = THREE.MathUtils.clamp(intensity, 0, 2);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
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
