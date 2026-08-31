import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemePalette } from './themes';
import { bannerTexture } from './util';

/* Stadium bowl: a low banner wall around the apron, then tiered seating on
 * all four sides with open cartoon corner gaps. Rows are chunky colored
 * sections (vertex-colored merged boxes). Also returns seat anchors that the
 * crowd system fills with spectators. */

export interface SeatAnchor {
  x: number;
  y: number; // row top (seat surface)
  z: number;
  yaw: number; // facing the court
}

export interface StandsBuild {
  group: THREE.Group;
  anchors: SeatAnchor[];
}

// bowl layout constants (shared with lights.ts for tower placement)
export const WALL_X = 12.7;
export const WALL_Z = 19.2;
export const ROWS = 9;
export const STEP_H = 0.58;
export const STEP_D = 1.2;
export const STAND_BASE = 0.7; // top of first row = STAND_BASE + STEP_H

const BANNER_TEXTS = [
  'CURSED COURT',
  'SHIBUYA OPEN',
  'NEVARRO CLASSIC',
  'THIS IS THE WAY',
  'DOMAIN EXPANSION',
];

export function buildStands(palette: ThemePalette, rand: () => number): StandsBuild {
  const group = new THREE.Group();
  group.name = 'stands';
  const anchors: SeatAnchor[] = [];

  // ---------- low wall around the apron ----------
  const wallH = 1.15;
  const wallT = 0.35;
  const wallMat = new THREE.MeshLambertMaterial({ color: palette.wall });
  const wallGeos: THREE.BufferGeometry[] = [];
  const addWall = (cx: number, cz: number, sx: number, sz: number) => {
    const g = new THREE.BoxGeometry(sx, wallH, sz);
    g.translate(cx, wallH / 2, cz);
    wallGeos.push(g);
  };
  addWall(0, -WALL_Z, WALL_X * 2 + wallT, wallT);
  addWall(0, WALL_Z, WALL_X * 2 + wallT, wallT);
  addWall(-WALL_X, 0, wallT, WALL_Z * 2 + wallT);
  addWall(WALL_X, 0, wallT, WALL_Z * 2 + wallT);
  const wall = new THREE.Mesh(mergeGeometries(wallGeos)!, wallMat);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
  wallGeos.forEach((g) => g.dispose());

  // white top rail on the wall
  const railGeos: THREE.BufferGeometry[] = [];
  const addRail = (cx: number, cz: number, sx: number, sz: number) => {
    const g = new THREE.BoxGeometry(sx, 0.08, sz);
    g.translate(cx, wallH + 0.04, cz);
    railGeos.push(g);
  };
  addRail(0, -WALL_Z, WALL_X * 2 + wallT + 0.1, wallT + 0.1);
  addRail(0, WALL_Z, WALL_X * 2 + wallT + 0.1, wallT + 0.1);
  addRail(-WALL_X, 0, wallT + 0.1, WALL_Z * 2 + wallT + 0.1);
  addRail(WALL_X, 0, wallT + 0.1, WALL_Z * 2 + wallT + 0.1);
  const railMat = palette.glowStrips
    ? new THREE.MeshBasicMaterial({ color: palette.accent })
    : new THREE.MeshLambertMaterial({ color: 0xf2f5f7 });
  const rail = new THREE.Mesh(mergeGeometries(railGeos)!, railMat);
  group.add(rail);
  railGeos.forEach((g) => g.dispose());

  // ---------- banners on the inner wall faces ----------
  const bannerMats = BANNER_TEXTS.map(
    (t) =>
      new THREE.MeshBasicMaterial({
        map: bannerTexture(t, palette.bannerBg, palette.bannerText, palette.bannerOutline),
      })
  );
  const bannerGeo = new THREE.PlaneGeometry(5.6, 0.88);
  let bannerIdx = 0;
  const addBanner = (x: number, z: number, yaw: number) => {
    const m = new THREE.Mesh(bannerGeo, bannerMats[bannerIdx % bannerMats.length]);
    bannerIdx++;
    m.position.set(x, 0.62, z);
    m.rotation.y = yaw;
    group.add(m);
  };
  const innerX = WALL_X - wallT / 2 - 0.02;
  const innerZ = WALL_Z - wallT / 2 - 0.02;
  // far wall (faces +z toward the default camera) and near wall
  for (const bx of [-8.2, -2.75, 2.75, 8.2]) {
    addBanner(bx, -innerZ, 0);
  }
  for (const bx of [-8.2, -2.75, 2.75, 8.2]) {
    addBanner(bx, innerZ, Math.PI);
  }
  // side walls
  for (const bz of [-13.5, -8, -2.5, 2.5, 8, 13.5]) {
    addBanner(-innerX, bz, Math.PI / 2);
    addBanner(innerX, bz, -Math.PI / 2);
  }

  // ---------- tiered seating ----------
  const sideHalfZ = WALL_Z - 3.0; // east/west stand length (leaves corner gaps)
  const endHalfX = WALL_X - 3.0; // north/south stand length
  const startX = WALL_X + 1.0;
  const startZ = WALL_Z + 1.0;

  const tierGeos: THREE.BufferGeometry[] = [];
  const colorTmp = new THREE.Color();
  const seatColors = palette.seatColors;

  /** one full stand side; axis 'x' = stand extends outward along ±x */
  const buildSide = (
    axis: 'x' | 'z',
    sign: 1 | -1,
    halfLen: number,
    start: number
  ) => {
    const segLen = 4.4; // color section length
    for (let row = 0; row < ROWS; row++) {
      const top = STAND_BASE + (row + 1) * STEP_H;
      const inner = start + row * STEP_D;
      const center = inner + STEP_D / 2;
      const height = top; // solid from ground up: clean stair silhouette
      const nSeg = Math.ceil((halfLen * 2) / segLen);
      for (let s = 0; s < nSeg; s++) {
        const a0 = -halfLen + s * segLen;
        const a1 = Math.min(halfLen, a0 + segLen);
        const aC = (a0 + a1) / 2;
        const aLen = a1 - a0;
        const g = new THREE.BoxGeometry(
          axis === 'x' ? STEP_D : aLen,
          height,
          axis === 'x' ? aLen : STEP_D
        );
        g.translate(
          axis === 'x' ? sign * center : aC,
          height / 2,
          axis === 'x' ? aC : sign * center
        );
        // vertex colors: alternate sections, shift palette per row
        colorTmp.setHex(seatColors[(s + row) % seatColors.length]);
        const cnt = g.attributes.position.count;
        const cols = new Float32Array(cnt * 3);
        for (let i = 0; i < cnt; i++) {
          cols[i * 3] = colorTmp.r;
          cols[i * 3 + 1] = colorTmp.g;
          cols[i * 3 + 2] = colorTmp.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        tierGeos.push(g);
      }
      // seat anchors along this row
      const yaw =
        axis === 'x' ? (sign > 0 ? -Math.PI / 2 : Math.PI / 2) : sign > 0 ? Math.PI : 0;
      for (let a = -halfLen + 0.7; a <= halfLen - 0.7; a += 0.92) {
        const jitter = (rand() - 0.5) * 0.22;
        anchors.push({
          x: axis === 'x' ? sign * (center + 0.15) : a + jitter,
          y: top,
          z: axis === 'x' ? a + jitter : sign * (center + 0.15),
          yaw,
        });
      }
    }
    // tall back wall behind the last row
    const backInner = start + ROWS * STEP_D;
    const backH = STAND_BASE + ROWS * STEP_H + 2.4;
    const g = new THREE.BoxGeometry(
      axis === 'x' ? 0.5 : halfLen * 2 + 1,
      backH,
      axis === 'x' ? halfLen * 2 + 1 : 0.5
    );
    g.translate(
      axis === 'x' ? sign * (backInner + 0.25) : 0,
      backH / 2,
      axis === 'x' ? 0 : sign * (backInner + 0.25)
    );
    colorTmp.setHex(palette.standBack);
    const cnt = g.attributes.position.count;
    const cols = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      cols[i * 3] = colorTmp.r;
      cols[i * 3 + 1] = colorTmp.g;
      cols[i * 3 + 2] = colorTmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    tierGeos.push(g);
  };

  buildSide('x', 1, sideHalfZ, startX);
  buildSide('x', -1, sideHalfZ, startX);
  buildSide('z', 1, endHalfX, startZ);
  buildSide('z', -1, endHalfX, startZ);

  const tiers = new THREE.Mesh(
    mergeGeometries(tierGeos)!,
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  tiers.castShadow = true;
  tiers.receiveShadow = true;
  group.add(tiers);
  tierGeos.forEach((g) => g.dispose());

  // ---------- cursed-energy glow strips (night theme) ----------
  if (palette.glowStrips) {
    const stripGeos: THREE.BufferGeometry[] = [];
    for (let row = 0; row < ROWS; row += 2) {
      const top = STAND_BASE + (row + 1) * STEP_H;
      const innerX2 = startX + row * STEP_D;
      const innerZ2 = startZ + row * STEP_D;
      const mk = (sx: number, sz: number, cx: number, cz: number) => {
        const g = new THREE.BoxGeometry(sx, 0.08, sz);
        g.translate(cx, top + 0.04, cz);
        stripGeos.push(g);
      };
      mk(0.1, sideHalfZ * 2, innerX2 + 0.05, 0);
      mk(0.1, sideHalfZ * 2, -(innerX2 + 0.05), 0);
      mk(endHalfX * 2, 0.1, 0, innerZ2 + 0.05);
      mk(endHalfX * 2, 0.1, 0, -(innerZ2 + 0.05));
    }
    const strips = new THREE.Mesh(
      mergeGeometries(stripGeos)!,
      new THREE.MeshBasicMaterial({ color: palette.accent })
    );
    group.add(strips);
    stripGeos.forEach((g) => g.dispose());
  }

  return { group, anchors };
}
