import * as THREE from 'three';

/* ============================================================
 * Procedural cartoon tennis racquet (~0.68 m long).
 * Built along +Y: grip at origin, head tip at +0.68.
 * String plane faces ±Z. `headCenter` marks the sweet spot.
 * ============================================================ */

export interface Racquet {
  group: THREE.Group;
  headCenter: THREE.Object3D;
  dispose(): void;
}

const LEN = 0.68;
const HEAD_RX = 0.115; // head half-width
const HEAD_RY = 0.145; // head half-height
const HEAD_CY = LEN - HEAD_RY - 0.01; // head center height

function stringsTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(245,245,240,0.95)';
  g.lineWidth = 2.5;
  for (let i = 6; i < 128; i += 11) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export function buildRacquet(accentColor: string): Racquet {
  const group = new THREE.Group();
  group.name = 'racquet';

  const accent = new THREE.Color(accentColor);
  const frameCol = accent.clone().lerp(new THREE.Color('#222228'), 0.15);

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];

  const matGrip = new THREE.MeshStandardMaterial({ color: 0x24242a, roughness: 0.9 });
  const matGripRing = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7 });
  const matFrame = new THREE.MeshStandardMaterial({ color: frameCol, roughness: 0.45, metalness: 0.15 });
  const matCap = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.6 });
  mats.push(matGrip, matGripRing, matFrame, matCap);

  // ---- handle ----
  const gripLen = 0.2;
  const gripGeo = new THREE.CylinderGeometry(0.0135, 0.0155, gripLen, 10);
  geos.push(gripGeo);
  const grip = new THREE.Mesh(gripGeo, matGrip);
  grip.position.y = gripLen / 2;
  group.add(grip);

  // grip wrap rings
  const ringGeo = new THREE.TorusGeometry(0.0145, 0.0028, 6, 14);
  geos.push(ringGeo);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(ringGeo, matGripRing);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.035 + i * 0.045;
    group.add(ring);
  }
  // butt cap
  const capGeo = new THREE.CylinderGeometry(0.017, 0.017, 0.012, 10);
  geos.push(capGeo);
  const cap = new THREE.Mesh(capGeo, matCap);
  cap.position.y = 0.002;
  group.add(cap);

  // ---- throat: V of two thin cylinders from handle top to head bottom sides ----
  const throatTop = new THREE.Vector3(0, HEAD_CY - HEAD_RY * 0.62, 0);
  for (const side of [-1, 1]) {
    const a = new THREE.Vector3(0, gripLen - 0.01, 0);
    const b = new THREE.Vector3(side * HEAD_RX * 0.72, throatTop.y, 0);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const tGeo = new THREE.CylinderGeometry(0.008, 0.0095, len, 8);
    geos.push(tGeo);
    const t = new THREE.Mesh(tGeo, matFrame);
    t.position.copy(a).addScaledVector(dir, 0.5);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(t);
  }

  // ---- head: elliptical tube (a scaled torus would thin the frame) ----
  const ellPts: THREE.Vector3[] = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ellPts.push(new THREE.Vector3(Math.cos(a) * HEAD_RX, HEAD_CY + Math.sin(a) * HEAD_RY, 0));
  }
  const headGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ellPts, true), 48, 0.0115, 8, true);
  geos.push(headGeo);
  const head = new THREE.Mesh(headGeo, matFrame);
  group.add(head);

  // ---- strings: circle plane with grid texture ----
  const tex = stringsTexture();
  texs.push(tex);
  const matStrings = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  mats.push(matStrings);
  const strGeo = new THREE.CircleGeometry(1, 28);
  geos.push(strGeo);
  const strings = new THREE.Mesh(strGeo, matStrings);
  strings.scale.set(HEAD_RX * 0.97, HEAD_RY * 0.97, 1);
  strings.position.y = HEAD_CY;
  group.add(strings);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
    }
  });

  // sweet-spot marker
  const headCenter = new THREE.Object3D();
  headCenter.name = 'racquetHead';
  headCenter.position.set(0, HEAD_CY, 0);
  group.add(headCenter);

  return {
    group,
    headCenter,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
