import * as THREE from 'three';
import type { CourtTheme } from '../core/types';
import { createStadium, themeDefs } from './stadium';

/* Dev-only viewer for the stadium (worldviewer.html).
 *   ?theme=<id>   pick theme (any id from themeDefs())
 *   ?ex=0..1      crowd excitement
 * Keys: c = cheer, b = BIG cheer (confetti), 1..9 = switch theme.
 * Drag to orbit, wheel to zoom. */

const THEME_IDS = themeDefs().map((t) => t.id);
const params = new URLSearchParams(location.search);
const themeParam = params.get('theme') ?? 'shibuya';
const theme: CourtTheme = THEME_IDS.includes(themeParam as CourtTheme)
  ? (themeParam as CourtTheme)
  : 'shibuya';
const excitement = Math.min(1, Math.max(0, parseFloat(params.get('ex') ?? '0.4')));
const density = (params.get('crowd') === 'light' ? 'light' : 'full') as 'full' | 'light';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  52,
  window.innerWidth / window.innerHeight,
  0.3,
  700
);

const t0 = performance.now();
const stadium = createStadium(theme, density);
scene.add(stadium.group);
const buildMs = performance.now() - t0;
console.log(`[worldviewer] built '${theme}' in ${buildMs.toFixed(1)}ms`);
console.log('[worldviewer] themes:', themeDefs());

// gameplay-ish orbit: behind the near baseline, elevated
let yaw = 0;
let pitch = 0.42;
let dist = 27;
const target = new THREE.Vector3(0, 1, -1.5);

function placeCamera() {
  camera.position.set(
    target.x + dist * Math.sin(yaw) * Math.cos(pitch),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(yaw) * Math.cos(pitch)
  );
  camera.lookAt(target);
}
placeCamera();

let dragging = false;
let lastX = 0;
let lastY = 0;
window.addEventListener('mousedown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener('mouseup', () => (dragging = false));
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.005;
  pitch = Math.min(1.35, Math.max(0.05, pitch + (e.clientY - lastY) * 0.004));
  lastX = e.clientX;
  lastY = e.clientY;
  placeCamera();
});
window.addEventListener('wheel', (e) => {
  dist = Math.min(120, Math.max(6, dist + e.deltaY * 0.03));
  placeCamera();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'c') stadium.cheer(false);
  if (e.key === 'b') stadium.cheer(true);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= THEME_IDS.length) location.search = `?theme=${THEME_IDS[n - 1]}`;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// tiny help overlay
const help = document.createElement('div');
help.style.cssText =
  'position:fixed;left:10px;bottom:10px;color:#fff;font:12px monospace;' +
  'background:rgba(0,0,0,.45);padding:6px 10px;border-radius:6px;z-index:10';
help.textContent = `theme=${theme} | drag=orbit wheel=zoom | c=cheer b=BIG cheer | 1-${THEME_IDS.length} switch theme`;
document.body.appendChild(help);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  stadium.update(dt, excitement);
  renderer.render(scene, camera);
});

// hooks for the screenshot script
(window as unknown as Record<string, unknown>).__stadium = stadium;
(window as unknown as Record<string, unknown>).__buildMs = buildMs;
(window as unknown as Record<string, unknown>).__renderer = renderer;
(window as unknown as Record<string, unknown>).__scene = scene;
(window as unknown as Record<string, unknown>).__THREE = THREE;
(window as unknown as Record<string, unknown>).__camera = camera;
