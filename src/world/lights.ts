import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { ThemePalette } from './themes';

/* Lighting rig: hemisphere + shadow-casting directional fit tightly around
 * the court. Night theme adds 4 floodlight towers with emissive heads and
 * (non-shadow) spotlights, plus a soft purple accent glow.
 *
 * On top of that sit two CHARACTER FILL lights. three.js has no per-object
 * light filtering (lights are only masked by camera layers), so the trick is
 * geometric: aim them almost horizontally. A Lambert surface takes light by
 * N·L, so a near-horizontal beam pours onto upright things — the players — and
 * grazes the court floor at ~cos(83°), so it keeps only a ninth of the beam. That lifts the
 * characters out of the dark courts without flattening the court itself. */

/** elevation of the fill beams above the deck; low enough that the floor
 *  keeps its contrast, high enough to reach faces rather than shins */
const FILL_ELEVATION = 4.2;

export function buildLights(palette: ThemePalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lights';

  const hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiInt);
  group.add(hemi);

  const dir = new THREE.DirectionalLight(palette.dirColor, palette.dirInt);
  dir.position.set(...palette.dirPos);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  // tight orthographic fit around the court + runoff (players live here)
  const sx = COURT.widthDoubles / 2 + COURT.runoff + 1;
  const sz = COURT.halfLength + COURT.runoff + 1;
  const cam = dir.shadow.camera;
  cam.left = -Math.max(sx, sz) * 1.05;
  cam.right = Math.max(sx, sz) * 1.05;
  cam.top = Math.max(sx, sz) * 1.05;
  cam.bottom = -Math.max(sx, sz) * 1.05;
  cam.near = 2;
  cam.far = 90;
  cam.updateProjectionMatrix();
  dir.shadow.bias = -0.0004;
  dir.target.position.set(0, 0, 0);
  group.add(dir);
  group.add(dir.target);

  // --- character fill (see header): one from each baseline, no shadows ---
  for (const end of [1, -1]) {
    const fill = new THREE.DirectionalLight(palette.fillColor, palette.fillInt);
    fill.position.set(end * 7, FILL_ELEVATION, end * 26);
    fill.target.position.set(0, 1.1, 0);
    fill.castShadow = false;
    group.add(fill);
    group.add(fill.target);
  }

  if (palette.floodlights) {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2450 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0x1a1636 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
    const poleGeo = new THREE.CylinderGeometry(0.22, 0.34, 13, 8);
    const headGeo = new THREE.BoxGeometry(2.6, 1.5, 0.5);
    const lampGeo = new THREE.SphereGeometry(0.24, 8, 6);

    for (const sx2 of [-1, 1]) {
      for (const sz2 of [-1, 1]) {
        const tower = new THREE.Group();
        const px = sx2 * 16.5;
        const pz = sz2 * 23.5;
        tower.position.set(px, 0, pz);
        group.add(tower);

        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 6.5;
        pole.castShadow = true;
        tower.add(pole);

        const head = new THREE.Group();
        head.position.y = 13.4;
        const panel = new THREE.Mesh(headGeo, headMat);
        head.add(panel);
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 4; c++) {
            const lamp = new THREE.Mesh(lampGeo, lampMat);
            lamp.position.set(-0.95 + c * 0.64, -0.35 + r * 0.7, 0.3);
            head.add(lamp);
          }
        }
        tower.add(head);
        head.lookAt(0, 2, 0); // aim the panel down toward the court center

        const spot = new THREE.SpotLight(0xdfe8ff, 900, 90, 0.62, 0.5, 1.6);
        spot.position.set(0, 13.2, 0);
        spot.target.position.set(-px * 0.65, 0, -pz * 0.65);
        tower.add(spot);
        tower.add(spot.target);
      }
    }

    // faint cursed-energy ambience
    const cursed = new THREE.PointLight(palette.accent, 220, 70, 1.8);
    cursed.position.set(0, 9, 0);
    group.add(cursed);
  }

  return group;
}
