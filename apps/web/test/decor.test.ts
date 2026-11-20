import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { officeDecor, officeLayout, resolveDecor } from '@office/protocol';
import { decorPlacements } from '../src/game/assets/decorPlacements';
import { loadFurniture } from '../src/game/assets/loadFurniture';
import { buildRoom } from '../src/game/room';
import { WallClockView, clockHandAngles } from '../src/game/wallClock';

afterEach(() => vi.restoreAllMocks());

const { width, depth, height } = officeLayout.room;
const FLAT = 0.03;
const TOLERANCE = 0.06;

it('T-1158: every decor entry has a model, stays in the room and off the walkable aisles', () => {
  expect(officeDecor.items.length).toBeGreaterThanOrEqual(15);
  for (const item of officeDecor.items) {
    expect(existsSync(new URL(`../public/assets/${item.model}`, import.meta.url)), item.id).toBe(
      true,
    );
    const [x, y, z] = item.position;
    const [sx, sy, sz] = item.size;
    expect(Math.abs(x) + sx / 2, item.id).toBeLessThanOrEqual(width / 2);
    expect(Math.abs(z) + sz / 2, item.id).toBeLessThanOrEqual(depth / 2);
    expect(y + sy / 2, item.id).toBeLessThanOrEqual(height);
    expect(y - sy / 2, item.id).toBeGreaterThanOrEqual(-1e-6);
    // Flat rugs may lie in an aisle; anything taller must sit on or in existing furniture,
    // whose collider already keeps the aisle free (no new colliders, plan §3.2).
    if (sy <= FLAT) continue;
    const onCollider = officeLayout.colliders.some(
      (c) =>
        x - sx / 2 >= c.x - c.w / 2 - TOLERANCE &&
        x + sx / 2 <= c.x + c.w / 2 + TOLERANCE &&
        z - sz / 2 >= c.z - c.d / 2 - TOLERANCE &&
        z + sz / 2 <= c.z + c.d / 2 + TOLERANCE,
    );
    expect(onCollider, `${item.id} is not on a collider`).toBe(true);
  }
});

it('T-1158: the wall clock hangs on the inner face of its wall, above head height', () => {
  const { clock } = officeDecor;
  const wall = officeLayout.walls.find((w) => w.id === clock.wall)!;
  const inner = wall.position[2] + wall.size[2] / 2;
  expect(Math.abs(clock.position[2] - clock.depth / 2 - inner)).toBeLessThan(0.02);
  expect(clock.position[1] - clock.radius).toBeGreaterThan(1.7);
});

it('T-1158: clock hand angles match a given time', () => {
  const at = (h: number, m: number, s = 0) => clockHandAngles(new Date(2026, 10, 18, h, m, s));
  expect(at(3, 0).hour).toBeCloseTo(Math.PI / 2);
  expect(at(3, 0).minute).toBeCloseTo(0);
  expect(at(18, 30).hour).toBeCloseTo((6.5 / 12) * 2 * Math.PI);
  expect(at(18, 30).minute).toBeCloseTo(Math.PI);
  expect(at(0, 15, 30).minute).toBeCloseTo((15.5 / 60) * 2 * Math.PI);
  const view = new WallClockView(officeDecor.clock);
  view.update(new Date(2026, 10, 18, 9, 45));
  expect(view.angles.hour).toBeCloseTo((9.75 / 12) * 2 * Math.PI);
  expect(view.angles.minute).toBeCloseTo(1.5 * Math.PI);
  view.dispose();
});

it('T-1158: decor loads as standalone placements and replaces the pantry palette box', async () => {
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    return { scene } as never;
  });
  const room = buildRoom(officeLayout);
  expect(room.getObjectByName('pantry_counter')).toBeDefined();
  const placements = decorPlacements(officeDecor);
  const handle = await loadFurniture(room, officeLayout, placements);
  expect(handle.failed).toEqual([]);
  expect(handle.loaded).toBe(officeDecor.items.length);
  expect(room.getObjectByName('pantry_counter')).toBeUndefined();
  // Repeats (pillows, apples) share one mesh per part.
  for (const [file, model] of Object.entries(handle.models))
    expect(model.meshes, file).toBe(model.parts);
});

describe('decor placed at layout components (T-1158 review 2026-11-20)', () => {
  const component = (id: string) =>
    officeLayout.items.flatMap((i) => i.components ?? []).find((c) => c.id === id)!;

  it('draws the coffee machine and upper cabinets from the layout boxes, not copies', () => {
    for (const [decorId, layoutId] of [
      ['pantry_coffee_machine', 'coffee_machine'],
      ['pantry_upper', 'pantry_upper_cabinets'],
    ] as const) {
      const item = officeDecor.items.find((i) => i.id === decorId)!;
      const box = component(layoutId);
      expect(item.position).toBe(box.position);
      expect(item.size).toBe(box.size);
      expect(item.rotY).toBe(box.rotY ?? 0);
    }
  });

  it('follows a moved layout component and rejects an unknown id', () => {
    const moved = structuredClone(officeLayout);
    const machine = moved.items
      .flatMap((i) => i.components ?? [])
      .find((c) => c.id === 'coffee_machine')!;
    machine.position = [1, 1.13, -4];
    const [item] = resolveDecor([{ id: 'm', model: 'x.glb', at: 'coffee_machine' }], moved);
    expect(item!.position).toEqual([1, 1.13, -4]);
    expect(() => resolveDecor([{ id: 'm', model: 'x.glb', at: 'nope' }], moved)).toThrow(/nope/);
  });
});
