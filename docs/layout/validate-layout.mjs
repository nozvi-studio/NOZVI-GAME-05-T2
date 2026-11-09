import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

// REQ-ROOM-001..008, REQ-INT-001..005, REQ-MOVE-002.
// No dependencies; paths resolve relative to this script, not the caller's cwd.
const EPS = 1e-8;
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const near = (a, b) => Math.abs(a - b) <= EPS;
const vector = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const same = isDeepStrictEqual;
const rect = c => ({ minX: c.x - c.w / 2, maxX: c.x + c.w / 2,
  minZ: c.z - c.d / 2, maxZ: c.z + c.d / 2 });
const contains = (a, b) => b.minX >= a.minX - EPS && b.maxX <= a.maxX + EPS
  && b.minZ >= a.minZ - EPS && b.maxZ <= a.maxZ + EPS;
const pointRect = p => ({ minX: p[0], maxX: p[0], minZ: p[2], maxZ: p[2] });
const overlap = (a, b) => Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > EPS
  && Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > EPS;
const distance = (p, c) => Math.hypot(Math.max(c.minX - p[0], 0, p[0] - c.maxX),
  Math.max(c.minZ - p[2], 0, p[2] - c.maxZ));

// Open-interior segment/AABB test: merely touching a face is not penetration.
function segmentIntersectsRect(a, b, c) {
  let lo = 0, hi = 1;
  const axes = [[0, c.minX + EPS, c.maxX - EPS], [2, c.minZ + EPS, c.maxZ - EPS]];
  if (c.minY !== undefined) axes.push([1, c.minY + EPS, c.maxY - EPS]);
  for (const [axis, min, max] of axes) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < EPS) { if (a[axis] <= min || a[axis] >= max) return false; }
    else {
      const t1 = (min - a[axis]) / delta, t2 = (max - a[axis]) / delta;
      lo = Math.max(lo, Math.min(t1, t2)); hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return lo <= hi;
}

function validateCirculation(items, workstations, colliders) {
  const furniture = colliders.filter(c => c.kind === 'furniture');
  const wallInsets = colliders.filter(c => c.kind === 'wall').map(c => {
    const b = rect(c);
    return { minX: b.minX - 0.3, maxX: b.maxX + 0.3, minZ: b.minZ - 0.3, maxZ: b.maxZ + 0.3 };
  });
  const itemMap = new Map(items.map(i => [i.id, i]));
  const desks = new Map(workstations.map(ws => [ws.desk.itemId, ws]));
  let checked = 0, minimum = Infinity;
  for (let i = 0; i < furniture.length; i++) for (let j = i + 1; j < furniture.length; j++) {
    const ca = furniture[i], cb = furniture[j], a = rect(ca), b = rect(cb);
    const ia = itemMap.get(ca.ownerId), ib = itemMap.get(cb.ownerId);
    if (workstations.some(ws => [ca.ownerId, cb.ownerId].includes(ws.desk.itemId)
      && [ca.ownerId, cb.ownerId].includes(ws.chairId))) continue;
    const gap = Math.hypot(Math.max(a.minX - b.maxX, b.minX - a.maxX, 0),
      Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0));
    // Back-to-back desks touch at a solid seam: there is no aisle at that seam.
    if (near(gap, 0) && desks.has(ca.ownerId) && desks.has(cb.ownerId)
      && desks.get(ca.ownerId).podId === desks.get(cb.ownerId).podId) continue;
    const sofaTable = (ia?.type === 'sofa' && ia.coffeeTableId === ib?.id && ib.type === 'coffee_table')
      || (ib?.type === 'sofa' && ib.coffeeTableId === ia?.id && ia.type === 'coffee_table');
    const required = sofaTable ? 0.6 : 0.9;
    if (sofaTable) {
      check(gap >= required - EPS, `${ca.ownerId}/${cb.ownerId}: sofa/table gap ${gap.toFixed(3)} m < 0.6 m`);
      continue;
    }
    // Test every exposed nearest cross-section, split at other furniture edges.
    // If another assembly fills the entire gap, this pair does not bound a path
    // (for example a desk separates its neighboring desk from the far chair).
    const others = furniture.filter(c => c !== ca && c !== cb).map(rect);
    function closestAxis(minA, maxA, minB, maxB, axis) {
      if (maxA <= minB) return [[maxA, minB]];
      if (maxB <= minA) return [[minA, maxB]];
      const lo = Math.max(minA, minB), hi = Math.min(maxA, maxB);
      const cuts = [lo, hi, ...[...others, ...wallInsets].flatMap(c => axis === 0 ? [c.minX, c.maxX] : [c.minZ, c.maxZ])]
        .filter(n => n >= lo && n <= hi).sort((x, y) => x - y);
      return cuts.slice(1).map((end, n) => [(cuts[n] + end) / 2, (cuts[n] + end) / 2]);
    }
    const xs = closestAxis(a.minX, a.maxX, b.minX, b.maxX, 0);
    const zs = closestAxis(a.minZ, a.maxZ, b.minZ, b.maxZ, 2);
    const exposed = xs.some(([ax, bx]) => zs.some(([az, bz]) => {
      const middle = [(ax + bx) / 2, 0, (az + bz) / 2];
      // Tiny recesses behind north-wall fixtures cannot be circulation paths:
      // their centerline lies inside the room wall's avatar exclusion strip.
      return !wallInsets.some(c => middle[0] > c.minX + EPS && middle[0] < c.maxX - EPS
        && middle[2] > c.minZ + EPS && middle[2] < c.maxZ - EPS)
        && !others.some(c => segmentIntersectsRect([ax, 0, az], [bx, 0, bz], c));
    }));
    if (!exposed) continue;
    checked++; minimum = Math.min(minimum, gap);
    check(gap >= required - EPS, `${ca.ownerId}/${cb.ownerId}: circulation gap ${gap.toFixed(3)} m < 0.9 m`);
  }
  return { checked, minimum };
}

function unique(entries, label) {
  const ids = entries.map(e => e.id);
  check(ids.every(id => typeof id === 'string' && id.length > 0), `${label}: missing ID`);
  check(new Set(ids).size === ids.length, `${label}: duplicate IDs`);
}

function validate(layout) {
  const { room, zones, items, workstations, interactables, colliders, walls, spawn } = layout;
  for (const [name, value] of Object.entries({ zones, items, workstations, interactables, colliders, walls })) {
    if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
    unique(value, name);
  }
  check(same(room.dimensions, { width: 10, depth: 8, height: 2.7 }), 'Room must be 10 x 8 x 2.7 m');
  check(same(room.coordinateSystem, { origin: 'floor_center', unit: 'meters', '+X': 'east',
    '+Z': 'south', '+Y': 'up', rotYUnit: 'degrees', rotYZero: '+Z', positiveRotY: '+Z toward +X' }),
  'Coordinate convention changed');
  const roomBounds = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
  const expectedZones = ['Workstation', 'Pantry', 'Storage', 'Entrance', 'Entertainment'];
  check(zones.length === 5 && expectedZones.every(id => zones.some(z => z.id === id)),
    'Exactly the five required zones must be present');
  const zoneMap = new Map(zones.map(z => [z.id, z.bounds]));
  for (const zone of zones) {
    const b = zone.bounds;
    check(b && ['minX', 'maxX', 'minZ', 'maxZ'].every(k => Number.isFinite(b[k]))
      && b.minX < b.maxX && b.minZ < b.maxZ, `${zone.id}: invalid rectangle`);
    check(contains(roomBounds, b), `${zone.id}: outside room`);
  }
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    check(!overlap(zones[i].bounds, zones[j].bounds), `${zones[i].id}/${zones[j].id}: zones overlap`);
  }
  function position(p, zone, label) {
    if (!vector(p)) throw new Error(`${label}: expected three finite coordinates`);
    check(contains(roomBounds, pointRect(p)) && p[1] >= -EPS && p[1] <= 2.7 + EPS,
      `${label}: position outside room`);
    if (zone !== undefined) check(zoneMap.has(zone) && contains(zoneMap.get(zone), pointRect(p)),
      `${label}: outside zone ${zone}`);
  }
  function transform(object, zone, label) {
    position(object.position, zone, label);
    check(Number.isFinite(object.rotY), `${label}: invalid rotY`);
    if (!vector(object.size) || object.size.some(n => n <= 0)) throw new Error(`${label}: invalid size`);
    const [w, h, d] = object.size;
    const footprint = rect({ x: object.position[0], z: object.position[2], w, d });
    check(contains(roomBounds, footprint) && object.position[1] - h / 2 >= -EPS
      && object.position[1] + h / 2 <= 2.7 + EPS, `${label}: extents outside room`);
    if (zone !== undefined) check(zoneMap.has(zone) && contains(zoneMap.get(zone), footprint),
      `${label}: extents outside zone ${zone}`);
    return footprint;
  }
  const colliderMap = new Map(colliders.map(c => [c.id, c]));
  const itemMap = new Map(items.map(item => [item.id, item]));
  const targets = [];
  const sockets = [];
  function target(p, zone, label) {
    position(p, zone, label);
    check(near(p[1], 0), `${label}: approach point must be on floor`);
    targets.push({ position: p, label });
  }
  function ownedCollider(owner, kind, footprint) {
    const c = colliderMap.get(owner.colliderId);
    check(c && c.ownerId === owner.id && c.kind === kind, `${owner.id}: missing or incorrect collider`);
    if (c) check(same(rect(c), footprint), `${owner.id}: collider differs from full footprint`);
    if (c && kind === 'furniture') check(c.zone === owner.zone, `${owner.id}: collider zone differs`);
  }
  const assetTypes = new Map(expectedZones.map(z => [z, new Set()]));
  for (const item of items) {
    const footprint = transform(item, item.zone, item.id);
    ownedCollider(item, 'furniture', footprint);
    assetTypes.get(item.zone)?.add(item.type);
    for (const component of item.components ?? []) {
      const child = transform(component, item.zone, component.id);
      check(contains(footprint, child), `${component.id}: outside assembly collision footprint`);
      assetTypes.get(item.zone)?.add(component.type);
    }
    for (const socket of item.seatSockets ?? []) {
      sockets.push(socket);
      position(socket.position, item.zone, socket.id);
      check(contains(footprint, pointRect(socket.position)), `${socket.id}: outside seat furniture`);
      check(near(socket.position[1], 0.45) && Number.isFinite(socket.rotY), `${socket.id}: invalid seat transform`);
      target(socket.interactionPoint, item.zone, `${socket.id} approach`);
    }
  }
  unique([...items, ...items.flatMap(item => item.components ?? [])], 'items/components');
  unique(sockets, 'seat sockets');
  for (const wall of walls) {
    // Walls, floor, ceiling and windows are shared shell elements, not zoned furniture.
    const footprint = transform({ ...wall, rotY: 0 }, undefined, wall.id);
    ownedCollider(wall, 'wall', footprint);
  }
  check(walls.length >= 4, 'Missing perimeter walls');
  for (const c of colliders) {
    check(['x', 'z', 'w', 'd'].every(k => Number.isFinite(c[k])) && c.w > 0 && c.d > 0,
      `${c.id}: invalid collider footprint`);
    check(['wall', 'furniture'].includes(c.kind), `${c.id}: invalid collider kind`);
    const owners = c.kind === 'wall' ? walls : items;
    check(owners.filter(o => o.id === c.ownerId && o.colliderId === c.id).length === 1,
      `${c.id}: orphan or multiply owned collider`);
  }
  for (let i = 0; i < colliders.length; i++) for (let j = i + 1; j < colliders.length; j++) {
    // Also reject furniture/wall intersections; touching edges are allowed.
    check(!overlap(rect(colliders[i]), rect(colliders[j])), `${colliders[i].id}/${colliders[j].id}: colliders overlap`);
  }
  check(workstations.length === 8, 'Exactly eight workstations required');
  const pods = new Map();
  for (const ws of workstations) {
    pods.set(ws.podId, (pods.get(ws.podId) ?? 0) + 1);
    check(ws.zone === 'Workstation', `${ws.id}: incorrect zone`);
    const desk = itemMap.get(ws.desk.itemId), chair = itemMap.get(ws.chairId);
    position(ws.desk.position, ws.zone, `${ws.id} desk`);
    check(desk?.type === 'desk' && same(desk.position, ws.desk.position) && desk.rotY === ws.desk.rotY,
      `${ws.id}: desk transform/reference mismatch`);
    check(chair?.type === 'chair' && same(chair.seatSockets?.[0], ws.seatSocket), `${ws.id}: seat mismatch`);
    target(ws.interactionPoint, ws.zone, `${ws.id} approach`);
    for (const type of ['computer', 'chair']) check(interactables.filter(i => i.type === type
      && i.workstationId === ws.id && same(i.interactionPoint, ws.interactionPoint)
      && i.itemId === (type === 'computer' ? desk?.id : chair?.id)).length === 1,
    `${ws.id}: missing or incorrect ${type} interactable`);
  }
  check(pods.size === 2 && [...pods.values()].every(n => n === 4), 'Require two four-desk pods');
  check(new Set(workstations.map(w => w.desk.itemId)).size === 8
    && new Set(workstations.map(w => w.chairId)).size === 8, 'Workstations must have distinct desks/chairs');
  const circulation = validateCirculation(items, workstations, colliders);
  for (const i of interactables) {
    const owner = itemMap.get(i.itemId);
    check(owner && owner.zone === i.zone, `${i.id}: invalid interactable owner/zone`);
    position(i.position, i.zone, i.id);
    if (owner) check(contains(rect({ x: owner.position[0], z: owner.position[2],
      w: owner.size[0], d: owner.size[2] }), pointRect(i.position)), `${i.id}: target outside owner`);
    target(i.interactionPoint, i.zone, `${i.id} approach`);
    check(near(i.interactionRange, 2), `${i.id}: expected default 2 m range`);
    check(Math.hypot(...i.position.map((n, k) => n - i.interactionPoint[k])) <= i.interactionRange + EPS,
      `${i.id}: approach outside interaction range`);
  }
  for (const type of ['computer', 'chair', 'coffee_machine', 'water_dispenser', 'storage_cabinet', 'main_door', 'TV', 'sofa']) {
    check(interactables.some(i => i.type === type), `Missing interactable type ${type}`);
  }
  const requiredAssets = {
    Workstation: ['desk', 'chair', 'computer', 'keyboard', 'mouse', 'desk_lamp', 'stationery', 'decorative_object'],
    Pantry: ['coffee_machine', 'water_dispenser', 'cups', 'fridge', 'countertop', 'cabinets'],
    Storage: ['storage_cabinet', 'lockers', 'shelves', 'boxes', 'personal_decorative_items'],
    Entrance: ['main_door', 'door_frame', 'plant', 'signage'],
    Entertainment: ['TV', 'sofa', 'coffee_table', 'speaker', 'decorative_lighting']
  };
  for (const [zone, types] of Object.entries(requiredAssets)) for (const type of types) {
    check(assetTypes.get(zone)?.has(type), `${zone}: missing asset ${type}`);
  }
  check(items.filter(i => i.type === 'desk').length === 8 && items.filter(i => i.type === 'chair').length === 8,
    'Exactly eight desk and chair assemblies required');
  check(items.filter(i => i.type === 'lockers').every(i => i.visualOnly === true
    && !interactables.some(t => t.itemId === i.id)), 'Lockers must be visual only');
  check(items.filter(i => i.type === 'sofa').some(i => i.seatSockets?.length > 0
    && i.seatSockets.every(s => s.activity === 'rest_relax')), 'Sofa must provide rest/relax seats');
  for (const sofa of items.filter(i => i.type === 'sofa')) {
    const table = itemMap.get(sofa.coffeeTableId);
    check(table?.type === 'coffee_table' && table.zone === sofa.zone, `${sofa.id}: missing associated coffee table`);
  }
  const tv = items.find(i => i.type === 'TV'), door = items.find(i => i.type === 'main_door');
  const tvWall = walls.find(w => w.id === tv?.wallId);
  check(tvWall && near(tvWall.position[0], -4.95) && near(tv.position[0] - tv.size[0] / 2,
    tvWall.position[0] + tvWall.size[0] / 2), 'TV must attach to west Entertainment wall');
  for (const sofa of items.filter(i => i.type === 'sofa')) for (const seat of sofa.seatSockets ?? []) {
    const eye = [seat.position[0], seat.position[1] + 0.8, seat.position[2]];
    const angle = seat.rotY * Math.PI / 180;
    const direction = [tv.position[0] - eye[0], tv.position[2] - eye[2]];
    check(Math.sin(angle) * direction[0] + Math.cos(angle) * direction[1] > 0,
      `${seat.id}: seat must face the TV`);
    for (const obstacle of items.filter(i => i !== sofa && i !== tv)) {
      const bounds = { ...rect({ x: obstacle.position[0], z: obstacle.position[2],
        w: obstacle.size[0], d: obstacle.size[2] }), minY: obstacle.position[1] - obstacle.size[1] / 2,
        maxY: obstacle.position[1] + obstacle.size[1] / 2 };
      check(!segmentIntersectsRect(eye, tv.position, bounds), `${seat.id}: TV view blocked by ${obstacle.id}`);
    }
  }
  check(door && near(door.position[2] - door.size[2] / 2, -3.99), 'Main door must be on north wall');
  const { shell } = layout;
  check(same(shell.floor.position, [0, 0, 0]) && same(shell.floor.size, [10, 0, 8]), 'Missing full floor');
  check(same(shell.ceiling.position, [0, 2.7, 0]) && same(shell.ceiling.size, [10, 0, 8]), 'Missing full ceiling');
  check(shell.windows.length > 0 && shell.lighting.length > 0, 'Missing windows or lighting');
  for (const w of shell.windows) {
    transform(w, undefined, w.id);
    check(near(w.position[2], 3.95) && w.size[0] >= 9.6 && colliderMap.has(w.colliderId),
      `${w.id}: require full south window wall and shared wall collider`);
  }
  for (const light of shell.lighting) position(light.position, undefined, light.id);
  const palette = { walls: '#F5F6F8', ceiling: '#FAFAFC', floor: '#E8E4DC', grout: '#C8C4BC',
    deskSurfaces: '#6E4D38', deskFrame: '#E5E7EB', deskDividers: '#48A832', chairBack: '#6CB33F',
    chairSeat: '#222426', lowerCabinetry: '#9E866F', upperCabinetry: '#EDEFEF', credenza: '#684B35',
    mainDoor: '#3D271D', fridge: '#1A1A1C', airConditioner: '#F0F2F4', waterBottles: '#3B9AE2' };
  check(same(layout.palette, palette), 'Photo-derived palette changed');
  check(near(layout.collision.capsuleRadius, 0.3) && near(layout.collision.spawnClearance, 0.6)
    && near(layout.collision.interactionClearance, 0.3) && near(layout.collision.circulationClearance, 0.9)
    && near(layout.collision.sofaTableClearance, 0.6), 'Required clearance values changed');
  position(spawn.position, 'Entrance', 'Spawn');
  check(spawn.zone === 'Entrance' && near(spawn.position[1], 0) && Number.isFinite(spawn.rotY), 'Invalid spawn');
  const obstacles = colliders.map(c => ({ ...rect(c), id: c.id }));
  function clearance(p, radius, label) {
    check(p[0] >= -5 + radius - EPS && p[0] <= 5 - radius + EPS
      && p[2] >= -4 + radius - EPS && p[2] <= 4 - radius + EPS, `${label}: insufficient room-boundary clearance`);
    for (const c of obstacles) check(distance(p, c) >= radius - EPS, `${label}: insufficient clearance from ${c.id}`);
  }
  clearance(spawn.position, 0.6, 'Spawn');
  for (const t of targets) clearance(t.position, 0.3, t.label);
  if (errors.length) return;
  validateReachability(spawn.position, targets, obstacles, layout.collision.navigationGridStep);
  if (!errors.length) {
    console.log('Layout valid: 10 x 8 x 2.7 m; 8 workstations in 2 pods.');
    for (const zone of zones) console.log(`${zone.id}: assemblies=${items.filter(i => i.zone === zone.id).length}, `
      + `components=${items.filter(i => i.zone === zone.id).flatMap(i => i.components ?? []).length}, `
      + `interactables=${interactables.filter(i => i.zone === zone.id).length}`);
    console.log(`${colliders.length} colliders (${colliders.filter(c => c.kind === 'wall').length} walls, `
      + `${colliders.filter(c => c.kind === 'furniture').length} furniture); ${sockets.length} seat sockets; `
      + `${targets.length} approach references reachable from spawn.`);
    console.log(`Circulation: ${circulation.checked} exposed assembly pairs; minimum gap ${circulation.minimum.toFixed(2)} m. `
      + 'Navigation: 0.1 m cells, 0.3 m avatar radius.');
  }
}

function validateReachability(spawn, targets, obstacles, step) {
  // Conservative square inflation contains the 0.3 m capsule. A successful route
  // is collision-free continuously, including each edge; no diagonal corner cuts.
  if (!near(step, 0.1)) throw new Error('Navigation grid step must be 0.1 m');
  const radius = 0.3, nx = Math.round(10 / step) + 1, nz = Math.round(8 / step) + 1;
  const expanded = obstacles.map(c => ({ minX: c.minX - radius, maxX: c.maxX + radius,
    minZ: c.minZ - radius, maxZ: c.maxZ + radius }));
  const point = index => [-5 + (index % nx) * step, 0, -4 + Math.floor(index / nx) * step];
  const free = p => Math.abs(p[0]) <= 5 - radius + EPS && Math.abs(p[2]) <= 4 - radius + EPS
    && !expanded.some(c => p[0] > c.minX + EPS && p[0] < c.maxX - EPS
      && p[2] > c.minZ + EPS && p[2] < c.maxZ - EPS);
  function segmentClear(a, b) {
    return !expanded.some(c => segmentIntersectsRect(a, b, c));
  }
  function neighbors(p) {
    const fx = (p[0] + 5) / step, fz = (p[2] + 4) / step;
    const result = [];
    for (const x of new Set([Math.floor(fx), Math.ceil(fx)])) for (const z of new Set([Math.floor(fz), Math.ceil(fz)])) {
      if (x < 0 || x >= nx || z < 0 || z >= nz) continue;
      const index = z * nx + x, q = point(index);
      if (free(q) && segmentClear(p, q)) result.push(index);
    }
    return result;
  }
  const available = Uint8Array.from({ length: nx * nz }, (_, i) => Number(free(point(i))));
  const visited = new Uint8Array(nx * nz), queue = neighbors(spawn);
  check(queue.length > 0, 'Spawn cannot connect to navigation grid');
  for (const i of queue) visited[i] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % nx;
    for (const next of [x > 0 ? i - 1 : -1, x < nx - 1 ? i + 1 : -1, i - nx, i + nx]) {
      if (next < 0 || next >= available.length || !available[next] || visited[next]) continue;
      if (!segmentClear(point(i), point(next))) continue;
      visited[next] = 1; queue.push(next);
    }
  }
  for (const t of targets) check(neighbors(t.position).some(i => visited[i]), `${t.label}: unreachable from spawn`);
}

try {
  const path = process.argv[2] ? resolve(process.argv[2])
    : fileURLToPath(new URL('./office-layout.json', import.meta.url));
  validate(JSON.parse(readFileSync(path, 'utf8')));
} catch (error) {
  errors.push(error.message);
}
if (errors.length) {
  console.error(`Layout invalid (${errors.length} failures):\n${errors.map(e => `- ${e}`).join('\n')}`);
  process.exitCode = 1;
}
