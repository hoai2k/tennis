import * as THREE from 'three';
import { BALL, COURT, GRAVITY } from '../core/constants';
import type { ShotKind } from '../core/types';

export interface BallEvents {
  onBounce(pos: THREE.Vector3, bounceCountThisSide: number): void;
  onNetCord(): void;
  /** ball fully dead (rolled out / stopped) */
  onDead(): void;
}

const TRAIL_LEN = 22;

const SHOT_COLORS: Record<ShotKind, number> = {
  topspin: 0xff5040,
  slice: 0x3fa0ff,
  flat: 0xb050ff,
  lob: 0x50d870,
  drop: 0x50d870,
  smash: 0xb050ff,
  serve: 0xffe14a,
  star: 0xffd700,
};

export class Ball {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3(0, 1, 0);
  readonly vel = new THREE.Vector3();
  /** sidespin (curves x) and topspin(+)/backspin(-) factor */
  spin = new THREE.Vector2(0, 0);
  active = false; // physics on?
  lastShot: ShotKind = 'flat';
  bounceRestitutionMul = 1;

  private mesh: THREE.Mesh;
  private shadow: THREE.Mesh;
  private trail: THREE.InstancedMesh;
  private trailPos: THREE.Vector3[] = [];
  private trailColor = new THREE.Color(0xffe14a);
  private bouncesSinceHit = 0;
  private sideOfLastBounce = 0;
  events: BallEvents | null = null;

  constructor() {
    const geo = new THREE.SphereGeometry(BALL.radius, 20, 16);
    // tennis-ball yellow with a painted seam via canvas texture
    const tex = Ball.makeBallTexture();
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, color: 0xffffff }),
    );
    this.mesh.castShadow = true;
    this.group.add(this.mesh);

    const shGeo = new THREE.CircleGeometry(BALL.radius * 1.4, 20);
    this.shadow = new THREE.Mesh(
      shGeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);

    const tGeo = new THREE.SphereGeometry(BALL.radius * 0.8, 8, 6);
    const tMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false });
    this.trail = new THREE.InstancedMesh(tGeo, tMat, TRAIL_LEN);
    this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trail.count = 0;
    this.group.add(this.trail);
  }

  private static makeBallTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#d8e83c';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#f4f8ec';
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(0, 40); g.bezierCurveTo(40, 55, 88, 55, 128, 40);
    g.moveTo(0, 88); g.bezierCurveTo(40, 73, 88, 73, 128, 88);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** launch with explicit velocity; kind sets trail color + bounce behavior */
  launch(from: THREE.Vector3, v: THREE.Vector3, kind: ShotKind, sidespin = 0): void {
    this.pos.copy(from);
    this.vel.copy(v);
    this.lastShot = kind;
    this.spin.set(sidespin, kind === 'topspin' || kind === 'star' ? 1 : kind === 'slice' || kind === 'drop' ? -0.8 : 0);
    this.active = true;
    this.bouncesSinceHit = 0;
    this.trailColor.set(SHOT_COLORS[kind]);
    (this.trail.material as THREE.MeshBasicMaterial).color.copy(this.trailColor);
    this.trailPos.length = 0;
  }

  /** place ball statically (serve toss handled by match logic) */
  hold(at: THREE.Vector3): void {
    this.active = false;
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.trailPos.length = 0;
    this.trail.count = 0;
    this.sync();
  }

  get bounceCount(): number { return this.bouncesSinceHit; }
  resetBounces(): void { this.bouncesSinceHit = 0; }

  update(dt: number): void {
    if (this.active) {
      // integrate with substeps for reliable net collision
      const steps = Math.max(1, Math.ceil(dt / 0.008));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) this.step(h);
    }
    this.sync();
  }

  private step(h: number): void {
    const prevZ = this.pos.z;
    // gravity + drag + magnus curve
    this.vel.y += GRAVITY * h;
    const sp = this.vel.length();
    if (sp > 0) {
      const drag = BALL.airDrag * sp;
      this.vel.addScaledVector(this.vel, -drag * h);
      // sidespin curves along x; topspin dips
      this.vel.x += this.spin.x * 6 * h;
      this.vel.y += this.spin.y * -5.5 * h;
    }
    this.pos.addScaledVector(this.vel, h);

    // net collision: crossing z=0 plane below net height
    if (Math.sign(prevZ) !== Math.sign(this.pos.z) && prevZ !== 0) {
      const t = Math.abs(prevZ) / Math.abs(this.pos.z - prevZ);
      const xAt = THREE.MathUtils.lerp(this.pos.x - this.vel.x * h, this.pos.x, t);
      const yAt = this.pos.y - this.vel.y * h * (1 - t);
      const halfNet = COURT.widthDoubles / 2 + 0.5;
      const netH = COURT.netHeightCenter + (COURT.netHeightPost - COURT.netHeightCenter) * Math.min(1, Math.abs(xAt) / (COURT.widthDoubles / 2));
      if (Math.abs(xAt) < halfNet && yAt < netH + BALL.radius) {
        if (yAt > netH - 0.09) {
          // net cord: clip the tape, drastically slow, dribble over or back
          this.vel.z *= 0.25;
          this.vel.y = Math.max(this.vel.y * 0.3, 1.2);
          this.vel.x *= 0.6;
          this.events?.onNetCord();
        } else {
          // into the net: stop and drop on the shooter's side
          this.pos.z = prevZ >= 0 ? 0.12 : -0.12;
          this.vel.set(this.vel.x * 0.05, Math.max(0, this.vel.y * 0.1), 0);
          this.events?.onNetCord();
        }
      }
    }

    // ground bounce
    if (this.pos.y < BALL.radius && this.vel.y < 0) {
      this.pos.y = BALL.radius;
      this.vel.y = -this.vel.y * BALL.bounceRestitution * this.bounceRestitutionMul;
      // spin effects on bounce
      if (this.spin.y > 0.5) { this.vel.z *= 1.12; this.vel.y *= 0.9; }   // topspin kicks forward, stays low-ish
      else if (this.spin.y < -0.4) { this.vel.z *= 0.82; this.vel.y *= 0.75; } // slice skids & dies
      this.vel.x *= 0.92; this.vel.z *= 0.96;
      this.bouncesSinceHit++;
      const side = Math.sign(this.pos.z);
      if (side !== this.sideOfLastBounce) this.sideOfLastBounce = side;
      this.events?.onBounce(this.pos, this.bouncesSinceHit);
      if (Math.abs(this.vel.y) < 0.8 && this.vel.lengthSq() < 4) {
        this.active = false;
        this.events?.onDead();
      }
    }
  }

  private sync(): void {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.vel.z * 0.02;
    this.mesh.rotation.z -= this.vel.x * 0.02;
    this.shadow.position.set(this.pos.x, 0.012, this.pos.z);
    const h = Math.max(0.2, this.pos.y);
    const sc = 1 + h * 0.18;
    this.shadow.scale.setScalar(sc);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.34 / (1 + h * 0.25);

    // trail
    if (this.active && this.vel.lengthSq() > 25) {
      this.trailPos.unshift(this.pos.clone());
      if (this.trailPos.length > TRAIL_LEN) this.trailPos.pop();
    } else if (this.trailPos.length) {
      this.trailPos.pop();
    }
    const m = new THREE.Matrix4();
    this.trail.count = this.trailPos.length;
    for (let i = 0; i < this.trailPos.length; i++) {
      const s = (1 - i / TRAIL_LEN) * 0.9;
      m.makeScale(s, s, s).setPosition(this.trailPos[i]);
      this.trail.setMatrixAt(i, m);
    }
    this.trail.instanceMatrix.needsUpdate = true;
  }

  /** predict landing point (y = radius) from current state; returns time or -1 */
  predictLanding(outPos: THREE.Vector3): number {
    // simple ballistic sim clone (cheap, ~60 iters max)
    const p = this.pos.clone();
    const v = this.vel.clone();
    const h = 0.016;
    for (let t = 0; t < 3.5; t += h) {
      v.y += GRAVITY * h;
      v.x += this.spin.x * 6 * h;
      v.y += this.spin.y * -5.5 * h;
      p.addScaledVector(v, h);
      if (p.y <= BALL.radius && v.y < 0) {
        outPos.copy(p);
        return t;
      }
    }
    outPos.copy(p);
    return -1;
  }
}
