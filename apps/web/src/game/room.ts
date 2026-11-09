import * as THREE from 'three';
import type { LayoutBox, OfficeLayout } from '@office/protocol';

const TYPE_COLORS: Record<string, string> = {
  main_door: 'mainDoor',
  plant: 'deskDividers',
  shoe_rack: 'deskFrame',
  countertop: 'lowerCabinetry',
  water_dispenser: 'waterBottles',
  storage_cabinet: 'lowerCabinetry',
  lockers: 'upperCabinetry',
  shelves: 'credenza',
  air_conditioner: 'airConditioner',
  utility_door: 'upperCabinetry',
  TV: 'fridge',
  sofa: 'chairBack',
  coffee_table: 'credenza',
  decorative_lighting: 'upperCabinetry',
};

function colorFor(box: LayoutBox, palette: Record<string, string>): string {
  const key = box.material ?? TYPE_COLORS[box.type] ?? 'walls';
  return palette[key] ?? '#cccccc';
}

function boxMesh(box: LayoutBox, color: string): THREE.Mesh {
  const [w, h, d] = box.size;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.position.set(...box.position);
  mesh.name = box.id;
  mesh.userData.occluder = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildRoom(layout: OfficeLayout): THREE.Group {
  const group = new THREE.Group();
  const { width, depth, height } = layout.room;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: layout.palette.floor ?? '#E8E4DC' }),
  );
  floor.name = 'floor';
  floor.receiveShadow = true;
  group.add(floor);
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: layout.palette.ceiling ?? '#FAFAFC' }),
  );
  ceiling.name = 'ceiling';
  ceiling.position.y = height;
  group.add(ceiling);
  for (const wall of layout.walls) group.add(boxMesh(wall, layout.palette.walls ?? '#F5F6F8'));
  for (const item of layout.items) group.add(boxMesh(item, colorFor(item, layout.palette)));
  return group;
}
