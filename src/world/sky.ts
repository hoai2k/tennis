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
  }

  return group;
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
