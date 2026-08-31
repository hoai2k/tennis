import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { ThemePalette } from './themes';

/* Courtside furniture: umpire chair, player benches, ball-kid stools and
 * line-judge boxes. Chunky cartoon proportions, cheap box/cylinder shapes. */

export function buildFurniture(palette: ThemePalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'furniture';

  const frameMat = new THREE.MeshLambertMaterial({
    color: palette.night ? 0x35306a : 0xf2f5f7,
  });
  const seatMat = new THREE.MeshLambertMaterial({ color: palette.accent });
  const woodMat = new THREE.MeshLambertMaterial({
    color: palette.night ? 0x2a2450 : 0x3a7d4f,
  });

  const halfL = COURT.halfLength;
  const sideX = COURT.widthDoubles / 2 + 1.9;

  // ---------- umpire chair (tall, chunky) ----------
  const umpire = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.14, 2.2, 0.14);
  for (const [lx, lz] of [
    [-0.45, -0.4],
    [0.45, -0.4],
    [-0.45, 0.4],
    [0.45, 0.4],
  ]) {
    const leg = new THREE.Mesh(legGeo, frameMat);
    leg.position.set(lx, 1.1, lz);
    // splay the legs outward a touch, cartoon style
    leg.rotation.z = -lx * 0.14;
    leg.rotation.x = lz * 0.14;
    leg.castShadow = true;
    umpire.add(leg);
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.0), frameMat);
  platform.position.y = 2.16;
  platform.castShadow = true;
  umpire.add(platform);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.7), seatMat);
  seat.position.set(0, 2.34, 0.05);
  seat.castShadow = true;
  umpire.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.16), seatMat);
  back.position.set(0, 2.85, -0.38); // backrest away from the court
  back.castShadow = true;
  umpire.add(back);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.1), frameMat);
  desk.position.set(0, 2.1, 0.52); // front board facing the court
  umpire.add(desk);
  // ladder steps
  const stepGeo = new THREE.BoxGeometry(0.55, 0.07, 0.16);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(stepGeo, frameMat);
    s.position.set(0, 0.4 + i * 0.5, -0.55 - i * 0.06);
    umpire.add(s);
  }
  // umpire chair sits at the net, opposite the benches
  umpire.position.set(-(sideX + 0.6), 0, 0);
  umpire.rotation.y = Math.PI / 2; // face the court
  group.add(umpire);

  // ---------- player benches (both sides of the net, near umpire side is off-limits) ----------
  const benchGroupGeo = {
    seat: new THREE.BoxGeometry(2.6, 0.14, 0.62),
    back: new THREE.BoxGeometry(2.6, 0.55, 0.12),
    leg: new THREE.BoxGeometry(0.14, 0.5, 0.55),
  };
  for (const sz of [-1, 1]) {
    const bench = new THREE.Group();
    const bSeat = new THREE.Mesh(benchGroupGeo.seat, woodMat);
    bSeat.position.y = 0.55;
    bSeat.castShadow = true;
    bench.add(bSeat);
    const bBack = new THREE.Mesh(benchGroupGeo.back, woodMat);
    bBack.position.set(0, 0.9, 0.34);
    bBack.castShadow = true;
    bench.add(bBack);
    for (const lx of [-1.1, 1.1]) {
      const leg = new THREE.Mesh(benchGroupGeo.leg, frameMat);
      leg.position.set(lx, 0.26, 0);
      bench.add(leg);
    }
    bench.position.set(sideX + 1.1, 0, sz * 3.6);
    bench.rotation.y = -Math.PI / 2;
    group.add(bench);
  }

  // ---------- ball-kid stools at the four apron corners ----------
  const stoolGeo = new THREE.CylinderGeometry(0.26, 0.32, 0.5, 10);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const stool = new THREE.Mesh(stoolGeo, seatMat);
      stool.position.set(sx * (COURT.widthDoubles / 2 + 2.4), 0.25, sz * (halfL + 2.6));
      stool.castShadow = true;
      group.add(stool);
    }
  }

  // ---------- line-judge boxes behind the baselines ----------
  const boxGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const boxSeatGeo = new THREE.BoxGeometry(0.7, 0.12, 0.5);
  for (const sz of [-1, 1]) {
    for (const bx of [-4.6, 4.6]) {
      const box = new THREE.Mesh(boxGeo, woodMat);
      box.position.set(bx, 0.45, sz * (halfL + 4.4));
      box.castShadow = true;
      group.add(box);
      const bseat = new THREE.Mesh(boxSeatGeo, seatMat);
      bseat.position.set(bx, 0.96, sz * (halfL + 4.4));
      group.add(bseat);
    }
  }

  return group;
}
