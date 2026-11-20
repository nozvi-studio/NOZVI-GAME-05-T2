import { expect, it } from 'vitest';
import * as THREE from 'three';
import { officeLayout } from '@office/protocol';
import { buildRoom } from '../src/game/room';
import {
  airConditioner,
  buildShellDetails,
  accentGeometry,
  ceilingGeometry,
  wainscotGeometry,
  doorHeaderGeometry,
  skirtingGeometry,
  windowGeometry,
} from '../src/game/roomDetails';

const bounds = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return g.boundingBox!;
};

it('T-1151: window frames, glass, skirting, ceiling panels and sign are one merged mesh each', () => {
  const details = buildShellDetails(officeLayout);
  expect(details.map((d) => d.name).sort()).toEqual([
    'shell:accent-wall',
    'shell:ceiling-panels',
    'shell:chair-rail',
    'shell:door-header:0',
    'shell:door-header:1',
    'shell:sign',
    'shell:skirting',
    'shell:wainscot',
    'shell:window-frames',
    'shell:window-glass',
  ]);
  for (const d of details) {
    expect((d as THREE.Mesh).isMesh).toBe(true);
    expect(d.castShadow).toBe(false);
  }
});

it('T-1151 review: room-wide detail meshes are not camera occluders; door headers are, one per door', () => {
  const details = buildShellDetails(officeLayout);
  const occluders = details.filter((d) => d.userData.occluder === true).map((d) => d.name);
  // The camera hides a whole occluder mesh when it clamps behind a wall, so a merged mesh that
  // spans every wall must not be one, or the skirting / wainscot / frames of all walls vanish.
  expect(occluders.sort()).toEqual(['shell:door-header:0', 'shell:door-header:1']);
  const headerCount = doorHeaderGeometry(officeLayout).length;
  expect(headerCount).toBe(2);
  for (const name of occluders) {
    const mesh = details.find((d) => d.name === name) as THREE.Mesh;
    // One door each: the wall-thickness side of the header box is 0.1 m.
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(Math.min(size.x, size.z)).toBeCloseTo(0.1, 5);
  }
});

it('T-1151: details stay inside the room on the inner wall faces', () => {
  const { width, depth, height } = officeLayout.room;
  const parts = [
    ...skirtingGeometry(officeLayout),
    ...windowGeometry(officeLayout).frame,
    ...windowGeometry(officeLayout).glass,
    ...ceilingGeometry(officeLayout),
  ];
  for (const g of parts) {
    const b = bounds(g);
    expect(b.min.x).toBeGreaterThanOrEqual(-width / 2 - 1e-6);
    expect(b.max.x).toBeLessThanOrEqual(width / 2 + 1e-6);
    expect(b.min.z).toBeGreaterThanOrEqual(-depth / 2 - 1e-6);
    expect(b.max.z).toBeLessThanOrEqual(depth / 2 + 1e-6);
    expect(b.max.y).toBeLessThanOrEqual(height + 1e-6);
  }
  // One skirting run per wall segment.
  expect(skirtingGeometry(officeLayout)).toHaveLength(officeLayout.walls.length);
  // The south window glass sits in front of the south wall's inner face (z = 4.70).
  const glass = bounds(windowGeometry(officeLayout).glass[0]!);
  expect(glass.max.z).toBeLessThan(4.7);
  expect(glass.max.z).toBeGreaterThan(4.69);
});

it('T-1151: the air conditioner fills its layout box and faces into the room', () => {
  const item = officeLayout.items.find((i) => i.type === 'air_conditioner')!;
  const ac = airConditioner(item);
  ac.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(ac);
  const size = b.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(item.size[0], 1);
  expect(size.z).toBeCloseTo(item.size[2], 1);
  // Front (+Z local) points toward the room centre (east wall: -X).
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(ac.quaternion);
  expect(front.x).toBeLessThan(-0.99);
});

it('T-1151: buildRoom has no palette box for the air conditioner and keeps the door boxes for the model swap', () => {
  const room = buildRoom(officeLayout);
  const ac = room.getObjectByName('air_conditioner')!;
  expect((ac as THREE.Mesh).isMesh).toBeFalsy();
  expect(room.getObjectByName('main_door')).toBeDefined();
  expect(room.getObjectByName('east_utility_door')).toBeDefined();
});

it('T-1151: wall pieces close the gap between each door top and the ceiling', () => {
  const headers = doorHeaderGeometry(officeLayout);
  expect(headers).toHaveLength(2);
  for (const g of headers) {
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(officeLayout.room.height);
  }
});

it('owner request 2026-11-18: wainscot and chair rail on every wall but the window wall', () => {
  const { panels, rails } = wainscotGeometry(officeLayout);
  const expected =
    officeLayout.walls.length - new Set(officeLayout.windows.map((w) => w.wall)).size;
  expect(panels).toHaveLength(expected);
  expect(rails).toHaveLength(expected);
  for (const g of panels) {
    g.computeBoundingBox();
    expect(g.boundingBox!.max.y).toBeCloseTo(0.95);
  }
});

it('owner request 2026-11-18: the accent colour is on the TV wall above the rail', () => {
  const [accent] = accentGeometry(officeLayout);
  accent!.computeBoundingBox();
  const b = accent!.boundingBox!;
  const tv = officeLayout.items.find((i) => i.type === 'TV')!;
  // The TV hangs on the west wall (x about -5.9): the accent panel lies on its inner face.
  expect(Math.abs(b.min.x - tv.position[0])).toBeLessThan(0.15);
  expect(b.min.y).toBeGreaterThan(0.9);
  expect(b.max.y).toBeCloseTo(officeLayout.room.height);
});

it('office improvement 2026-11-20 (T-1151 review): the sign sits above the main door leaf', () => {
  const door = officeLayout.items.find((i) => i.type === 'main_door')!;
  const sign = door.components!.find((c) => c.type === 'signage')!;
  const doorTop = door.position[1] + door.size[1] / 2;
  const signBottom = sign.position[1] - sign.size[1] / 2;
  const signTop = sign.position[1] + sign.size[1] / 2;
  expect(signBottom).toBeGreaterThanOrEqual(doorTop);
  expect(signTop).toBeLessThanOrEqual(officeLayout.room.height);
});
