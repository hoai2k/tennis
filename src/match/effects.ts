import * as THREE from 'three';

/* Small gameplay VFX owned by the match: hit sparks, star (chance-shot)
 * ground marker, bounce puffs. Cheap sprite/mesh pools, no allocation
 * during play. */

class SpritePool {
  items: { mesh: THREE.Sprite; life: number; maxLife: number; vel: THREE.Vector3; grow: number }[] = [];
  constructor(readonly group: THREE.Group, tex: THREE.Texture, count: number, color: number, size: number) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(size);
      s.visible = false;
      group.add(s);
      this.items.push({ mesh: s, life: 0, maxLife: 0.4, vel: new THREE.Vector3(), grow: 0 });
    }
  }
  spawn(pos: THREE.Vector3, vel: THREE.Vector3, life: number, color?: number, grow = 0): void {
    const it = this.items.find((i) => i.life <= 0) ?? this.items[0];
    it.mesh.visible = true;
    it.mesh.position.copy(pos);
    it.vel.copy(vel);
    it.life = it.maxLife = life;
    it.grow = grow;
    if (color !== undefined) (it.mesh.material as THREE.SpriteMaterial).color.set(color);
  }
  update(dt: number): void {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.mesh.visible = false; continue; }
      it.mesh.position.addScaledVector(it.vel, dt);
      it.vel.y -= 4 * dt;
      const f = it.life / it.maxLife;
      (it.mesh.material as THREE.SpriteMaterial).opacity = f * 0.72;
      if (it.grow) it.mesh.scale.addScalar(it.grow * dt);
    }
  }
}

function circleTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function starShape(): THREE.Shape {
  const s = new THREE.Shape();
  const outer = 0.5, inner = 0.21;
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export class MatchFx {
  readonly group = new THREE.Group();
  private sparks: SpritePool;
  private puffs: SpritePool;
  private star: THREE.Group;
  private starRing: THREE.Mesh;
  private starT = 0;
  starActive = false;
  readonly starPos = new THREE.Vector3();
  shake = 0;

  constructor() {
    const tex = circleTexture();
    this.sparks = new SpritePool(this.group, tex, 24, 0xffee66, 0.3);
    this.puffs = new SpritePool(this.group, tex, 16, 0xffffff, 0.35);

    // chance-shot star marker: gold star + pulsing ring lying on the court
    this.star = new THREE.Group();
    const starMesh = new THREE.Mesh(
      new THREE.ShapeGeometry(starShape()),
      new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }),
    );
    starMesh.rotation.x = -Math.PI / 2;
    starMesh.position.y = 0.02;
    starMesh.scale.setScalar(1.5);
    this.starRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.85, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.starRing.rotation.x = -Math.PI / 2;
    this.starRing.position.y = 0.025;
    this.star.add(starMesh, this.starRing);
    this.star.visible = false;
    this.group.add(this.star);
  }

  hitSpark(pos: THREE.Vector3, color: number, big: boolean): void {
    // Kept deliberately small and short-lived: the ball leaves the racquet
    // through this burst, and a big bloom hides exactly the thing the player
    // needs to track.
    const n = big ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 2.6, Math.random() * 2.4 + 0.8, Math.sin(a) * 2.6);
      this.sparks.spawn(pos, v, big ? 0.26 : 0.16, color, big ? 0.5 : 0);
    }
    if (big) this.shake = Math.max(this.shake, 0.34);
  }

  bouncePuff(pos: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.puffs.spawn(
        new THREE.Vector3(pos.x, 0.06, pos.z),
        new THREE.Vector3(Math.cos(a) * 1.2, 0.8, Math.sin(a) * 1.2),
        0.35, 0xffffff, 0.6,
      );
    }
  }

  showStar(pos: THREE.Vector3): void {
    this.starActive = true;
    this.starPos.copy(pos);
    this.star.position.set(pos.x, 0, pos.z);
    this.star.visible = true;
    this.starT = 0;
  }

  hideStar(): void {
    this.starActive = false;
    this.star.visible = false;
  }

  addShake(v: number): void { this.shake = Math.max(this.shake, v); }

  update(dt: number): void {
    this.sparks.update(dt);
    this.puffs.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.starActive) {
      this.starT += dt;
      const p = 1 + Math.sin(this.starT * 6) * 0.12;
      this.star.scale.setScalar(p);
      this.star.rotation.y += dt * 1.5;
      (this.starRing.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.starT * 6) * 0.3;
    }
  }
}
