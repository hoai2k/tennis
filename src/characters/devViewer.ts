/* Dev-only character viewer (charviewer.html). Not part of the game build.
 * Query params:
 *   ?id=yuji            character
 *   ?rig=1              humanoid *_rig.glb variant (Mech Mayhem models)
 *   ?portrait=1         512x512 transparent portrait framing
 *   ?yaw=35&pitch=12&dist=3.4&ty=1  camera (degrees / meters)
 *   ?axes=1             skeleton helper
 * Playwright API:
 *   await window.avatarReady
 *   window.drive(action, sampleTime) — deterministic: settles in ready,
 *     runs the action, advances exactly sampleTime seconds, renders once.
 *     actions: rest | neutral | idle | ready | run:speed:dx:dz | charge:side |
 *              swing:side:kind:power | chargeswing:side:kind:power |
 *              serveToss | serveHit:power | victory | defeat
 *   window.resume() — back to realtime
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { characterById, modelUrl } from '../core/roster';
import { loadAvatar } from './index';
import type { Avatar, ShotKind, SwingSide } from '../core/types';

const params = new URLSearchParams(location.search);
const charId = params.get('id') ?? 'yuji';
const portrait = params.get('portrait') === '1';
/** ?rig=1 — view the humanoid *_rig.glb variant of a Mech Mayhem model */
const humanoidRig = params.get('rig') === '1';

const width = portrait ? 512 : Math.min(innerWidth, 1200);
const height = portrait ? 512 : Math.min(innerHeight, 800);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(width, height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
document.getElementById('view')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
if (!portrait) scene.background = new THREE.Color(0x20242e);

const camera = new THREE.PerspectiveCamera(portrait ? 32 : 40, width / height, 0.05, 100);

// ---- lights ----
const hemi = new THREE.HemisphereLight(0xcfd8ff, 0x39424e, portrait ? 1.0 : 1.15);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, portrait ? 2.4 : 1.9);
key.position.set(2.5, 4.5, 3.5);
key.castShadow = !portrait;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -1;
scene.add(key);
if (portrait) {
  const fill = new THREE.DirectionalLight(0xaac4ff, 1.0);
  fill.position.set(-3, 1.5, 2.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(-1, 3, -3.5);
  scene.add(rim);
}

// ---- ground ----
if (!portrait) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x3a5f43, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(30, 30, 0x777777, 0x4a6a52);
  grid.position.y = 0.001;
  scene.add(grid);
  // 1m reference posts + net-height marker
  const postMat = new THREE.MeshBasicMaterial({ color: 0xcccc44 });
  for (const [px, h] of [[-1.5, 1.0], [1.5, 0.95]] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.03), postMat);
    post.position.set(px, h / 2, 0);
    scene.add(post);
  }
  scene.add(new THREE.AxesHelper(0.5));
}

// ---- camera framing ----
const heightGuess = (() => {
  try {
    return characterById(charId).height;
  } catch {
    return 1.75;
  }
})();
// portrait: heroic 3/4 view, slightly low camera looking up, head+torso framing
const yaw = THREE.MathUtils.degToRad(parseFloat(params.get('yaw') ?? (portrait ? '32' : '25')));
const pitch = THREE.MathUtils.degToRad(parseFloat(params.get('pitch') ?? (portrait ? '10' : '8')));
const dist = parseFloat(params.get('dist') ?? (portrait ? String(heightGuess * 1.32) : '4.2'));
const targetY = parseFloat(params.get('ty') ?? (portrait ? String(heightGuess * 0.62) : '0.95'));
camera.position.set(
  Math.sin(yaw) * Math.cos(pitch) * dist,
  targetY + Math.sin(-pitch) * dist,
  Math.cos(yaw) * Math.cos(pitch) * dist,
);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, targetY, 0);
controls.update();

// ---- avatar ----
let avatar: Avatar | null = null;
let frozen = false;
const clock = new THREE.Clock();
const info = document.getElementById('info');

const ready = (async () => {
  const base = characterById(charId);
  const def = { ...base, model: modelUrl(base, humanoidRig) };
  const av = await loadAvatar(def);
  avatar = av;
  scene.add(av.root);
  if (params.get('axes') === '1') {
    const skel = new THREE.SkeletonHelper(av.root);
    scene.add(skel);
  }
  av.playReady();
  // settle into pose for first paint
  step(0.6, 1 / 60);
  renderer.render(scene, camera);
  return av;
})();

(window as any).avatarReady = ready;

function step(total: number, dt: number): void {
  if (!avatar) return;
  let t = 0;
  while (t < total - 1e-9) {
    const d = Math.min(dt, total - t);
    avatar.update(d);
    t += d;
  }
}

function runAction(action: string): void {
  if (!avatar) return;
  const av = avatar;
  const parts = action.split(':');
  switch (parts[0]) {
    case 'rest':
    case 'neutral': {
      // raw canonical neutral: apply via internal rig
      const anyAv = av as any;
      av.playReady();
      anyAv.rig?.applyNeutral?.();
      frozen = true;
      renderer.render(scene, camera);
      return;
    }
    case 'idle': (av as any).debugAnimator?.playIdle?.(); break;
    case 'ready': av.playReady(); break;
    case 'run': av.setMovement(parseFloat(parts[1] ?? '6'), parseFloat(parts[2] ?? '0'), parseFloat(parts[3] ?? '1')); break;
    case 'charge': av.startCharge((parts[1] ?? 'fore') as SwingSide); break;
    case 'swing': av.swing({ side: (parts[1] ?? 'fore') as SwingSide, kind: (parts[2] ?? 'topspin') as ShotKind, power: parseFloat(parts[3] ?? '0.7') }); break;
    case 'chargeswing':
      av.startCharge((parts[1] ?? 'fore') as SwingSide);
      step(0.7, 1 / 120);
      av.swing({ side: (parts[1] ?? 'fore') as SwingSide, kind: (parts[2] ?? 'topspin') as ShotKind, power: parseFloat(parts[3] ?? '0.9') });
      break;
    case 'serveToss': av.serveToss(); break;
    case 'serveHit': av.serveToss(); step(1.4, 1 / 120); av.serveHit(parseFloat(parts[1] ?? '0.9')); break;
    case 'victory': av.playVictory(); break;
    case 'defeat': av.playDefeat(); break;
    case 'glow': av.setGlow(parseFloat(parts[1] ?? '1')); break;
    case 'stop': av.setMovement(0, 0, 1); break;
  }
}

function fmtRacquet(): string {
  if (!avatar) return '';
  const v = new THREE.Vector3();
  avatar.getRacquetPos(v);
  return `racquet head: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}) swinging=${avatar.isSwinging()}`;
}

(window as any).drive = (action: string, sampleTime = 0) => {
  if (!avatar) return null;
  frozen = true;
  // settle in ready first for deterministic starts (unless raw rest requested)
  if (action !== 'rest' && action !== 'neutral') {
    avatar.playReady();
    step(1.2, 1 / 120);
    runAction(action);
    if (sampleTime > 0) step(sampleTime, 1 / 240);
  } else {
    runAction(action);
  }
  renderer.render(scene, camera);
  const v = new THREE.Vector3();
  avatar.getRacquetPos(v);
  if (info) info.textContent = `${charId} · ${action} @ ${sampleTime}s · ${fmtRacquet()}`;
  return { racquet: v.toArray(), swinging: avatar.isSwinging() };
};

(window as any).resume = () => {
  frozen = false;
  clock.getDelta();
};

(window as any).shot = () => renderer.render(scene, camera);

// ---- interactive UI ----
if (!portrait) {
  const bar = document.getElementById('buttons')!;
  const actions = [
    'rest', 'ready', 'idle',
    'run:3:0:1', 'run:7:0:1', 'run:7:1:0', 'run:7:-1:0', 'run:6:0:-1', 'stop',
    'charge:fore', 'charge:back', 'charge:overhead',
    'swing:fore:topspin:0.7', 'swing:fore:slice:0.7', 'swing:fore:flat:1', 'swing:back:topspin:0.7',
    'swing:back:slice:0.7', 'swing:overhead:smash:1', 'swing:fore:lob:0.6', 'swing:fore:drop:0.4',
    'swing:fore:star:1', 'serveToss', 'serveHit:1', 'victory', 'defeat', 'glow:1', 'glow:0',
  ];
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a;
    b.onclick = () => {
      frozen = false;
      runAction(a);
    };
    bar.appendChild(b);
  }
}

function loop(): void {
  requestAnimationFrame(loop);
  const dt = clock.getDelta();
  if (!frozen && avatar) {
    avatar.update(dt);
    if (info && !portrait) info.textContent = `${charId} · ${fmtRacquet()}`;
  }
  controls.update();
  if (!frozen) renderer.render(scene, camera);
}
loop();
