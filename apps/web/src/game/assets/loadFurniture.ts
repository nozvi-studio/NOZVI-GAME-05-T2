import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LayoutBox, OfficeLayout } from '@office/protocol';
import { FURNITURE } from './furnitureManifest';
import { fitScale } from './fit';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

function load(file: string): Promise<THREE.Group> {
  let promise = cache.get(file);
  if (!promise) {
    promise = loader.loadAsync(`/assets/furniture/${file}`).then((gltf) => gltf.scene);
    cache.set(file, promise);
  }
  return promise;
}

/** Rotate by rotY, then scale on world axes so the bounding box equals the layout extents. */
export function fitModel(source: THREE.Object3D, box: LayoutBox, rotY: number): THREE.Group {
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
  wrapper.scale.set(...fitScale([size.x, size.y, size.z], box.size));
  wrapper.position.set(box.position[0], box.position[1] - box.size[1] / 2, box.position[2]);
  wrapper.name = box.id;
  wrapper.userData.occluder = true;
  wrapper.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.userData.occluder = true;
    }
  });
  return wrapper;
}

export async function loadFurniture(
  room: THREE.Group,
  layout: OfficeLayout,
): Promise<{ loaded: number; failed: string[] }> {
  const failed: string[] = [];
  let loaded = 0;
  await Promise.all(
    layout.items.map(async (item) => {
      const file = FURNITURE[item.type];
      if (!file) return;
      try {
        const source = await load(file);
        const box = room.getObjectByName(item.id);
        if (!box) return;
        const model = fitModel(source, item, item.rotY ?? 0);
        room.remove(box);
        room.add(model);
        loaded++;
      } catch {
        failed.push(item.id);
      }
    }),
  );
  return { loaded, failed };
}
