import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COURT } from '../core/constants';
import type { ThemePalette } from './themes';

/* Court: big ground plane, apron/runoff, marked doubles court and crisp
 * raised white line strips (slightly emissive so they pop). */

const LINE_W = 0.07; // cartoony-chunky painted lines
const LINE_Y = 0.02; // raised to dodge z-fighting at gameplay distances

export function buildCourt(palette: ThemePalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'court';

  const halfL = COURT.halfLength;
  const dblHalf = COURT.widthDoubles / 2;
  const sglHalf = COURT.widthSingles / 2;

  // --- world ground, way past the runoff ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 320),
    new THREE.MeshLambertMaterial({ color: palette.ground })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // --- apron / runoff ---
  const apronW = COURT.widthDoubles + COURT.runoff * 2;
  const apronL = COURT.length + COURT.runoff * 2;
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(apronW, apronL),
    new THREE.MeshLambertMaterial({ color: palette.apron })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0;
  apron.receiveShadow = true;
  group.add(apron);

  // --- marked court surface (slightly larger than the doubles lines) ---
  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.widthDoubles + 0.5, COURT.length + 0.5),
    new THREE.MeshLambertMaterial({ color: palette.courtIn })
  );
  court.rotation.x = -Math.PI / 2;
  court.position.y = 0.01;
  court.receiveShadow = true;
  group.add(court);

  // --- painted lines as merged raised strips ---
  const strips: THREE.BufferGeometry[] = [];
  /** strip centered at (cx, cz), spanning sx along X and sz along Z */
  const strip = (cx: number, cz: number, sx: number, sz: number) => {
    const g = new THREE.PlaneGeometry(sx, sz);
    g.rotateX(-Math.PI / 2);
    g.translate(cx, 0, cz);
    strips.push(g);
  };

  const fullW = COURT.widthDoubles + LINE_W;
  // baselines (a touch chunkier, like real courts)
  strip(0, -halfL, fullW, LINE_W * 1.6);
  strip(0, halfL, fullW, LINE_W * 1.6);
  // doubles sidelines
  strip(-dblHalf, 0, LINE_W, COURT.length + LINE_W);
  strip(dblHalf, 0, LINE_W, COURT.length + LINE_W);
  // singles sidelines
  strip(-sglHalf, 0, LINE_W, COURT.length + LINE_W);
  strip(sglHalf, 0, LINE_W, COURT.length + LINE_W);
  // service lines
  strip(0, -COURT.serviceLine, COURT.widthSingles + LINE_W, LINE_W);
  strip(0, COURT.serviceLine, COURT.widthSingles + LINE_W, LINE_W);
  // center service line (net to both service lines)
  strip(0, 0, LINE_W, COURT.serviceLine * 2);
  // center marks at the baselines (point inward)
  strip(0, -halfL + 0.18, LINE_W, 0.36);
  strip(0, halfL - 0.18, LINE_W, 0.36);

  const lineGeo = mergeGeometries(strips)!;
  lineGeo.translate(0, LINE_Y, 0);
  const lineColor = new THREE.Color(palette.line);
  // night lines are pure unlit glow (cursed energy); day lines are lit paint
  const lineMat = palette.night
    ? new THREE.MeshBasicMaterial({ color: lineColor })
    : new THREE.MeshLambertMaterial({
        color: lineColor,
        emissive: lineColor,
        emissiveIntensity: 0.35 + palette.lineGlow * 1.4,
      });
  const lines = new THREE.Mesh(lineGeo, lineMat);
  lines.receiveShadow = !palette.night; // glowing night lines ignore shadow
  group.add(lines);
  strips.forEach((s) => s.dispose());

  return group;
}
