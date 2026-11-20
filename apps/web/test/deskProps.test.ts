import { existsSync, readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { officeLayout } from '@office/protocol';
import { DESK_PROP_TYPES, deskProps } from '../src/game/assets/deskProps';
import {
  castsShadow,
  fitModel,
  furniturePlacements,
  loadFurniture,
} from '../src/game/assets/loadFurniture';

afterEach(() => vi.restoreAllMocks());

const desks = officeLayout.items.filter((i) => i.type === 'desk');

it('T-1152: all eight desks resolve the six prop types to a model and a fitted box', () => {
  const props = deskProps(officeLayout);
  expect(desks).toHaveLength(8);
  expect(props).toHaveLength(8 * DESK_PROP_TYPES.length);
  for (const desk of desks) {
    const own = props.filter((p) => p.deskId === desk.id);
    expect(own.map((p) => p.type).sort()).toEqual([...DESK_PROP_TYPES].sort());
    for (const p of own) {
      const component = desk.components!.find((c) => c.id === p.placement.box.id)!;
      // The transform comes from the layout component: same position and size.
      expect(p.placement.box).toBe(component);
      expect(p.placement.standalone).toBe(true);
      expect(Number.isFinite(p.placement.rotY)).toBe(true);
      // Every model file exists in the served assets.
      expect(
        existsSync(new URL(`../public/assets/furniture/${p.placement.file}`, import.meta.url)),
      ).toBe(true);
      // Desk props are small: they receive but do not cast shadows.
      expect(castsShadow(p.placement.box)).toBe(false);
    }
  }
});

it('T-1152: decoration and stationery vary by desk index and are deterministic', () => {
  const a = deskProps(officeLayout);
  const b = deskProps(officeLayout);
  expect(a.map((p) => [p.placement.file, p.placement.rotY])).toEqual(
    b.map((p) => [p.placement.file, p.placement.rotY]),
  );
  const decor = a.filter((p) => p.type === 'decorative_object').map((p) => p.placement.file);
  expect(new Set(decor).size).toBeGreaterThan(1);
  expect(decor[0]).not.toBe(decor[1]);
  const stationery = a.filter((p) => p.type === 'stationery').map((p) => p.placement.rotY);
  expect(stationery[0]).not.toBe(stationery[1]);
});

it('T-1152: standalone props load without a palette box and repeats share one mesh per part', async () => {
  // Every model is a two-part stand-in, so the test needs no GLB parsing.
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async () => {
    const scene = new THREE.Group();
    scene.add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()),
      new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial()),
    );
    return { scene } as never;
  });
  const room = new THREE.Group();
  const props = deskProps(officeLayout);
  const handle = await loadFurniture(
    room,
    officeLayout,
    props.map((p) => p.placement),
  );
  expect(handle.failed).toEqual([]);
  expect(handle.loaded).toBe(props.length);
  for (const [file, model] of Object.entries(handle.models)) {
    // One mesh per source part whatever the number of placements.
    expect(model.meshes, file).toBe(model.parts);
  }
  expect(handle.models['computerKeyboard.glb']?.placements).toBe(8);
  handle.dispose();
  expect(room.children).toHaveLength(0);
});

it('owner report 2026-11-18: screen, keyboard and mouse face the chair of their desk', () => {
  for (const ws of officeLayout.workstations) {
    const own = deskProps(officeLayout).filter((p) => p.deskId === `${ws.id}_desk`);
    for (const p of own.filter((q) => ['computer', 'keyboard', 'mouse'].includes(q.type))) {
      // Kenney models face +Z at rotY 0; rotate that front and compare with the way to the seat.
      const a = (p.placement.rotY * Math.PI) / 180;
      const front = { x: Math.sin(a), z: Math.cos(a) };
      const toSeat = {
        x: ws.seat.position[0] - p.placement.box.position[0],
        z: ws.seat.position[2] - p.placement.box.position[2],
      };
      expect(front.x * toSeat.x + front.z * toSeat.z, `${p.placement.box.id}`).toBeGreaterThan(0);
    }
  }
});

const loadDesk = () =>
  new Promise<THREE.Group>((resolve, reject) => {
    const bytes = readFileSync(new URL('../public/assets/furniture/desk.glb', import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject);
  });

it('T-1609: every placed desk turns its open knee side to its chair, props stay on top', async () => {
  const source = await loadDesk();
  const placements = furniturePlacements(officeLayout);
  const props = deskProps(officeLayout);
  expect(officeLayout.workstations).toHaveLength(8);
  for (const ws of officeLayout.workstations) {
    const id = `${ws.id}_desk`;
    const layoutDesk = desks.find((d) => d.id === id)!;
    const placement = placements.find((p) => p.box.id === id)!;
    // The 180-degree correction is applied exactly once on top of the layout rotY.
    expect(placement.rotY, id).toBe(((layoutDesk.rotY ?? 0) + 180) % 360);
    const fitted = fitModel(source, placement.box, placement.rotY);
    fitted.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(fitted);
    const [cx, , cz] = placement.box.position;
    const toSeat = new THREE.Vector2(
      ws.seat.position[0] - cx,
      ws.seat.position[2] - cz,
    ).normalize();
    // A ray at knee height from the chair side, along the desk's middle, meets the
    // modesty panel first; it must lie past the desk centre (away from the chair).
    const knee = bounds.min.y + 0.3 * (bounds.max.y - bounds.min.y);
    const reach = Math.max(placement.box.size[0], placement.box.size[2]);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(cx + toSeat.x * reach, knee, cz + toSeat.y * reach),
      new THREE.Vector3(-toSeat.x, 0, -toSeat.y),
    );
    const hit = ray.intersectObject(fitted, true)[0];
    expect(hit, `${id}: modesty panel`).toBeDefined();
    const depth = (hit!.point.x - cx) * toSeat.x + (hit!.point.z - cz) * toSeat.y;
    expect(depth, `${id}: panel side`).toBeLessThan(0);
    // Desk props stand on the turned desk's top: straight below each prop is the desktop,
    // and the prop's box starts on it (the screen box starts 2 cm higher, on its own base).
    for (const p of props.filter((q) => q.deskId === id)) {
      const [px, py, pz] = p.placement.box.position;
      const down = new THREE.Raycaster(new THREE.Vector3(px, 2, pz), new THREE.Vector3(0, -1, 0));
      const top = down.intersectObject(fitted, true)[0];
      expect(top?.point.y, p.placement.box.id).toBeCloseTo(bounds.max.y, 3);
      const bottom = py - p.placement.box.size[1] / 2;
      expect(bottom - bounds.max.y, p.placement.box.id).toBeGreaterThanOrEqual(-1e-6);
      expect(bottom - bounds.max.y, p.placement.box.id).toBeLessThanOrEqual(0.03);
    }
  }
});

it('office improvement 2026-11-20: the mouse and the books keep their proportions (contain)', () => {
  const props = deskProps(officeLayout);
  for (const p of props) {
    const contain = p.type === 'mouse' || p.type === 'stationery';
    expect(p.placement.contain === true, `${p.placement.box.id}`).toBe(contain);
  }
});
