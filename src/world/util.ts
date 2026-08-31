import * as THREE from 'three';

/* Shared helpers for the procedural world builders. */

/** Deterministic PRNG (mulberry32) so the stadium builds identically every time. */
export function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
}

/** Chunky cartoon banner texture: rounded-outline bold text on a colored panel. */
export function bannerTexture(
  text: string,
  bg: string,
  fg: string,
  outline: string
): THREE.CanvasTexture {
  const w = 1024;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // panel with border
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, w - 14, h - 14);
  // inner light border for a sticker look
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 92;
  ctx.font = `900 ${size}px 'Arial Black', 'Arial', sans-serif`;
  // shrink to fit
  while (ctx.measureText(text).width > w - 90 && size > 30) {
    size -= 4;
    ctx.font = `900 ${size}px 'Arial Black', 'Arial', sans-serif`;
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(8, size * 0.16);
  ctx.strokeText(text, w / 2, h / 2 + 4);
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Net cloth texture: white top band + dark mesh grid with transparent holes. */
export function netTexture(cellsX: number, cellsY: number): THREE.CanvasTexture {
  const cell = 14;
  const band = 34;
  const w = cellsX * cell;
  const h = cellsY * cell + band;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);

  // mesh grid (dark cords)
  ctx.strokeStyle = '#20242c';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (let x = 0; x <= cellsX; x++) {
    ctx.moveTo(x * cell, band);
    ctx.lineTo(x * cell, h);
  }
  for (let y = 0; y <= cellsY; y++) {
    ctx.moveTo(0, band + y * cell);
    ctx.lineTo(w, band + y * cell);
  }
  ctx.stroke();

  // white cable band on top
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, band);
  ctx.fillStyle = '#c9ced8';
  ctx.fillRect(0, band - 5, w, 5);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Dispose every geometry / material / texture under an object. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as THREE.Mesh).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(mat)) mat.forEach(disposeMaterial);
    else if (mat) disposeMaterial(mat);
  });
}

function disposeMaterial(mat: THREE.Material): void {
  const anyMat = mat as unknown as Record<string, unknown>;
  for (const key of ['map', 'emissiveMap', 'alphaMap']) {
    const tex = anyMat[key];
    if (tex && tex instanceof THREE.Texture) tex.dispose();
  }
  mat.dispose();
}
