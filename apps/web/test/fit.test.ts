import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { officeLayout } from '@office/protocol';
import { containScale, fitScale } from '../src/game/assets/fit';
import { fitModel, loadFurniture } from '../src/game/assets/loadFurniture';
import { buildRoom } from '../src/game/room';

afterEach(() => vi.restoreAllMocks());

it('scales each world axis to the target extent', () => {
  expect(fitScale([2, 1, 4], [1, 1, 1])).toEqual([0.5, 1, 0.25]);
});

it('contain keeps proportions: one scale, the largest that fits every axis', () => {
  expect(containScale([2, 1, 4], [1, 1, 1])).toEqual([0.25, 0.25, 0.25]);
  expect(containScale([0.085, 0.03, 0.05], [0.08, 0.04, 0.1])[0]).toBeCloseTo(0.08 / 0.085, 9);
  expect(containScale([0, 0, 0], [1, 1, 1])).toEqual([1, 1, 1]);
});

it('fitModel with contain scales uniformly and stays inside the box, on its bottom', () => {
  const source = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.05));
  const box = {
    id: 'm',
    type: 'mouse',
    position: [1, 0.77, 2] as [number, number, number],
    size: [0.08, 0.04, 0.1] as [number, number, number],
  };
  const fitted = fitModel(source, box, 0, true);
  fitted.updateMatrixWorld(true);
  const s = fitted.scale;
  expect(s.x).toBeCloseTo(s.y, 9);
  expect(s.x).toBeCloseTo(s.z, 9);
  const b = new THREE.Box3().setFromObject(fitted);
  const size = b.getSize(new THREE.Vector3());
  // Width and depth keep the model's 0.085 : 0.05 ratio instead of the box's 0.08 : 0.1.
  expect(size.x / size.z).toBeCloseTo(0.085 / 0.05, 6);
  expect(size.x).toBeLessThanOrEqual(0.08 + 1e-9);
  expect(size.z).toBeLessThanOrEqual(0.1 + 1e-9);
  expect(b.min.y).toBeCloseTo(0.75, 9);
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
      { id: 'door', type: 'breaker_box', position: [3, 1, 3], size: [1, 2, 1] },
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
  expect(result).toMatchObject({ loaded: 2, failed: ['fridge'], instancedMeshes: 1 });
  expect(load).toHaveBeenCalledTimes(2);
  expect(room.getObjectByName('fridge')).toBe(fridge);
  expect(room.getObjectByName('door')).toBe(door);
  // Both desks use one model: a single InstancedMesh replaces their two boxes.
  expect(room.getObjectByName('desk_a')).toBeUndefined();
  expect(room.getObjectByName('desk_b')).toBeUndefined();
  const instanced = room.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh);
  expect(instanced).toHaveLength(1);
  const mesh = instanced[0] as THREE.InstancedMesh;
  expect(mesh.count).toBe(2);
  expect(mesh.userData.instanceIds).toEqual(['desk_a', 'desk_b']);
  // The model's +Z front after rotation: layout rotY plus the desk's 180-degree MODEL_YAW (T-1609).
  const front = (index: number) => {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return new THREE.Vector3(0, 0, 1).transformDirection(matrix);
  };
  const expectFront = (index: number, degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    const f = front(index);
    expect(f.x).toBeCloseTo(Math.sin(a));
    expect(f.y).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(Math.cos(a));
  };
  expectFront(0, 90 + 180);
  expectFront(1, 0 + 180);
  const disposed = vi.fn();
  mesh.addEventListener('dispose', disposed);
  result.dispose();
  expect(disposed).toHaveBeenCalledTimes(1);
  expect(mesh.parent).toBeNull();
  expect(room.children).not.toContain(mesh);
});
