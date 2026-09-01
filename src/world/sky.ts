import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ThemePalette } from './themes';
import { pick } from './util';

/* Sky dome (gradient shader), sun/moon disc + halo, puffy cartoon clouds,
 * stars and a distant skyline silhouette per theme. */

export function buildSky(palette: ThemePalette, rand: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'sky';

  // ---------- gradient dome ----------
  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      cTop: { value: new THREE.Color(palette.skyTop) },
      cHorizon: { value: new THREE.Color(palette.skyHorizon) },
      cBottom: { value: new THREE.Color(palette.skyBottom) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 cTop; uniform vec3 cHorizon; uniform vec3 cBottom;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0
          ? mix(cHorizon, cTop, pow(smoothstep(0.0, 0.55, h), 0.85))
          : mix(cHorizon, cBottom, smoothstep(0.0, 0.25, -h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 18), domeMat);
  group.add(dome);

  // ---------- sun / moon ----------
  const sunDir = new THREE.Vector3(...palette.sunPos).normalize();
  const sunPos = sunDir.clone().multiplyScalar(238);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(palette.sunSize, 24),
    new THREE.MeshBasicMaterial({ color: palette.sunColor })
  );
  sun.position.copy(sunPos);
  sun.lookAt(0, 0, 0);
  group.add(sun);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(palette.sunSize * 2.1, 24),
    new THREE.MeshBasicMaterial({
      color: palette.sunColor,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })
  );
  halo.position.copy(sunPos).multiplyScalar(0.995);
  halo.lookAt(0, 0, 0);
  group.add(halo);
  if (palette.night) {
    // crescent shadow bite on the moon
    const bite = new THREE.Mesh(
      new THREE.CircleGeometry(palette.sunSize * 0.85, 24),
      new THREE.MeshBasicMaterial({ color: palette.skyTop })
    );
    bite.position.copy(sunPos).multiplyScalar(0.98);
    bite.position.x -= palette.sunSize * 0.55;
    bite.lookAt(0, 0, 0);
    group.add(bite);
  }

  // ---------- optional second sun (Tatooine flavor) ----------
  if (palette.sun2Pos) {
    const s2Size = palette.sun2Size ?? palette.sunSize * 0.7;
    const s2Color = palette.sun2Color ?? palette.sunColor;
    const s2Pos = new THREE.Vector3(...palette.sun2Pos).normalize().multiplyScalar(238);
    const sun2 = new THREE.Mesh(
      new THREE.CircleGeometry(s2Size, 24),
      new THREE.MeshBasicMaterial({ color: s2Color })
    );
    sun2.position.copy(s2Pos);
    sun2.lookAt(0, 0, 0);
    group.add(sun2);
    const halo2 = new THREE.Mesh(
      new THREE.CircleGeometry(s2Size * 2.1, 24),
      new THREE.MeshBasicMaterial({
        color: s2Color,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      })
    );
    halo2.position.copy(s2Pos).multiplyScalar(0.995);
    halo2.lookAt(0, 0, 0);
    group.add(halo2);
  }

  // ---------- puffy cartoon clouds ----------
  if (palette.clouds) {
    const cloudGeos: THREE.BufferGeometry[] = [];
    const nClouds = 9;
    for (let c = 0; c < nClouds; c++) {
      const ang = (c / nClouds) * Math.PI * 2 + rand() * 0.6;
      const r = 85 + rand() * 60;
      const cx = Math.cos(ang) * r;
      const cz = Math.sin(ang) * r;
      const cy = 26 + rand() * 34;
      const puffs = 3 + Math.floor(rand() * 3);
      const s = 7 + rand() * 8;
      for (let p = 0; p < puffs; p++) {
        const g = new THREE.SphereGeometry(s * (0.55 + rand() * 0.5), 10, 8);
        g.scale(1.25, 0.55, 1);
        g.translate(
          cx + (p - puffs / 2) * s * 0.9,
          cy + (rand() - 0.5) * s * 0.35,
          cz + (rand() - 0.5) * s * 0.5
        );
        cloudGeos.push(g);
      }
    }
    const clouds = new THREE.Mesh(
      mergeGeometries(cloudGeos)!,
      new THREE.MeshBasicMaterial({ color: palette.cloudColor })
    );
    group.add(clouds);
    cloudGeos.forEach((g) => g.dispose());
  }

  // ---------- stars ----------
  if (palette.stars) {
    const nStars = 750;
    const posArr = new Float32Array(nStars * 3);
    const colArr = new Float32Array(nStars * 3);
    const starColors = [0xffffff, 0xcfe8ff, 0xd9c9ff, 0x9ffcff];
    const col = new THREE.Color();
    for (let i = 0; i < nStars; i++) {
      // upper hemisphere
      const u = rand() * Math.PI * 2;
      const v = Math.acos(1 - rand() * 0.92); // bias toward zenith-ish
      const r = 250;
      posArr[i * 3] = r * Math.sin(v) * Math.cos(u);
      posArr[i * 3 + 1] = r * Math.cos(v) * 0.98 + 4;
      posArr[i * 3 + 2] = r * Math.sin(v) * Math.sin(u);
      col.setHex(pick(rand, starColors)).multiplyScalar(0.5 + rand() * 0.5);
      colArr[i * 3] = col.r;
      colArr[i * 3 + 1] = col.g;
      colArr[i * 3 + 2] = col.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 2.0, sizeAttenuation: false, vertexColors: true })
    );
    group.add(stars);
  }

  // ---------- distant skyline ----------
  if (palette.skyline === 'city' || palette.skyline === 'nightcity') {
    const isNight = palette.skyline === 'nightcity';
    const cityGeos: THREE.BufferGeometry[] = [];
    const nB = 52;
    const shade = new THREE.Color();
    for (let i = 0; i < nB; i++) {
      const ang = (i / nB) * Math.PI * 2 + rand() * 0.1;
      const r = 150 + rand() * 60;
      const w = 7 + rand() * 11;
      const h = 5 + rand() * (isNight ? 16 : 18) + (rand() < 0.12 ? 12 : 0);
      const g = new THREE.BoxGeometry(w, h, w);
      g.translate(Math.cos(ang) * r, h / 2 - 1, Math.sin(ang) * r);
      // per-building shade variation so the skyline isn't one flat slab
      shade.setHex(isNight ? 0x1c1540 : 0x7d8fae);
      shade.multiplyScalar(0.75 + rand() * 0.5);
      const cnt = g.attributes.position.count;
      const cols = new Float32Array(cnt * 3);
      for (let k = 0; k < cnt; k++) {
        cols[k * 3] = shade.r;
        cols[k * 3 + 1] = shade.g;
        cols[k * 3 + 2] = shade.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      cityGeos.push(g);
    }
    const city = new THREE.Mesh(
      mergeGeometries(cityGeos)!,
      new THREE.MeshBasicMaterial({ vertexColors: true })
    );
    group.add(city);
    cityGeos.forEach((g) => g.dispose());

    if (isNight) {
      // scattered city lights
      const nL = 500;
      const posArr = new Float32Array(nL * 3);
      const colArr = new Float32Array(nL * 3);
      const col = new THREE.Color();
      const lightColors = [0xa050ff, 0x2ad4c8, 0xff4fa0, 0xffd94f, 0xffffff];
      for (let i = 0; i < nL; i++) {
        const ang = rand() * Math.PI * 2;
        const r = 145 + rand() * 62;
        posArr[i * 3] = Math.cos(ang) * r;
        posArr[i * 3 + 1] = 1 + rand() * 22;
        posArr[i * 3 + 2] = Math.sin(ang) * r;
        col.setHex(pick(rand, lightColors));
        colArr[i * 3] = col.r;
        colArr[i * 3 + 1] = col.g;
        colArr[i * 3 + 2] = col.b;
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      lg.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      group.add(
        new THREE.Points(
          lg,
          new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: false, vertexColors: true })
        )
      );
    } else {
      // big torii gate landmark behind the far end (Shibuya flavor)
      group.add(buildTorii(0xd93a2b, 16, new THREE.Vector3(-30, 0, -135), 0.15));
      group.add(buildTorii(0xd93a2b, 10, new THREE.Vector3(70, 0, -110), -0.4));
    }
  } else if (palette.skyline === 'mesas') {
    const mesaGeos: THREE.BufferGeometry[] = [];
    const nM = 18;
    for (let i = 0; i < nM; i++) {
      const ang = (i / nM) * Math.PI * 2 + rand() * 0.25;
      const r = 155 + rand() * 60;
      const h = 8 + rand() * 15;
      const rad = 9 + rand() * 14;
      const g = new THREE.CylinderGeometry(rad * (0.55 + rand() * 0.25), rad, h, 9);
      g.translate(Math.cos(ang) * r, h / 2 - 1, Math.sin(ang) * r);
      mesaGeos.push(g);
    }
    const mesas = new THREE.Mesh(
      mergeGeometries(mesaGeos)!,
      new THREE.MeshBasicMaterial({ color: 0x35211a })
    );
    group.add(mesas);
    mesaGeos.forEach((g) => g.dispose());

    // lava-glow horizon band
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(200, 200, 7, 40, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff5a1f,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    band.position.y = 2.5;
    group.add(band);
    // a couple of lava cracks glowing on the ground far away
    const crackGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) {
      const ang = rand() * Math.PI * 2;
      const r = 70 + rand() * 60;
      const g = new THREE.BoxGeometry(3 + rand() * 9, 0.3, 1 + rand() * 2);
      g.translate(Math.cos(ang) * r, 0.05, Math.sin(ang) * r);
      crackGeos.push(g);
    }
    group.add(
      new THREE.Mesh(
        mergeGeometries(crackGeos)!,
        new THREE.MeshBasicMaterial({ color: 0xff7a2f })
      )
    );
    crackGeos.forEach((g) => g.dispose());
  } else if (palette.skyline === 'shrine') {
    // forested hills ringing the court
    const hillGeos: THREE.BufferGeometry[] = [];
    const nH = 16;
    for (let i = 0; i < nH; i++) {
      const ang = (i / nH) * Math.PI * 2 + rand() * 0.3;
      const r = 150 + rand() * 55;
      const hr = 26 + rand() * 30;
      const g = new THREE.SphereGeometry(hr, 12, 8);
      g.scale(1.6, 0.42, 1);
      g.translate(Math.cos(ang) * r, -hr * 0.12, Math.sin(ang) * r);
      hillGeos.push(g);
    }
    const hills = new THREE.Mesh(
      mergeGeometries(hillGeos)!,
      new THREE.MeshBasicMaterial({ color: 0x2f6a3a })
    );
    group.add(hills);
    hillGeos.forEach((g) => g.dispose());

    // cherry-blossom trees scattered on the near slopes
    const trunkGeos: THREE.BufferGeometry[] = [];
    const bloomGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const ang = rand() * Math.PI * 2;
      const r = 95 + rand() * 55;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const th = 5 + rand() * 4;
      const t = new THREE.CylinderGeometry(0.7, 1.1, th, 6);
      t.translate(x, th / 2 - 0.5, z);
      trunkGeos.push(t);
      const puffs = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < puffs; p++) {
        const b = new THREE.SphereGeometry(3.2 + rand() * 2.6, 8, 6);
        b.scale(1.25, 0.85, 1.1);
        b.translate(x + (rand() - 0.5) * 4.5, th + rand() * 2.4, z + (rand() - 0.5) * 4.5);
        bloomGeos.push(b);
      }
    }
    group.add(
      new THREE.Mesh(mergeGeometries(trunkGeos)!, new THREE.MeshBasicMaterial({ color: 0x4a3226 }))
    );
    group.add(
      new THREE.Mesh(mergeGeometries(bloomGeos)!, new THREE.MeshBasicMaterial({ color: 0xf2a0b8 }))
    );
    trunkGeos.forEach((g) => g.dispose());
    bloomGeos.forEach((g) => g.dispose());

    // torii gates + a pagoda silhouette (Jujutsu High grounds)
    group.add(buildTorii(0xd93a2b, 15, new THREE.Vector3(-24, 0, -128), 0.12));
    group.add(buildTorii(0xd93a2b, 9, new THREE.Vector3(58, 0, -104), -0.35));
    group.add(buildPagoda(new THREE.Vector3(34, 0, -138), 22, 0.25));
  } else if (palette.skyline === 'dunes') {
    // rolling sand dunes all around
    const duneGeos: THREE.BufferGeometry[] = [];
    const nD = 20;
    for (let i = 0; i < nD; i++) {
      const ang = (i / nD) * Math.PI * 2 + rand() * 0.28;
      const r = 145 + rand() * 60;
      const dr = 24 + rand() * 34;
      const g = new THREE.SphereGeometry(dr, 10, 8);
      g.scale(1.9, 0.3, 1);
      g.rotateY(rand() * Math.PI);
      g.translate(Math.cos(ang) * r, -dr * 0.08, Math.sin(ang) * r);
      duneGeos.push(g);
    }
    const dunes = new THREE.Mesh(
      mergeGeometries(duneGeos)!,
      new THREE.MeshBasicMaterial({ color: 0xcda45e })
    );
    group.add(dunes);
    duneGeos.forEach((g) => g.dispose());

    // distant sandcrawler: rusty wedge on treads
    const crawler = new THREE.Group();
    const rustMat = new THREE.MeshBasicMaterial({ color: 0x8a5230 });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(9, 15, 22, 4, 1), rustMat);
    hull.scale.z = 0.5;
    hull.rotation.y = Math.PI / 4;
    hull.position.y = 12;
    crawler.add(hull);
    const treads = new THREE.Mesh(
      new THREE.BoxGeometry(23, 3.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x4a2e1c })
    );
    treads.position.y = 1.5;
    crawler.add(treads);
    crawler.position.set(-70, 0, -120);
    crawler.rotation.y = 0.5;
    group.add(crawler);

    // moisture vaporators dotting the flats
    const vapGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const ang = rand() * Math.PI * 2;
      const r = 75 + rand() * 55;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const h = 6 + rand() * 4;
      const pole = new THREE.CylinderGeometry(0.35, 0.55, h, 5);
      pole.translate(x, h / 2, z);
      vapGeos.push(pole);
      const fin = new THREE.BoxGeometry(1.6, 0.5, 1.6);
      fin.translate(x, h + 0.2, z);
      vapGeos.push(fin);
    }
    group.add(
      new THREE.Mesh(mergeGeometries(vapGeos)!, new THREE.MeshBasicMaterial({ color: 0xd9cbaa }))
    );
    vapGeos.forEach((g) => g.dispose());
  } else if (palette.skyline === 'domes') {
    // shattered beskar dome cities on the horizon
    const domeMat2 = new THREE.MeshBasicMaterial({ color: 0x5f7d84 });
    const spireGeos: THREE.BufferGeometry[] = [];
    const nDom = 7;
    for (let i = 0; i < nDom; i++) {
      const ang = (i / nDom) * Math.PI * 2 + rand() * 0.4;
      const r = 150 + rand() * 55;
      const dr = 16 + rand() * 22;
      // some domes are cracked open: sweep less than a hemisphere
      const broken = rand() < 0.5;
      const g = new THREE.SphereGeometry(
        dr, 14, 8, rand() * Math.PI * 2, broken ? Math.PI * (1.1 + rand() * 0.5) : Math.PI * 2,
        0, Math.PI / 2
      );
      const dome = new THREE.Mesh(g, domeMat2);
      dome.position.set(Math.cos(ang) * r, -1, Math.sin(ang) * r);
      dome.rotation.y = rand() * Math.PI;
      group.add(dome);
      // spires poking through around each dome
      const nSp = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < nSp; s++) {
        const sh = 10 + rand() * 18;
        const sg = new THREE.CylinderGeometry(0.4, 2.2 + rand() * 1.6, sh, 5);
        sg.translate(
          Math.cos(ang) * r + (rand() - 0.5) * dr * 2.2,
          sh / 2 - 1,
          Math.sin(ang) * r + (rand() - 0.5) * dr * 2.2
        );
        spireGeos.push(sg);
      }
    }
    group.add(
      new THREE.Mesh(mergeGeometries(spireGeos)!, new THREE.MeshBasicMaterial({ color: 0x46606a }))
    );
    spireGeos.forEach((g) => g.dispose());
    // pale mist band hugging the ground
    const mist = new THREE.Mesh(
      new THREE.CylinderGeometry(190, 190, 9, 40, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x9ac9b8,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    mist.position.y = 3;
    group.add(mist);
  } else if (palette.skyline === 'foundry') {
    // industrial mech-works: factories, chimneys, cooling towers
    const bldGeos: THREE.BufferGeometry[] = [];
    const nF = 30;
    for (let i = 0; i < nF; i++) {
      const ang = (i / nF) * Math.PI * 2 + rand() * 0.16;
      const r = 145 + rand() * 60;
      const w = 10 + rand() * 14;
      const h = 6 + rand() * 12;
      const g = new THREE.BoxGeometry(w, h, w * 0.8);
      g.rotateY(rand() * Math.PI);
      g.translate(Math.cos(ang) * r, h / 2 - 1, Math.sin(ang) * r);
      bldGeos.push(g);
    }
    group.add(
      new THREE.Mesh(mergeGeometries(bldGeos)!, new THREE.MeshBasicMaterial({ color: 0x33302e }))
    );
    bldGeos.forEach((g) => g.dispose());

    // chimneys with glowing furnace mouths
    const stackGeos: THREE.BufferGeometry[] = [];
    const mouthGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + rand() * 0.4;
      const r = 140 + rand() * 55;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const h = 16 + rand() * 20;
      const sg = new THREE.CylinderGeometry(1.6 + rand(), 2.6 + rand(), h, 7);
      sg.translate(x, h / 2 - 1, z);
      stackGeos.push(sg);
      const mg = new THREE.CylinderGeometry(1.7 + rand() * 0.8, 1.5, 1.2, 7);
      mg.translate(x, h - 0.6, z);
      mouthGeos.push(mg);
    }
    group.add(
      new THREE.Mesh(mergeGeometries(stackGeos)!, new THREE.MeshBasicMaterial({ color: 0x262422 }))
    );
    group.add(
      new THREE.Mesh(mergeGeometries(mouthGeos)!, new THREE.MeshBasicMaterial({ color: 0xff7a2f }))
    );
    stackGeos.forEach((g) => g.dispose());
    mouthGeos.forEach((g) => g.dispose());

    // molten glow band at the horizon
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(198, 198, 6, 40, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff6a1f,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    glow.position.y = 2;
    group.add(glow);
  }

  return group;
}

function buildPagoda(at: THREE.Vector3, h: number, yaw: number): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x5a3a30 });
  const roofMat = new THREE.MeshBasicMaterial({ color: 0x8a2a22 });
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const f = 1 - i / (tiers + 0.5);
    const y = (i / tiers) * h;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(h * 0.5 * f, h / tiers, h * 0.5 * f),
      bodyMat
    );
    body.position.y = y + h / tiers / 2;
    g.add(body);
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(h * 0.12 * f, h * 0.45 * f, h * 0.1, 4),
      roofMat
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = y + h / tiers + h * 0.03;
    g.add(roof);
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, h * 0.18, 5), roofMat);
  spire.position.y = h + h * 0.12;
  g.add(spire);
  g.position.copy(at);
  g.rotation.y = yaw;
  return g;
}

function buildTorii(
  color: number,
  h: number,
  at: THREE.Vector3,
  yaw: number
): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  const dark = new THREE.MeshBasicMaterial({ color: 0x7a1f16 });
  const pillarGeo = new THREE.CylinderGeometry(h * 0.06, h * 0.075, h, 8);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, mat);
    p.position.set(sx * h * 0.55, h / 2, 0);
    g.add(p);
  }
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(h * 1.55, h * 0.12, h * 0.16),
    mat
  );
  top.position.y = h * 1.02;
  g.add(top);
  const top2 = new THREE.Mesh(
    new THREE.BoxGeometry(h * 1.7, h * 0.09, h * 0.14),
    dark
  );
  top2.position.y = h * 1.12;
  g.add(top2);
  const mid = new THREE.Mesh(
    new THREE.BoxGeometry(h * 1.25, h * 0.09, h * 0.12),
    mat
  );
  mid.position.y = h * 0.74;
  g.add(mid);
  g.position.copy(at);
  g.rotation.y = yaw;
  return g;
}
