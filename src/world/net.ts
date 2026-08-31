import * as THREE from 'three';
import { COURT } from '../core/constants';
import type { ThemePalette } from './themes';
import { netTexture } from './util';

/* Net at z = 0: posts just outside the doubles sidelines, sagging mesh cloth
 * with a procedural grid texture, white cable band (in the texture) and a
 * center strap. */

export function buildNet(palette: ThemePalette): THREE.Group {
  const group = new THREE.Group();
  group.name = 'net';

  const postX = COURT.widthDoubles / 2 + 0.55;
  const hPost = COURT.netHeightPost;
  const hCenter = COURT.netHeightCenter;

  // --- posts ---
  const postMat = new THREE.MeshLambertMaterial({
    color: palette.night ? 0x3a2a6a : 0x2b3440,
  });
  const capMat = new THREE.MeshLambertMaterial({
    color: palette.night ? palette.accent2 : 0xf2f2f2,
    emissive: palette.night ? palette.accent2 : 0x000000,
    emissiveIntensity: palette.night ? 0.8 : 0,
  });
  const postGeo = new THREE.CylinderGeometry(0.07, 0.09, hPost + 0.1, 10);
  const capGeo = new THREE.SphereGeometry(0.11, 10, 8);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(sx * postX, (hPost + 0.1) / 2, 0);
    post.castShadow = true;
    group.add(post);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(sx * postX, hPost + 0.12, 0);
    group.add(cap);
  }

  // --- sagging cloth ---
  const segX = 36;
  const segY = 6;
  const cloth = new THREE.PlaneGeometry(postX * 2, 1, segX, segY);
  const pos = cloth.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const vNorm = pos.getY(i) + 0.5; // 0 bottom .. 1 top
    const topH = hCenter + (hPost - hCenter) * Math.pow(x / postX, 2);
    pos.setY(i, vNorm * topH);
    // slight belly toward +z at center, cartoon touch
    pos.setZ(i, Math.cos((x / postX) * Math.PI * 0.5) * 0.05 * vNorm);
  }
  cloth.computeVertexNormals();

  const clothMat = new THREE.MeshBasicMaterial({
    map: netTexture(220, 16),
    transparent: true,
    alphaTest: 0.3,
    side: THREE.DoubleSide,
  });
  const net = new THREE.Mesh(cloth, clothMat);
  net.castShadow = true;
  group.add(net);

  // --- center strap ---
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, hCenter, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xffffff })
  );
  strap.position.set(0, hCenter / 2, 0.03);
  group.add(strap);

  return group;
}
