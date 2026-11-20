import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LayoutBox, OfficeLayout } from '@office/protocol';

/**
 * T-1151 (plan §3.2, REQ-ROOM-003 / 007): procedural room shell details — window frames with
 * glass on the south window, skirting boards along every wall, ceiling panel seams, the air
 * conditioner and the office sign. Each detail kind is one merged mesh (one draw call), sits
 * on the inner face of its wall and casts no shadow. Colliders and room size are unchanged:
 * collision reads `office-layout.json`, never these meshes (plan §6.6). Owner decision
 * 2026-11-17: the air conditioner, window frames and sign are procedural; doors use the
 * Kenney `doorwayFront` model through the furniture loader.
 */

/** Frame bar width and depth, mullion spacing (m). */
const FRAME = { bar: 0.06, depth: 0.05, mullionSpacing: 1.45 };
const SKIRTING = { height: 0.08, depth: 0.015 };
/**
 * Owner request 2026-11-18 (more wall detail): a painted lower band (wainscot) with a chair
 * rail on every wall except the window wall, and an accent colour on the TV wall above it.
 */
const WAINSCOT = { height: 0.95, depth: 0.008, rail: 0.04, railDepth: 0.02 };
/** The wall the TV hangs on gets the accent colour (layout item type `TV`). */
const ACCENT_ITEM_TYPE = 'TV';
/** Ceiling panel size (m) and seam width; 0.6 m matches the floor tiles. */
const CEILING = { panel: 0.6, seam: 0.012 };

const COLORS = {
  frame: '#E9ECEF',
  glass: '#BFD9EA',
  skirting: '#D9D6CF',
  seam: '#E4E6EA',
  wainscot: '#E6E1D8',
  rail: '#FFFFFF',
  accent: '#CFDCD8',
  acBody: '#F0F2F4',
  acVent: '#AEB4BA',
  sign: '#2B2F33',
};

/** A box geometry at `center` with `size`, ready to merge. */
function box(size: [number, number, number], center: [number, number, number]) {
  return new THREE.BoxGeometry(...size).translate(...center);
}

function merged(
  name: string,
  parts: THREE.BufferGeometry[],
  material: THREE.Material,
): THREE.Mesh | null {
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // Not a camera occluder (T-1151 review 2026-11-20): one merged mesh spans every wall, and the
  // camera hides a whole occluder mesh when it clamps behind a wall, so marking it would blank
  // the detail on all walls at once. The thin details sit on the walls, which already occlude.
  return mesh;
}

/** Unit vector from a wall toward the room centre, on the wall's thin axis. */
function inward(wall: LayoutBox): { axis: 'x' | 'z'; sign: number } {
  const axis = wall.size[0] < wall.size[2] ? 'x' : 'z';
  const coordinate = axis === 'x' ? wall.position[0] : wall.position[2];
  return { axis, sign: coordinate > 0 ? -1 : 1 };
}

/** The coordinate of a wall's inner face on its thin axis. */
function innerFace(wall: LayoutBox): number {
  const { axis, sign } = inward(wall);
  const i = axis === 'x' ? 0 : 2;
  return wall.position[i] + (sign * wall.size[i]) / 2;
}

export function skirtingGeometry(layout: OfficeLayout): THREE.BufferGeometry[] {
  return layout.walls.map((wall) => {
    const { axis, sign } = inward(wall);
    const face = innerFace(wall) + (sign * SKIRTING.depth) / 2;
    const y = SKIRTING.height / 2;
    return axis === 'z'
      ? box([wall.size[0], SKIRTING.height, SKIRTING.depth], [wall.position[0], y, face])
      : box([SKIRTING.depth, SKIRTING.height, wall.size[2]], [face, y, wall.position[2]]);
  });
}

/** Walls that carry a window (the wainscot and accent skip them). */
function windowWalls(layout: OfficeLayout): Set<string> {
  return new Set(layout.windows.map((w) => w.wall));
}

/** A thin slab on a wall's inner face from `y0` to `y1`, `depth` thick, offset `off`. */
function faceSlab(wall: LayoutBox, y0: number, y1: number, depth: number, off = 0) {
  const { axis, sign } = inward(wall);
  const face = innerFace(wall) + sign * (off + depth / 2);
  const h = y1 - y0;
  const y = y0 + h / 2;
  return axis === 'z'
    ? box([wall.size[0], h, depth], [wall.position[0], y, face])
    : box([depth, h, wall.size[2]], [face, y, wall.position[2]]);
}

/** Wainscot panels and chair rails on every wall without a window. */
export function wainscotGeometry(layout: OfficeLayout): {
  panels: THREE.BufferGeometry[];
  rails: THREE.BufferGeometry[];
} {
  const skip = windowWalls(layout);
  const walls = layout.walls.filter((w) => !skip.has(w.id));
  const { height, depth, rail, railDepth } = WAINSCOT;
  return {
    panels: walls.map((w) => faceSlab(w, SKIRTING.height, height, depth)),
    rails: walls.map((w) => faceSlab(w, height - rail / 2, height + rail / 2, railDepth)),
  };
}

/** The accent panel above the wainscot on the wall behind the TV, or nothing. */
export function accentGeometry(layout: OfficeLayout): THREE.BufferGeometry[] {
  const tv = layout.items.find((i) => i.type === ACCENT_ITEM_TYPE);
  if (!tv) return [];
  const wall = layout.walls
    .filter((w) => inward(w).axis === (tv.size[0] < tv.size[2] ? 'x' : 'z'))
    .sort((a, b) => {
      const i = tv.size[0] < tv.size[2] ? 0 : 2;
      return Math.abs(a.position[i] - tv.position[i]) - Math.abs(b.position[i] - tv.position[i]);
    })[0];
  if (!wall) return [];
  return [faceSlab(wall, WAINSCOT.height + WAINSCOT.rail / 2, layout.room.height, 0.004)];
}

/** Frame bars (outer border plus vertical mullions) and one glass pane per window. */
export function windowGeometry(layout: OfficeLayout): {
  frame: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
} {
  const frame: THREE.BufferGeometry[] = [];
  const glass: THREE.BufferGeometry[] = [];
  for (const win of layout.windows) {
    const wall = layout.walls.find((w) => w.id === win.wall);
    if (!wall) continue;
    const { sign } = inward(wall);
    const face = innerFace(wall);
    const [w, h] = win.size;
    const [cx, cy] = win.position;
    const z = face + (sign * FRAME.depth) / 2;
    const { bar, depth } = FRAME;
    frame.push(box([w, bar, depth], [cx, cy + h / 2 - bar / 2, z]));
    frame.push(box([w, bar, depth], [cx, cy - h / 2 + bar / 2, z]));
    const mullions = Math.max(1, Math.round(w / FRAME.mullionSpacing));
    for (let i = 0; i <= mullions; i++) {
      const x = cx - w / 2 + bar / 2 + ((w - bar) * i) / mullions;
      frame.push(box([bar, h, depth], [x, cy, z]));
    }
    // The pane sits just in front of the wall face, behind the frame bars.
    glass.push(
      new THREE.PlaneGeometry(w - 2 * bar, h - 2 * bar)
        .rotateY(sign > 0 ? 0 : Math.PI)
        .translate(cx, cy, face + sign * 0.004),
    );
  }
  return { frame, glass };
}

/** Thin seams on the ceiling every `CEILING.panel` metres in both directions. */
export function ceilingGeometry(layout: OfficeLayout): THREE.BufferGeometry[] {
  const { width, depth, height } = layout.room;
  const y = height - 0.002;
  const seams: THREE.BufferGeometry[] = [];
  for (let x = -width / 2 + CEILING.panel; x < width / 2 - 1e-6; x += CEILING.panel)
    seams.push(box([CEILING.seam, 0.002, depth], [x, y, 0]));
  for (let z = -depth / 2 + CEILING.panel; z < depth / 2 - 1e-6; z += CEILING.panel)
    seams.push(box([width, 0.002, CEILING.seam], [0, y, z]));
  return seams;
}

/** Wall-mounted split unit: body plus vent slats, fitted to the layout box. */
export function airConditioner(item: LayoutBox): THREE.Group {
  const group = new THREE.Group();
  group.name = item.id;
  const [sx, sy, sz] = item.size;
  // Local frame: length along X, depth along Z (front toward +Z), then turned by rotY.
  const length = Math.max(sx, sz);
  const depth = Math.min(sx, sz);
  const body = merged(
    `${item.id}:body`,
    [
      box([length, sy, depth], [0, 0, 0]),
      box([length * 0.96, sy * 0.12, depth * 0.3], [0, -sy * 0.44, depth * 0.55]),
    ],
    new THREE.MeshStandardMaterial({ color: COLORS.acBody, roughness: 0.6 }),
  );
  const slats: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++)
    slats.push(box([length * 0.86, 0.008, 0.004], [0, -sy * 0.1 - i * 0.03, depth / 2 + 0.002]));
  const vents = merged(
    `${item.id}:vents`,
    slats,
    new THREE.MeshStandardMaterial({ color: COLORS.acVent }),
  );
  group.add(...[body, vents].filter((m): m is THREE.Mesh => m !== null));
  group.position.set(...item.position);
  // rotY turns the unit's front (+Z) toward the room (270° on the east wall faces -X) and
  // its length onto the wall, matching the layout box.
  group.rotation.y = ((item.rotY ?? 0) * Math.PI) / 180;
  group.userData.occluder = true;
  return group;
}

/** The office sign component over the main door, on the wall's inner face. */
export function signGeometry(layout: OfficeLayout): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const item of layout.items) {
    for (const c of item.components ?? []) {
      if (c.type !== 'signage') continue;
      const wall = layout.walls
        .filter((w) => inward(w).axis === 'z')
        .sort(
          (a, b) =>
            Math.abs(a.position[2] - c.position[2]) - Math.abs(b.position[2] - c.position[2]),
        )[0];
      if (!wall) continue;
      const { sign } = inward(wall);
      const z = innerFace(wall) + (sign * c.size[2]) / 2;
      out.push(box(c.size, [c.position[0], c.position[1], z]));
    }
  }
  return out;
}

/**
 * Wall pieces above the doors: the wall segments leave a full-height gap for each door, so
 * without these the room showed an empty slot between the door top and the ceiling.
 */
export function doorHeaderGeometry(layout: OfficeLayout): THREE.BufferGeometry[] {
  const { height } = layout.room;
  return layout.items
    .filter((i) => i.type === 'main_door' || i.type === 'utility_door')
    .flatMap((door) => {
      const top = door.position[1] + door.size[1] / 2;
      const gap = height - top;
      if (gap <= 0.001) return [];
      // Same thickness as the shell walls (0.1 m), across the door's wall-axis width.
      const alongX = door.size[0] >= door.size[2];
      const size: [number, number, number] = alongX
        ? [door.size[0], gap, 0.1]
        : [0.1, gap, door.size[2]];
      const wall = layout.walls.find((w) =>
        alongX
          ? Math.abs(w.position[2] - door.position[2]) < 0.1
          : Math.abs(w.position[0] - door.position[0]) < 0.1,
      );
      const center: [number, number, number] = [
        alongX ? door.position[0] : (wall?.position[0] ?? door.position[0]),
        top + gap / 2,
        alongX ? (wall?.position[2] ?? door.position[2]) : door.position[2],
      ];
      return [box(size, center)];
    });
}

/** Every shell detail as merged meshes; the AC replaces its palette box in `buildRoom`. */
export function buildShellDetails(layout: OfficeLayout): THREE.Object3D[] {
  const windows = windowGeometry(layout);
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.glass,
    roughness: 0.1,
    metalness: 0,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  // Door headers are wall pieces, so they stay camera occluders, one mesh per door: the camera
  // hides the whole hit mesh, and a merged mesh would blank the other door's header too.
  const headerMaterial = new THREE.MeshStandardMaterial({
    color: layout.palette.walls ?? '#F5F6F8',
  });
  const headers = doorHeaderGeometry(layout).map((geometry, i) => {
    const mesh = merged(`shell:door-header:${i}`, [geometry], headerMaterial);
    if (mesh) mesh.userData.occluder = true;
    return mesh;
  });
  const wainscot = wainscotGeometry(layout);
  const meshes = [
    ...headers,
    merged(
      'shell:wainscot',
      wainscot.panels,
      new THREE.MeshStandardMaterial({ color: COLORS.wainscot, roughness: 0.85 }),
    ),
    merged(
      'shell:chair-rail',
      wainscot.rails,
      new THREE.MeshStandardMaterial({ color: COLORS.rail, roughness: 0.5 }),
    ),
    merged(
      'shell:accent-wall',
      accentGeometry(layout),
      new THREE.MeshStandardMaterial({ color: COLORS.accent, roughness: 0.9 }),
    ),
    merged(
      'shell:window-frames',
      windows.frame,
      new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.5 }),
    ),
    merged('shell:window-glass', windows.glass, glassMaterial),
    merged(
      'shell:skirting',
      skirtingGeometry(layout),
      new THREE.MeshStandardMaterial({ color: COLORS.skirting }),
    ),
    merged(
      'shell:ceiling-panels',
      ceilingGeometry(layout),
      new THREE.MeshStandardMaterial({ color: COLORS.seam }),
    ),
    merged(
      'shell:sign',
      signGeometry(layout),
      new THREE.MeshStandardMaterial({ color: COLORS.sign, roughness: 0.4 }),
    ),
  ];
  return meshes.filter((m): m is THREE.Mesh => m !== null);
}
