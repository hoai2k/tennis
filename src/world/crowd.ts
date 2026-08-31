import * as THREE from 'three';
import type { ThemePalette } from './themes';
import type { SeatAnchor } from './stands';
import { pick } from './util';

/* Instanced low-poly crowd + confetti bursts.
 *
 * Per-frame animation only rewrites the Y translation element (index 13) of
 * each instance matrix, so update() allocates nothing. */

const SHIRT_COLORS = [
  0xff4f4f, 0xff9f1c, 0xffe14f, 0x59d95f, 0x2ec4b6, 0x3f8cff, 0x8c5aff,
  0xff5fa0, 0xffffff, 0x3a3f4a, 0xf25c3c, 0x5ff0d0,
];
const SKIN_COLORS = [0xffd9b0, 0xf2b98a, 0xc98a5a, 0x8a5a3a, 0xffe9c9, 0x6a4430];

const CONFETTI_MAX = 240;

export class CrowdSystem {
  readonly group: THREE.Group;

  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private count: number;

  private bodyBaseY: Float32Array;
  private headBaseY: Float32Array;
  private phase: Float32Array;
  private speed: Float32Array;
  private jumpiness: Float32Array; // how eagerly this spectator joins a cheer

  private time = 0;
  private cheerT = 0;
  private cheerDur = 1;
  private cheerAmp = 0;

  // confetti
  private confetti: THREE.InstancedMesh;
  private cPos: Float32Array;
  private cVel: Float32Array;
  private cSpin: Float32Array;
  private cLife: Float32Array;
  private confettiOn = false;

  private tmpM = new THREE.Matrix4();
  private tmpE = new THREE.Euler();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();

  constructor(anchors: SeatAnchor[], density: 'full' | 'light', palette: ThemePalette, rand: () => number) {
    this.group = new THREE.Group();
    this.group.name = 'crowd';

    // choose which seats are occupied
    const fillP = density === 'full' ? 0.82 : 0.32;
    const chosen: SeatAnchor[] = [];
    for (const a of anchors) if (rand() < fillP) chosen.push(a);
    const n = (this.count = chosen.length);

    const bodyGeo = new THREE.CapsuleGeometry(0.21, 0.34, 3, 8);
    const headGeo = new THREE.SphereGeometry(0.155, 8, 7);
    const bodyMat = new THREE.MeshLambertMaterial();
    const headMat = new THREE.MeshLambertMaterial();

    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, n);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.bodyBaseY = new Float32Array(n);
    this.headBaseY = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.speed = new Float32Array(n);
    this.jumpiness = new Float32Array(n);

    const color = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = chosen[i];
      const s = 0.85 + rand() * 0.35; // body size variety
      const bodyY = a.y + 0.36 * s;
      const headY = a.y + (0.36 + 0.42) * s;
      this.bodyBaseY[i] = bodyY;
      this.headBaseY[i] = headY;
      this.phase[i] = rand() * Math.PI * 2;
      this.speed[i] = 1.6 + rand() * 1.4;
      this.jumpiness[i] = 0.4 + rand() * 0.6;

      this.tmpQ.setFromEuler(this.tmpE.set(0, a.yaw + (rand() - 0.5) * 0.5, 0));
      this.tmpV.set(a.x, bodyY, a.z);
      this.tmpS.set(s, s, s);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      this.bodies.setMatrixAt(i, this.tmpM);

      this.tmpV.set(a.x, headY, a.z);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      this.heads.setMatrixAt(i, this.tmpM);

      color.setHex(pick(rand, SHIRT_COLORS));
      if (palette.night && rand() < 0.3) color.multiplyScalar(0.7); // moodier night crowd
      this.bodies.setColorAt(i, color);
      color.setHex(pick(rand, SKIN_COLORS));
      this.heads.setColorAt(i, color);
    }
    this.bodies.castShadow = false;
    this.heads.castShadow = false;
    this.group.add(this.bodies, this.heads);

    // --- confetti pool ---
    const cGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const cMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    this.confetti = new THREE.InstancedMesh(cGeo, cMat, CONFETTI_MAX);
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cPos = new Float32Array(CONFETTI_MAX * 3);
    this.cVel = new Float32Array(CONFETTI_MAX * 3);
    this.cSpin = new Float32Array(CONFETTI_MAX * 3);
    this.cLife = new Float32Array(CONFETTI_MAX);
    for (let i = 0; i < CONFETTI_MAX; i++) {
      color.setHSL(rand(), 0.9, 0.6);
      this.confetti.setColorAt(i, color);
      this.hideConfetti(i);
    }
    this.confetti.frustumCulled = false;
    this.group.add(this.confetti);
  }

  private hideConfetti(i: number) {
    this.cLife[i] = 0;
    this.tmpM.makeTranslation(0, -100, 0);
    this.confetti.setMatrixAt(i, this.tmpM);
  }

  cheer(big: boolean, rand: () => number): void {
    this.cheerDur = big ? 3.0 : 1.8;
    this.cheerT = this.cheerDur;
    this.cheerAmp = big ? 0.55 : 0.3;
    if (big) {
      // burst confetti from above the stands on all four sides
      for (let i = 0; i < CONFETTI_MAX; i++) {
        const side = i % 4;
        const along = (rand() - 0.5) * 26;
        const off = 14 + rand() * 8;
        const x = side < 2 ? (side === 0 ? off : -off) : along;
        const z = side < 2 ? along : side === 2 ? off : -off;
        this.cPos[i * 3] = x * 0.9;
        this.cPos[i * 3 + 1] = 7 + rand() * 5;
        this.cPos[i * 3 + 2] = z * 0.9;
        this.cVel[i * 3] = (rand() - 0.5) * 2.4;
        this.cVel[i * 3 + 1] = 0.5 + rand() * 1.5;
        this.cVel[i * 3 + 2] = (rand() - 0.5) * 2.4;
        this.cSpin[i * 3] = (rand() - 0.5) * 9;
        this.cSpin[i * 3 + 1] = (rand() - 0.5) * 9;
        this.cSpin[i * 3 + 2] = (rand() - 0.5) * 9;
        this.cLife[i] = 2.6 + rand() * 2.2;
      }
      this.confettiOn = true;
      this.confetti.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt: number, excitement: number): void {
    this.time += dt;
    const t = this.time;
    const n = this.count;

    let cheerEnv = 0;
    if (this.cheerT > 0) {
      this.cheerT -= dt;
      const x = Math.max(0, this.cheerT / this.cheerDur);
      cheerEnv = Math.min(1, (1 - x) * 6) * x; // fast attack, linear decay
    }

    const idleAmp = 0.045 * (0.3 + 0.7 * excitement);
    const bodyArr = this.bodies.instanceMatrix.array as Float32Array;
    const headArr = this.heads.instanceMatrix.array as Float32Array;

    for (let i = 0; i < n; i++) {
      const ph = this.phase[i];
      let off = idleAmp * (Math.sin(t * this.speed[i] + ph) * 0.5 + 0.5);
      if (cheerEnv > 0) {
        const hop = Math.sin(t * 9 + ph * 3);
        off += this.cheerAmp * cheerEnv * this.jumpiness[i] * Math.max(0, hop);
      }
      bodyArr[i * 16 + 13] = this.bodyBaseY[i] + off;
      headArr[i * 16 + 13] = this.headBaseY[i] + off * 1.12;
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;

    // --- confetti ---
    if (this.confettiOn) {
      let alive = 0;
      for (let i = 0; i < CONFETTI_MAX; i++) {
        if (this.cLife[i] <= 0) continue;
        this.cLife[i] -= dt;
        if (this.cLife[i] <= 0) {
          this.hideConfetti(i);
          continue;
        }
        alive++;
        const i3 = i * 3;
        this.cVel[i3 + 1] -= 2.6 * dt; // gentle gravity
        if (this.cVel[i3 + 1] < -1.8) this.cVel[i3 + 1] = -1.8; // flutter terminal velocity
        this.cPos[i3] += (this.cVel[i3] + Math.sin(t * 3 + i) * 0.6) * dt;
        this.cPos[i3 + 1] += this.cVel[i3 + 1] * dt;
        this.cPos[i3 + 2] += (this.cVel[i3 + 2] + Math.cos(t * 2.6 + i * 1.7) * 0.6) * dt;
        this.tmpE.set(this.cSpin[i3] * t, this.cSpin[i3 + 1] * t, this.cSpin[i3 + 2] * t);
        this.tmpQ.setFromEuler(this.tmpE);
        this.tmpV.set(this.cPos[i3], this.cPos[i3 + 1], this.cPos[i3 + 2]);
        this.tmpS.set(1, 1, 1);
        this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
        this.confetti.setMatrixAt(i, this.tmpM);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
      if (alive === 0) this.confettiOn = false;
    }
  }
}
