import raw from './office-layout.json';

export type Vec2 = { x: number; z: number };
export type Aabb = { x: number; z: number; w: number; d: number };
export type Vec3 = [number, number, number];
export type Collider = Aabb & { id: string; kind: string };
export type LayoutBox = { id: string; type: string; position: Vec3; size: Vec3; material?: string };
export type Workstation = {
  id: string;
  seat: { position: Vec3; rotY: number };
  interactionPoint: Vec3;
};
export type OfficeLayout = {
  room: { width: number; depth: number; height: number };
  palette: Record<string, string>;
  zones: { id: string; bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }[];
  walls: LayoutBox[];
  items: LayoutBox[];
  workstations: Workstation[];
  colliders: Collider[];
  spawn: { zone: string; position: Vec3; rotY: number };
};

function fail(msg: string): never {
  throw new Error(`Invalid layout: ${msg}`);
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function parseLayout(input: unknown): OfficeLayout {
  if (!isRecord(input)) fail('not an object');
  const room = input.room;
  if (!isRecord(room) || !isRecord(room.dimensions)) fail('missing room.dimensions');
  const dims = room.dimensions as { width: number; depth: number; height: number };
  const required = ['palette', 'zones', 'walls', 'items', 'workstations', 'colliders', 'spawn'];
  for (const key of required) if (!(key in input)) fail(`missing ${key}`);
  const workstations = (input.workstations as Record<string, unknown>[]).map((ws) => {
    const seat = ws.seatSocket as { position: Vec3; rotY: number };
    return {
      id: ws.id as string,
      seat: { position: seat.position, rotY: seat.rotY },
      interactionPoint: ws.interactionPoint as Vec3,
    };
  });
  return {
    room: { width: dims.width, depth: dims.depth, height: dims.height },
    palette: input.palette as Record<string, string>,
    zones: input.zones as OfficeLayout['zones'],
    walls: input.walls as LayoutBox[],
    items: input.items as LayoutBox[],
    workstations,
    colliders: input.colliders as Collider[],
    spawn: input.spawn as OfficeLayout['spawn'],
  };
}

export const officeLayout: OfficeLayout = parseLayout(raw);
