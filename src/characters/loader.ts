import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { CharacterDef } from '../core/types';

/* ============================================================
 * GLB loading + normalization.
 * All models are Tripo-generated, gltfpack-compressed (meshopt).
 * Rest-pose findings:
 *  - models stand ~1 unit tall and face +Z already (toes point +Z)
 *  - rest poses VARY per model (T-pose, A-pose, even mid-stride);
 *    rig.ts canonicalizes them to one shared neutral stance.
 * ============================================================ */

let loader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

export interface LoadedModel {
  /** identity-transform root; game owns its position/rotation.y */
  root: THREE.Group;
  /** inner container carrying normalization scale/offset/facing */
  container: THREE.Group;
  gltf: GLTF;
  meshes: THREE.Mesh[];
  materials: THREE.MeshStandardMaterial[];
  /** uniform scale applied (meters per model unit) */
  scale: number;
}

/** raw models face +Z (verified: toe bones point +Z); no facing fix needed */
export const MODELS_FACE_NEG_Z = false;

export async function loadModel(
  def: CharacterDef,
  onProgress?: (fraction: number) => void,
): Promise<LoadedModel> {
  const gltf = await getLoader().loadAsync(def.model, (e) => {
    if (onProgress && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
  });

  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // ---- measure raw bounds (rest pose == bind pose, so geometry bbox is valid) ----
  const bbox = new THREE.Box3().setFromObject(scene);
  const size = bbox.getSize(new THREE.Vector3());
  const rawHeight = Math.max(1e-6, size.y);
  const scale = def.height / rawHeight;
  const center = bbox.getCenter(new THREE.Vector3());

  const container = new THREE.Group();
  container.name = 'avatar-container';
  container.add(scene);
  container.scale.setScalar(scale);
  if (MODELS_FACE_NEG_Z) container.rotation.y = Math.PI;
  // feet on the floor, centered on x/z
  const rotSign = MODELS_FACE_NEG_Z ? -1 : 1;
  container.position.set(rotSign * -center.x * scale, -bbox.min.y * scale, rotSign * -center.z * scale);

  const root = new THREE.Group();
  root.name = `avatar-${def.id}`;
  root.add(container);

  // ---- meshes & materials ----
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      // animated skins move outside the bind-pose bounds; avoid pop-out culling
      mesh.frustumCulled = false;
      meshes.push(mesh);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial) {
          // Tripo PBR often reads flat/dark — brighten & de-metal a touch
          std.metalness = Math.min(std.metalness, 0.35);
          std.roughness = Math.min(1, Math.max(0.45, std.roughness));
          std.envMapIntensity = 1;
          if (!materials.includes(std)) materials.push(std);
        }
      }
    }
  });

  return { root, container, gltf, meshes, materials, scale };
}
