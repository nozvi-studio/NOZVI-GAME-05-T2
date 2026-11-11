import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { officeLayout } from '@office/protocol';
import { fitScale } from '../src/game/assets/fit';
import { fitModel, loadFurniture } from '../src/game/assets/loadFurniture';
import { buildRoom } from '../src/game/room';

afterEach(() => vi.restoreAllMocks());

it('scales each world axis to the target extent', () => {
  expect(fitScale([2, 1, 4], [1, 1, 1])).toEqual([0.5, 1, 0.25]);
});

it('guards zero-size axes', () => {
  expect(fitScale([0, 1, 1], [1, 2, 1])).toEqual([1, 2, 1]);
});

it('fits rotated, offset geometry to layout bounds without modifying the cached source', () => {
  const source = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4));
  mesh.position.set(3, 2, -1);
  source.add(mesh);
  const fitted = fitModel(
    source,
    { id: 'desk', type: 'desk', position: [5, 2, 6], size: [3, 2, 1] },
    37,
  );
  const bounds = new THREE.Box3().setFromObject(fitted);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  [size.x, size.y, size.z].forEach((value, i) => expect(value).toBeCloseTo([3, 2, 1][i]!));
  [center.x, center.y, center.z].forEach((value, i) => expect(value).toBeCloseTo([5, 2, 6][i]!));
  expect(fitted.name).toBe('desk');
  expect(fitted.userData.occluder).toBe(true);
  const clone = fitted.children[0]!.children[0]!.children[0] as THREE.Mesh;
  expect(clone.castShadow && clone.receiveShadow && clone.userData.occluder).toBe(true);
  expect(clone.geometry).toBe(mesh.geometry);
  expect(clone.material).toBe(mesh.material);
  expect(mesh.position.toArray()).toEqual([3, 2, -1]);
  expect(source.rotation.y).toBe(0);
  expect(mesh.castShadow).toBe(false);
});

it('shares cached loads, uses item rotation, and keeps boxes for failed or unmapped assets', async () => {
  const source = new THREE.Group();
  source.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4)));
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async (url) => {
    if (url.endsWith('kitchenFridge.glb')) throw new Error('Missing asset');
    return { scene: source } as GLTF;
  });
  const layout = {
    ...officeLayout,
    items: [
      { id: 'desk_a', type: 'desk', position: [0, 1, 0], size: [2, 2, 1], rotY: 90 },
      { id: 'desk_b', type: 'desk', position: [3, 1, 0], size: [2, 2, 1] },
      { id: 'fridge', type: 'fridge', position: [0, 1, 3], size: [1, 2, 1] },
      { id: 'door', type: 'main_door', position: [3, 1, 3], size: [1, 2, 1] },
    ].map((item) => ({
      ...item,
      position: item.position as [number, number, number],
      size: item.size as [number, number, number],
    })),
  };
  const room = buildRoom(layout);
  const fridge = room.getObjectByName('fridge');
  const door = room.getObjectByName('door');
  const result = await loadFurniture(room, layout);
  expect(result).toEqual({ loaded: 2, failed: ['fridge'] });
  expect(load).toHaveBeenCalledTimes(2);
  expect(room.getObjectByName('fridge')).toBe(fridge);
  expect(room.getObjectByName('door')).toBe(door);
  const desk = room.getObjectByName('desk_a')!;
  expect(desk).toBeInstanceOf(THREE.Group);
  expect(desk.children[0]!.children[0]!.rotation.y).toBeCloseTo(Math.PI / 2);
  expect(room.getObjectByName('desk_b')!.children[0]!.children[0]!.rotation.y).toBe(0);
});
