import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LayoutBox, OfficeLayout } from '@office/protocol';
import { FURNITURE, MODEL_YAW } from './furnitureManifest';
import { containScale, fitScale } from './fit';
import { FurnitureLift, type LiftResult } from './furnitureLift';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

function load(file: string): Promise<THREE.Group> {
  let promise = cache.get(file);
  if (!promise) {
    // A bare file name is a furniture model; `food/mug.glb` style paths name another pack
    // folder under /assets (T-1158), which keeps relative texture paths working.
    const url = file.includes('/') ? `/assets/${file}` : `/assets/furniture/${file}`;
    promise = loader.loadAsync(url).then((gltf) => gltf.scene);
    cache.set(file, promise);
  }
  return promise;
}

/**
 * Layout boxes smaller than this volume (m³) only receive shadows (T-1148, plan §3.1). Every
 * furniture item in the current layout is larger (the potted plants, 0.11 m³, are the
 * smallest), so only desk props and small details added later stop casting.
 */
export const SHADOW_MIN_VOLUME = 0.05;

export function castsShadow(box: LayoutBox): boolean {
  return box.size[0] * box.size[1] * box.size[2] >= SHADOW_MIN_VOLUME;
}

/**
 * One model drawn at one layout box. Placements that share a file are instanced together.
 * A placement replaces the palette box of the same id; a `standalone` one (desk props, T-1152)
 * has no palette box and is simply added.
 */
export type FurniturePlacement = {
  box: LayoutBox;
  file: string;
  rotY: number;
  standalone?: boolean;
  /** Layout item whose palette box this placement removes (T-1158 pantry). */
  replaces?: string;
  /** Keep the model's proportions inside the box instead of stretching to it (small props). */
  contain?: boolean;
};

/** Layout rotY plus the model's yaw correction (`MODEL_YAW`, T-1609), in [0, 360). */
export function modelRotY(file: string, layoutRotY = 0): number {
  return (((layoutRotY + (MODEL_YAW[file] ?? 0)) % 360) + 360) % 360;
}

/** Layout items that have a model in the manifest. Later desk props add their own placements. */
export function furniturePlacements(layout: OfficeLayout): FurniturePlacement[] {
  return layout.items.flatMap((box) => {
    const file = FURNITURE[box.type];
    return file ? [{ box, file, rotY: modelRotY(file, box.rotY) }] : [];
  });
}

/**
 * Rotate by rotY, then scale on world axes so the bounding box equals the layout extents, or
 * with `contain` one uniform scale that keeps the model inside them (centred, on the bottom).
 */
export function fitModel(
  source: THREE.Object3D,
  box: LayoutBox,
  rotY: number,
  contain = false,
): THREE.Group {
  const model = source.clone(true);
  model.rotation.y = (rotY * Math.PI) / 180;
  const rotated = new THREE.Group();
  rotated.add(model);
  rotated.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(rotated);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  const wrapper = new THREE.Group();
  wrapper.add(rotated);
  wrapper.scale.set(...(contain ? containScale : fitScale)([size.x, size.y, size.z], box.size));
  wrapper.position.set(box.position[0], box.position[1] - box.size[1] / 2, box.position[2]);
  wrapper.name = box.id;
  wrapper.userData.occluder = true;
  const cast = castsShadow(box);
  wrapper.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      object.castShadow = cast;
      object.receiveShadow = true;
      object.userData.occluder = true;
    }
  });
  return wrapper;
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  return meshes;
}

/**
 * The instancing vertex shader corrects normals by the column lengths of the instance
 * matrix, which is exact only without shear. Fitted Kenney models (90° rotations, axis
 * scale) always qualify; anything else keeps per-item meshes so lighting stays identical.
 */
function shearFree(matrix: THREE.Matrix4): boolean {
  const e = matrix.elements;
  const x = new THREE.Vector3(e[0], e[1], e[2]);
  const y = new THREE.Vector3(e[4], e[5], e[6]);
  const z = new THREE.Vector3(e[8], e[9], e[10]);
  const tolerance = 1e-6;
  return (
    Math.abs(x.dot(y)) <= tolerance * x.length() * y.length() &&
    Math.abs(y.dot(z)) <= tolerance * y.length() * z.length() &&
    Math.abs(z.dot(x)) <= tolerance * z.length() * x.length()
  );
}

/**
 * Draws placements of one model with one `InstancedMesh` per source mesh (geometry +
 * material), so N copies cost one draw call per part instead of N (plan §3.1). The instance
 * matrices are the world matrices `fitModel` gives each copy, so the result looks the same.
 * Returns undefined when instancing would not be exact; the caller then adds fitted groups.
 */
export function instanceModel(
  source: THREE.Object3D,
  placements: FurniturePlacement[],
): THREE.InstancedMesh[] | undefined {
  const fitted = placements.map((p) => {
    const wrapper = fitModel(source, p.box, p.rotY, p.contain);
    wrapper.updateMatrixWorld(true);
    return meshesOf(wrapper);
  });
  const parts = fitted[0] ?? [];
  if (!fitted.every((meshes) => meshes.every((mesh) => shearFree(mesh.matrixWorld)))) {
    return undefined;
  }
  const ids = placements.map((p) => p.box.id);
  return parts.map((part, k) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, placements.length);
    fitted.forEach((meshes, i) => mesh.setMatrixAt(i, meshes[k]!.matrixWorld));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.name = `${part.name || 'mesh'}@instanced`;
    mesh.castShadow = part.castShadow;
    mesh.receiveShadow = true;
    mesh.userData.occluder = true;
    /** Layout item id per instance index (camera occlusion, later highlights). */
    mesh.userData.instanceIds = ids;
    return mesh;
  });
}

export type FurnitureSummary = {
  /** Layout items drawn with a model. */
  loaded: number;
  /** Layout item ids whose model failed to load (they keep their palette box). */
  failed: string[];
  /** InstancedMesh objects in the room, one per repeated model part. */
  instancedMeshes: number;
  /**
   * Per model file: placements drawn, meshes added to the room and parts (meshes) in the
   * source model. `meshes === parts` means repeats cost no extra draw call (T-1152).
   */
  models: Record<string, { placements: number; meshes: number; parts: number }>;
};

export type FurnitureHandle = FurnitureSummary & {
  /**
   * T-1156: the item's own object (highlight, door swing); an instanced item is lifted out
   * of its `InstancedMesh` parts until `drop`. Undefined for an id with no model.
   */
  lift(id: string): LiftResult | undefined;
  /** Puts a lifted item back into its instances; returns the meshes that left the scene. */
  drop(id: string): THREE.Mesh[];
  /** Removes the models from the room and releases the instance buffers. */
  dispose(): void;
};

export async function loadFurniture(
  room: THREE.Group,
  layout: OfficeLayout,
  placements: FurniturePlacement[] = furniturePlacements(layout),
): Promise<FurnitureHandle> {
  const failed: string[] = [];
  const added: THREE.Object3D[] = [];
  const models: FurnitureSummary['models'] = {};
  let loaded = 0;
  const lift = new FurnitureLift(room, fitModel);
  // One batch per model file and shadow flag: an InstancedMesh casts for all its instances.
  const batches = new Map<string, FurniturePlacement[]>();
  for (const placement of placements) {
    const key = `${placement.file}|${castsShadow(placement.box)}`;
    batches.set(key, [...(batches.get(key) ?? []), placement]);
  }
  await Promise.all(
    [...batches.values()].map(async (batch) => {
      const present = batch.filter((p) => p.standalone || room.getObjectByName(p.box.id));
      if (present.length === 0) return;
      let source: THREE.Group;
      try {
        source = await load(batch[0]!.file);
      } catch {
        failed.push(...present.map((p) => p.box.id));
        return;
      }
      const instanced = present.length > 1 ? instanceModel(source, present) : undefined;
      const objects = instanced ?? present.map((p) => fitModel(source, p.box, p.rotY, p.contain));
      for (const p of present) {
        const box = p.standalone ? undefined : room.getObjectByName(p.box.id);
        if (box) room.remove(box);
        const replaced = p.replaces ? room.getObjectByName(p.replaces) : undefined;
        if (replaced) room.remove(replaced);
      }
      if (instanced) lift.registerInstances(source, present, instanced);
      else objects.forEach((object, i) => lift.registerObject(present[i]!.box.id, object));
      for (const object of objects) room.add(object);
      added.push(...objects);
      loaded += present.length;
      const file = batch[0]!.file;
      const entry = (models[file] ??= { placements: 0, meshes: 0, parts: meshesOf(source).length });
      entry.placements += present.length;
      entry.meshes += objects.reduce((n, o) => n + meshesOf(o).length, 0);
    }),
  );
  return {
    loaded,
    failed,
    instancedMeshes: added.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh).length,
    models,
    lift: (id) => lift.lift(id),
    drop: (id) => lift.drop(id),
    dispose() {
      lift.dispose();
      for (const object of added) {
        object.removeFromParent();
        // Geometry and materials belong to the cached GLB scene and are reused by later games.
        if ((object as THREE.InstancedMesh).isInstancedMesh) {
          (object as THREE.InstancedMesh).dispose();
        }
      }
      added.length = 0;
    },
  };
}
