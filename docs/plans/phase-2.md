# Phase 2 — Avatars & Interaction Implementation Plan

> **For agentic workers:** Execute task by task after Phase 1 is complete. Codex writes code (no network); agy copies local assets, installs dependencies and runs every command marked **Run**. The lead reviews diffs and screenshots before ticking a task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A player fills a join form (name, office code, avatar), spawns at the Entrance as a Quaternius avatar in a furnished office, walks with animation, sits at a free desk with `E`, works, stands up, and uses the light extras: coffee, wave, sofa rest, cabinet and exit door. Everything is single-player; multiplayer comes in Phase 3.

**Architecture:** Rules stay pure in `packages/protocol` so the Phase 3 server can reuse them: identity validation, the activity state machine, seat claiming and interaction targeting. `apps/web` adds an asset layer (furniture GLB fitted to the layout boxes), an avatar view (retargeted UAL clips on Quaternius models), an interaction controller and a React join screen. Three.js still runs outside React.

**Tech Stack:** As in Phase 1. Adds `three/addons` (GLTFLoader, CSS2DRenderer) and no new npm packages.

**Spec:** `docs/SPEC.md` REQ-AVATAR-001..004, REQ-UI-001/002/004, REQ-INT-001..005, REQ-ROOM-004..008, REQ-NFR-003. `docs/DECISIONS.md` (core-first priority, PoC avatar findings). Builds on `docs/plans/phase-1.md` interfaces: `Game`, `Player`, `KeyboardInput`, `CameraRig`, `officeLayout`, `BALANCE`, `stepPlayer`, `window.__office`.

## Global Constraints

- All Phase 1 global constraints apply.
- **Core first (owner):** Tasks 1–6 deliver join → avatar → sit at desk. Task 7 (coffee, wave, sofa, cabinet) is secondary. If time runs short, Phase 3 may start before Task 7.
- Assets are CC0 only: Kenney Furniture Kit, Quaternius Modular Men/Women Suit and the Universal Animation Library. Every shipped file is listed in `apps/web/public/assets/CREDITS.md`.
- Lead decisions closing SPEC open questions for this phase:
  - OQ-008: 2 preset avatars, `men_suit` and `women_suit`.
  - OQ-010: status is `working` while the activity is `working`, otherwise `online`. `away` is unused in P2.
  - OQ-013: the interaction distance is measured from the player to the interactable's `interactionPoint` (≤ `interactionRange`). Facing is measured toward the item `position` within a 90° cone. Ties go to the smallest angle. Moving cancels drinking and waving.
  - OQ-014: standing up returns the player to the seat's `interactionPoint`. A seat taken by another player is skipped, and the prompt says "Desk taken".
  - OQ-015: coffee or water plays `Interact` once for 2.5 s with status shown as "Break". There are no cups or items.
  - OQ-019: if `localStorage` throws, the form keeps values in memory only.
- The UAL has no wave clip. Wave is a procedural right-arm override for 1.6 s. Working reuses `Sitting_Idle_Loop` (no CC0 typing clip, per DEC). Sofa rest reuses the sit clips.
- Names render with `textContent`, never `innerHTML`.

## File structure

```
packages/protocol/src/
  identity.ts      AVATAR_IDS, normalizeOfficeCode, validateName, EmployeeIdentity
  activity.ts      Activity, ActivityEvent, nextActivity, statusFor
  seats.ts         SeatRegistry (first-come claim/release)
  interaction.ts   findInteractionTarget
  layout/layout.ts (+ interactables, seat ids, sofaSeats)
  balance.ts       (+ interaction, activity)
apps/web/
  public/assets/{furniture,avatars,anim}/*.glb, public/assets/CREDITS.md
  src/game/assets/furnitureManifest.ts   item type -> glb file
  src/game/assets/fit.ts                 pure fit math
  src/game/assets/loadFurniture.ts       swap boxes for GLBs, box fallback
  src/game/avatar/retarget.ts            copied from spike
  src/game/avatar/AvatarView.ts          model + mixer + clip per activity + wave
  src/game/interaction/InteractionController.ts
  src/game/hud/Nameplate.ts              CSS2D label
  src/ui/JoinScreen.tsx, src/ui/identityStorage.ts, src/ui/Prompt.tsx
  e2e/sit.spec.ts
```

---

### Task 1: Identity, avatar ids and layout interactables (protocol)

**Files:** Create `packages/protocol/src/identity.ts` and `test/identity.test.ts`. Modify `src/layout/layout.ts`, `test/layout.test.ts` and `src/index.ts`.

**Interfaces:**
- Produces from identity:
  - `AVATAR_IDS = ['men_suit', 'women_suit'] as const` and `type AvatarId`.
  - `normalizeOfficeCode(raw: string): string | null`. It trims and uppercases, then requires `/^[A-Z0-9-]{4,12}$/`.
  - `validateName(raw: string): string | null`. It trims and requires 1–20 visible characters (counted with `Array.from`) and rejects control characters or `<` and `>`.
  - `type EmployeeIdentity = { sessionId: string; employeeName: string; officeCode: string; avatarId: AvatarId; status: 'online' | 'working' | 'away' }`.
- Produces from layout:
  - `Workstation.seat` gains `id: string`.
  - `type SeatSocket = { id: string; position: Vec3; rotY: number; interactionPoint: Vec3 }`.
  - `type Interactable = { id: string; type: string; itemId: string; position: Vec3; interactionPoint: Vec3; interactionRange: number; workstationId?: string }`.
  - `OfficeLayout` gains `interactables: Interactable[]` and `sofaSeats: SeatSocket[]`.

- [ ] **Step 1: Failing tests**

`test/identity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AVATAR_IDS, normalizeOfficeCode, validateName } from '../src/identity';

describe('identity', () => {
  it('normalizes office codes', () => {
    expect(normalizeOfficeCode('  nozvi-01 ')).toBe('NOZVI-01');
    expect(normalizeOfficeCode('abc')).toBeNull();
    expect(normalizeOfficeCode('ABCDEFGHIJKLM')).toBeNull();
    expect(normalizeOfficeCode('AB CD')).toBeNull();
  });
  it('validates names by visible characters', () => {
    expect(validateName('  Khánh  ')).toBe('Khánh');
    expect(validateName('')).toBeNull();
    expect(validateName('a'.repeat(21))).toBeNull();
    expect(validateName('😀'.repeat(20))).toBe('😀'.repeat(20));
    expect(validateName('<b>x</b>')).toBeNull();
    expect(validateName('a\u0007b')).toBeNull();
  });
  it('lists two preset avatars', () => {
    expect(AVATAR_IDS).toEqual(['men_suit', 'women_suit']);
  });
});
```
Append to `test/layout.test.ts`:
```ts
describe('interactables', () => {
  it('exposes 22 interactables including all chairs', () => {
    expect(officeLayout.interactables).toHaveLength(22);
    expect(officeLayout.interactables.filter((i) => i.type === 'chair')).toHaveLength(8);
  });
  it('exposes two sofa seats and seat ids', () => {
    expect(officeLayout.sofaSeats.map((s) => s.id)).toEqual(['sofa_seat_1', 'sofa_seat_2']);
    expect(officeLayout.workstations[0]!.seat.id).toBe('ws_1_seat');
  });
});
```
**Run:** `pnpm --filter @office/protocol test`. Expected: FAIL.

- [ ] **Step 2: Implement `identity.ts`**

```ts
export const AVATAR_IDS = ['men_suit', 'women_suit'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export type EmployeeIdentity = {
  sessionId: string;
  employeeName: string;
  officeCode: string;
  avatarId: AvatarId;
  status: 'online' | 'working' | 'away';
};

export function normalizeOfficeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{4,12}$/.test(code) ? code : null;
}

// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f<>]/;

export function validateName(raw: string): string | null {
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > 20 || FORBIDDEN.test(name)) return null;
  return name;
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value);
}
```

- [ ] **Step 3: Extend `layout.ts`**

Add these types after `Workstation`, and change `Workstation`'s seat to `{ id: string; position: Vec3; rotY: number }`:
```ts
export type SeatSocket = { id: string; position: Vec3; rotY: number; interactionPoint: Vec3 };
export type Interactable = {
  id: string; type: string; itemId: string; position: Vec3;
  interactionPoint: Vec3; interactionRange: number; workstationId?: string;
};
```
Add `interactables: Interactable[]; sofaSeats: SeatSocket[];` to `OfficeLayout`. In `parseLayout`, add `'interactables'` to `required`. Map the workstation seat as `{ id: seat.id, position: seat.position, rotY: seat.rotY }`, with the cast type including `id: string`. Then add:
```ts
const interactables = (input.interactables as Record<string, unknown>[]).map((i) => {
  const out: Interactable = {
    id: i.id as string, type: i.type as string, itemId: i.itemId as string,
    position: i.position as Vec3, interactionPoint: i.interactionPoint as Vec3,
    interactionRange: i.interactionRange as number,
  };
  if (typeof i.workstationId === 'string') out.workstationId = i.workstationId;
  return out;
});
const sofaSeats = (input.items as Record<string, unknown>[])
  .flatMap((item) => (Array.isArray(item.seatSockets) ? (item.seatSockets as SeatSocket[]) : []))
  .map((s) => ({ id: s.id, position: s.position, rotY: s.rotY, interactionPoint: s.interactionPoint }));
```
Return both in the result. Export `identity` from `src/index.ts`.

- [ ] **Step 4: Verify** with **Run:** `pnpm --filter @office/protocol test` and `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(protocol): add identity validation, avatar ids and layout interactables`

---

### Task 2: Activity state machine, seats and interaction targeting (protocol)

**Files:** Create `packages/protocol/src/activity.ts`, `src/seats.ts`, `src/interaction.ts` and `test/{activity,seats,interaction}.test.ts`. Modify `src/balance.ts` and `src/index.ts`.

**Interfaces:**
- Produces from activity:
  - `type Activity = 'idle' | 'walking' | 'sitting' | 'working' | 'resting' | 'drinking' | 'waving'`.
  - `type ActivityEvent = { type: 'move' } | { type: 'stop' } | { type: 'sit'; kind: 'desk' | 'sofa' } | { type: 'toggleWork' } | { type: 'stand' } | { type: 'drink' } | { type: 'wave' } | { type: 'actionDone' }`.
  - `nextActivity(a: Activity, e: ActivityEvent): Activity`, `isSeated(a: Activity): boolean` and `statusFor(a: Activity): 'online' | 'working'`.
- Produces from seats: `class SeatRegistry { claim(seatId: string, ownerId: string): boolean; release(ownerId: string): string | null; occupant(seatId: string): string | null; seatOf(ownerId: string): string | null }`.
- Produces from interaction: `findInteractionTarget(player: PlayerState, candidates: readonly Interactable[], coneDeg?: number): Interactable | null`.
- `BALANCE` gains `interaction: { facingConeDeg: 90 }` and `activity: { drinkSeconds: 2.5, waveSeconds: 1.6, crossFadeSeconds: 0.25 }`.

- [ ] **Step 1: Failing tests**

`test/activity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isSeated, nextActivity, statusFor } from '../src/activity';

describe('activity', () => {
  it('walks and stops', () => {
    expect(nextActivity('idle', { type: 'move' })).toBe('walking');
    expect(nextActivity('walking', { type: 'stop' })).toBe('idle');
  });
  it('sits at a desk, toggles work, stands', () => {
    const s = nextActivity('idle', { type: 'sit', kind: 'desk' });
    expect(s).toBe('sitting');
    expect(nextActivity(s, { type: 'toggleWork' })).toBe('working');
    expect(nextActivity('working', { type: 'toggleWork' })).toBe('sitting');
    expect(nextActivity('working', { type: 'stand' })).toBe('idle');
  });
  it('rests on the sofa', () => {
    expect(nextActivity('walking', { type: 'sit', kind: 'sofa' })).toBe('resting');
    expect(nextActivity('resting', { type: 'toggleWork' })).toBe('resting');
  });
  it('ignores moves while seated (caller must stand first)', () => {
    expect(nextActivity('sitting', { type: 'move' })).toBe('sitting');
  });
  it('drinks and waves, moving cancels, actionDone ends', () => {
    expect(nextActivity('idle', { type: 'drink' })).toBe('drinking');
    expect(nextActivity('drinking', { type: 'move' })).toBe('walking');
    expect(nextActivity('idle', { type: 'wave' })).toBe('waving');
    expect(nextActivity('waving', { type: 'actionDone' })).toBe('idle');
    expect(nextActivity('sitting', { type: 'wave' })).toBe('sitting');
  });
  it('maps status', () => {
    expect(statusFor('working')).toBe('working');
    expect(statusFor('resting')).toBe('online');
    expect(isSeated('resting')).toBe(true);
    expect(isSeated('drinking')).toBe(false);
  });
});
```
`test/seats.test.ts`:
```ts
import { expect, it } from 'vitest';
import { SeatRegistry } from '../src/seats';

it('claims first-come and releases', () => {
  const seats = new SeatRegistry();
  expect(seats.claim('ws_1_seat', 'a')).toBe(true);
  expect(seats.claim('ws_1_seat', 'b')).toBe(false);
  expect(seats.occupant('ws_1_seat')).toBe('a');
  expect(seats.claim('ws_2_seat', 'a')).toBe(false); // one seat per owner
  expect(seats.release('a')).toBe('ws_1_seat');
  expect(seats.claim('ws_1_seat', 'b')).toBe(true);
  expect(seats.seatOf('b')).toBe('ws_1_seat');
});
```
`test/interaction.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { findInteractionTarget } from '../src/interaction';
import { officeLayout } from '../src/layout/layout';

const chairs = officeLayout.interactables.filter((i) => i.type === 'chair');
const N = Math.PI; // heading toward -Z
const S = 0;

describe('findInteractionTarget', () => {
  it('picks ws_1 when facing north from the shared approach point', () => {
    const t = findInteractionTarget({ x: -3.4, z: 2.05, heading: N }, chairs);
    expect(t?.id).toBe('ws_1_chair');
  });
  it('picks ws_3 when facing south from the same point', () => {
    const t = findInteractionTarget({ x: -3.4, z: 2.05, heading: S }, chairs);
    expect(t?.id).toBe('ws_3_chair');
  });
  it('returns null when out of range', () => {
    expect(findInteractionTarget({ x: 4, z: -3, heading: S }, chairs)).toBeNull();
  });
  it('returns null when facing away', () => {
    const door = officeLayout.interactables.filter((i) => i.type === 'main_door');
    expect(findInteractionTarget({ x: -0.4, z: -3, heading: S }, door)).toBeNull();
    expect(findInteractionTarget({ x: -0.4, z: -3, heading: N }, door)?.id).toBe('main_door');
  });
});
```
**Run:** `pnpm --filter @office/protocol test`. Expected: FAIL.

- [ ] **Step 2: Implement**

`balance.ts`: add these to `BALANCE`:
```ts
interaction: { facingConeDeg: 90 },
activity: { drinkSeconds: 2.5, waveSeconds: 1.6, crossFadeSeconds: 0.25 },
```
`activity.ts`:
```ts
export type Activity = 'idle' | 'walking' | 'sitting' | 'working' | 'resting' | 'drinking' | 'waving';
export type ActivityEvent =
  | { type: 'move' } | { type: 'stop' } | { type: 'sit'; kind: 'desk' | 'sofa' }
  | { type: 'toggleWork' } | { type: 'stand' } | { type: 'drink' } | { type: 'wave' } | { type: 'actionDone' };

const SEATED: ReadonlySet<Activity> = new Set(['sitting', 'working', 'resting']);
const FREE: ReadonlySet<Activity> = new Set(['idle', 'walking']);

export const isSeated = (a: Activity): boolean => SEATED.has(a);
export const statusFor = (a: Activity): 'online' | 'working' => (a === 'working' ? 'working' : 'online');

export function nextActivity(a: Activity, e: ActivityEvent): Activity {
  switch (e.type) {
    case 'move':
      return isSeated(a) ? a : 'walking';
    case 'stop':
      return a === 'walking' ? 'idle' : a;
    case 'sit':
      return FREE.has(a) ? (e.kind === 'desk' ? 'sitting' : 'resting') : a;
    case 'toggleWork':
      return a === 'sitting' ? 'working' : a === 'working' ? 'sitting' : a;
    case 'stand':
      return isSeated(a) ? 'idle' : a;
    case 'drink':
      return FREE.has(a) ? 'drinking' : a;
    case 'wave':
      return FREE.has(a) ? 'waving' : a;
    case 'actionDone':
      return a === 'drinking' || a === 'waving' ? 'idle' : a;
  }
}
```
`seats.ts`:
```ts
export class SeatRegistry {
  private readonly bySeat = new Map<string, string>();
  private readonly byOwner = new Map<string, string>();

  claim(seatId: string, ownerId: string): boolean {
    if (this.bySeat.has(seatId) || this.byOwner.has(ownerId)) return false;
    this.bySeat.set(seatId, ownerId);
    this.byOwner.set(ownerId, seatId);
    return true;
  }
  release(ownerId: string): string | null {
    const seat = this.byOwner.get(ownerId);
    if (seat === undefined) return null;
    this.byOwner.delete(ownerId);
    this.bySeat.delete(seat);
    return seat;
  }
  occupant(seatId: string): string | null {
    return this.bySeat.get(seatId) ?? null;
  }
  seatOf(ownerId: string): string | null {
    return this.byOwner.get(ownerId) ?? null;
  }
}
```
`interaction.ts`:
```ts
import { BALANCE } from './balance';
import type { Interactable } from './layout/layout';
import type { PlayerState } from './movement';

export function findInteractionTarget(
  player: PlayerState,
  candidates: readonly Interactable[],
  coneDeg: number = BALANCE.interaction.facingConeDeg,
): Interactable | null {
  const half = ((coneDeg / 2) * Math.PI) / 180;
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  let best: Interactable | null = null;
  let bestAngle = Infinity;
  for (const c of candidates) {
    const [ix, , iz] = c.interactionPoint;
    if (Math.hypot(ix - player.x, iz - player.z) > c.interactionRange) continue;
    const dx = c.position[0] - player.x, dz = c.position[2] - player.z;
    const len = Math.hypot(dx, dz);
    const angle = len < 1e-6 ? 0 : Math.acos(Math.min(1, Math.max(-1, (dx * fx + dz * fz) / len)));
    if (angle <= half && angle < bestAngle) {
      best = c;
      bestAngle = angle;
    }
  }
  return best;
}
```
Export all three from `src/index.ts`.

- [ ] **Step 3: Verify** with **Run:** `pnpm --filter @office/protocol test` and `pnpm check`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(protocol): add activity state machine, seat registry and interaction targeting`

---

### Task 3: CC0 furniture assets fitted to the layout

**Files:** Create `apps/web/public/assets/furniture/*.glb`, `public/assets/CREDITS.md`, `src/game/assets/furnitureManifest.ts`, `src/game/assets/fit.ts`, `src/game/assets/loadFurniture.ts` and `test/fit.test.ts`. Modify `src/game/Game.ts`.

**Interfaces:**
- Produces:
  - `FURNITURE: Record<string, string>`, mapping a layout item type to a file under `/assets/furniture/`.
  - `fitScale(modelSize: [number, number, number], target: [number, number, number]): [number, number, number]`.
  - `loadFurniture(room: THREE.Group, layout: OfficeLayout): Promise<{ loaded: number; failed: string[] }>`. It replaces box meshes in place, keeps the same `name`, sets `userData.occluder` and keeps the box when a load fails.

- [ ] **Step 1: Copy assets (agy, local files from the gitignored spike)**

**Run:**
```
mkdir -p apps/web/public/assets/furniture
cd "spike/assets/kenney_furniture/Models/GLTF format"
cp desk.glb chairDesk.glb computerScreen.glb kitchenFridge.glb kitchenCabinet.glb kitchenCoffeeMachine.glb \
   bookcaseClosedDoors.glb bookcaseOpen.glb cardboardBoxClosed.glb pottedPlant.glb loungeSofaLong.glb \
   tableCoffee.glb televisionModern.glb speaker.glb lampSquareFloor.glb doorway.glb coatRack.glb \
   ../../../../../apps/web/public/assets/furniture/
cp ../../License.txt ../../../../../apps/web/public/assets/furniture/KENNEY-LICENSE.txt
```
Then confirm that `ls apps/web/public/assets/furniture | wc -l` prints 18.

`apps/web/public/assets/CREDITS.md`:
```md
# Asset credits (all CC0 1.0)
- furniture/*.glb — Kenney Furniture Kit, https://kenney.nl (KENNEY-LICENSE.txt)
- avatars/*.glb — Quaternius Modular Men / Women (Suit), https://quaternius.com
- anim/*.glb — Quaternius Universal Animation Library, https://quaternius.com
```

- [ ] **Step 2: Manifest**

```ts
export const FURNITURE: Record<string, string> = {
  desk: 'desk.glb',
  chair: 'chairDesk.glb',
  fridge: 'kitchenFridge.glb',
  countertop: 'kitchenCabinet.glb',
  water_dispenser: 'kitchenCabinet.glb',
  storage_cabinet: 'bookcaseClosedDoors.glb',
  lockers: 'bookcaseClosedDoors.glb',
  shelves: 'bookcaseOpen.glb',
  plant: 'pottedPlant.glb',
  shoe_rack: 'coatRack.glb',
  sofa: 'loungeSofaLong.glb',
  coffee_table: 'tableCoffee.glb',
  TV: 'televisionModern.glb',
  decorative_lighting: 'lampSquareFloor.glb',
};
// Not listed (kept as palette boxes): main_door, utility_door, air_conditioner.
export const DESK_SCREEN = 'computerScreen.glb';
export const COFFEE_MACHINE = 'kitchenCoffeeMachine.glb';
```

- [ ] **Step 3: Failing fit test**

```ts
import { expect, it } from 'vitest';
import { fitScale } from '../src/game/assets/fit';

it('scales each world axis to the target extent', () => {
  expect(fitScale([2, 1, 4], [1, 1, 1])).toEqual([0.5, 1, 0.25]);
});
it('guards zero-size axes', () => {
  expect(fitScale([0, 1, 1], [1, 2, 1])).toEqual([1, 2, 1]);
});
```
**Run:** `pnpm --filter @office/web test`. Expected: FAIL.

- [ ] **Step 4: Implement `fit.ts` and `loadFurniture.ts`**

`fit.ts`:
```ts
export function fitScale(model: [number, number, number], target: [number, number, number]): [number, number, number] {
  return [0, 1, 2].map((i) => (model[i]! > 1e-6 ? target[i]! / model[i]! : 1)) as [number, number, number];
}
```
`loadFurniture.ts`:
```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { LayoutBox, OfficeLayout } from '@office/protocol';
import { FURNITURE } from './furnitureManifest';
import { fitScale } from './fit';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

function load(file: string): Promise<THREE.Group> {
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(`/assets/furniture/${file}`).then((g) => g.scene);
    cache.set(file, p);
  }
  return p;
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
  wrapper.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.occluder = true;
    }
  });
  return wrapper;
}

export async function loadFurniture(room: THREE.Group, layout: OfficeLayout) {
  const failed: string[] = [];
  let loaded = 0;
  await Promise.all(
    layout.items.map(async (item) => {
      const file = FURNITURE[item.type];
      if (!file) return;
      try {
        const source = await load(file);
        const rotY = (item as LayoutBox & { rotY?: number }).rotY ?? 0;
        const box = room.getObjectByName(item.id);
        if (!box) return;
        room.remove(box);
        room.add(fitModel(source, item, rotY));
        loaded++;
      } catch {
        failed.push(item.id);
      }
    }),
  );
  return { loaded, failed };
}
```
Add `rotY?: number` to `LayoutBox` in `packages/protocol/src/layout/layout.ts`. With that, the cast is no longer needed, so use `item.rotY ?? 0`.

In `Game.ts`, after building the room, call `void loadFurniture(room, officeLayout).then((r) => { this.furniture = r; })`. Expose `getFurniture: () => this.furniture` in the dev hook. Rebuild the occluder list after the load, because occluders are read by reference: replace the `occluders` array contents with a fresh traverse.

- [ ] **Step 5: Verify**

**Run:** `pnpm --filter @office/web test` and `pnpm check`. Expected: PASS.
**Run (agy):** start the dev server and wait until `window.__office.getFurniture()` is defined. Report `loaded` and `failed`; expect `failed: []`. Save Playwright screenshots of the Workstation, Pantry and Entertainment zones to `apps/web/test-results/task3-*.png`. **Lead review:** furniture orientation must match the seat directions (chairs face their desks, the sofa faces the TV). If a model faces the wrong way, add an entry `MODEL_YAW_OFFSET: Record<string, number>` in the manifest and add it to `rotY`, then re-shoot.

- [ ] **Step 6: Commit** `feat(web): replace layout boxes with fitted CC0 furniture`

---

### Task 4: Quaternius avatar with retargeted animation

**Files:** Copy `spike/poc/avatar/src/retarget.ts` to `apps/web/src/game/avatar/retarget.ts`. Copy the models to `apps/web/public/assets/avatars/` and the animation library to `public/assets/anim/`. Create `src/game/avatar/AvatarView.ts` and `test/avatarClips.test.ts`. Modify `src/game/player.ts` and `src/game/Game.ts`.

**Interfaces:**
- Consumes `retargetClipFromRestPose(target, source, clip, isFemale)` and `findSkinnedMesh(root)` from the copied file.
- Produces:
  - `CLIP_FOR: Record<Activity, { clip: string; loop: boolean }>`, exported for the test.
  - `class AvatarView { readonly root: THREE.Group; static load(avatarId: AvatarId): Promise<AvatarView>; setActivity(a: Activity): void; update(dt: number): void; hasFiniteBones(): boolean }`.
  - `Player` gains `activity: Activity`, `setView(view: AvatarView)` and `seatAt(socket: { position: Vec3; rotY: number })`.

- [ ] **Step 1: Copy files (agy)**

**Run:**
```
mkdir -p apps/web/src/game/avatar apps/web/public/assets/avatars apps/web/public/assets/anim
cp spike/poc/avatar/src/retarget.ts apps/web/src/game/avatar/retarget.ts
cp spike/poc/avatar/public/models/quaternius_modular_men_Suit.glb apps/web/public/assets/avatars/men_suit.glb
cp spike/poc/avatar/public/models/quaternius_modular_women_Suit.glb apps/web/public/assets/avatars/women_suit.glb
cp spike/poc/avatar/public/models/AnimationLibrary_Godot_Standard.glb apps/web/public/assets/anim/ual.glb
```
Codex then adds `// Ported from spike/poc/avatar/src/retarget.ts (validated in PoC, see DECISIONS).` as line 1 and fixes only lint and strict-type errors. The retargeting logic is not changed.

- [ ] **Step 2: Failing test** (`test/avatarClips.test.ts`)

```ts
import { expect, it } from 'vitest';
import { CLIP_FOR } from '../src/game/avatar/AvatarView';

const UAL = ['Idle_Loop', 'Walk_Loop', 'Sitting_Enter', 'Sitting_Exit', 'Sitting_Idle_Loop', 'Interact'];

it('maps every activity to a UAL clip that exists', () => {
  for (const a of ['idle', 'walking', 'sitting', 'working', 'resting', 'drinking', 'waving'] as const) {
    expect(UAL).toContain(CLIP_FOR[a].clip);
  }
});
```
**Run:** `pnpm --filter @office/web test`. Expected: FAIL.

- [ ] **Step 3: Implement `AvatarView.ts`**

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BALANCE, type Activity, type AvatarId } from '@office/protocol';
import { findSkinnedMesh, retargetClipFromRestPose } from './retarget';

export const CLIP_FOR: Record<Activity, { clip: string; loop: boolean }> = {
  idle: { clip: 'Idle_Loop', loop: true },
  walking: { clip: 'Walk_Loop', loop: true },
  sitting: { clip: 'Sitting_Idle_Loop', loop: true },
  working: { clip: 'Sitting_Idle_Loop', loop: true },
  resting: { clip: 'Sitting_Idle_Loop', loop: true },
  drinking: { clip: 'Interact', loop: false },
  waving: { clip: 'Idle_Loop', loop: true }, // arm is overridden procedurally
};

const loader = new GLTFLoader();
let ualPromise: Promise<{ mesh: THREE.SkinnedMesh; clips: THREE.AnimationClip[] }> | null = null;
function loadUal() {
  ualPromise ??= loader.loadAsync('/assets/anim/ual.glb').then((g) => {
    const mesh = findSkinnedMesh(g.scene);
    if (!mesh) throw new Error('UAL skinned mesh missing');
    return { mesh, clips: g.animations };
  });
  return ualPromise;
}

export class AvatarView {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private activity: Activity = 'idle';
  private waveTime = 0;

  private constructor(model: THREE.Object3D, private readonly bones: THREE.Bone[], clips: THREE.AnimationClip[]) {
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle');
  }

  static async load(avatarId: AvatarId): Promise<AvatarView> {
    const [gltf, ual] = await Promise.all([loader.loadAsync(`/assets/avatars/${avatarId}.glb`), loadUal()]);
    const target = findSkinnedMesh(gltf.scene);
    if (!target) throw new Error(`No skinned mesh in ${avatarId}`);
    target.skeleton.pose();
    const names = new Set(Object.values(CLIP_FOR).map((c) => c.clip).concat('Sitting_Enter', 'Sitting_Exit'));
    const clips = ual.clips
      .filter((c) => names.has(c.name))
      .map((c) => retargetClipFromRestPose(target, ual.mesh, c, avatarId === 'women_suit'));
    gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    return new AvatarView(gltf.scene, target.skeleton.bones, clips);
  }

  setActivity(a: Activity): void {
    if (a === this.activity) return;
    const wasSeated = this.activity === 'sitting' || this.activity === 'working' || this.activity === 'resting';
    const seated = a === 'sitting' || a === 'working' || a === 'resting';
    this.activity = a;
    if (a === 'waving') this.waveTime = BALANCE.activity.waveSeconds;
    if (seated && !wasSeated) this.playOnce('Sitting_Enter', a);
    else if (!seated && wasSeated) this.playOnce('Sitting_Exit', a);
    else this.play(a);
  }

  private play(a: Activity): void {
    const spec = CLIP_FOR[a];
    this.fadeTo(spec.clip, spec.loop);
  }

  private playOnce(clip: string, then: Activity): void {
    const action = this.fadeTo(clip, false);
    if (!action) return this.play(then);
    const onDone = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== action) return;
      this.mixer.removeEventListener('finished', onDone);
      if (this.activity === then) this.play(then);
    };
    this.mixer.addEventListener('finished', onDone);
  }

  private fadeTo(clip: string, loop: boolean): THREE.AnimationAction | null {
    const next = this.actions.get(clip);
    if (!next) return null;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, BALANCE.activity.crossFadeSeconds, false);
    this.current = next;
    return next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    if (this.activity === 'waving' && this.waveTime > 0) {
      this.waveTime -= dt;
      const arm = this.bones.find((b) => b.name === 'UpperArmR');
      const fore = this.bones.find((b) => b.name === 'LowerArmR');
      const t = performance.now() / 1000;
      if (arm) arm.rotation.set(0, 0, -2.4);
      if (fore) fore.rotation.set(0, 0, -0.4 + Math.sin(t * 10) * 0.4);
    }
  }

  hasFiniteBones(): boolean {
    return this.bones.every((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.w].every(Number.isFinite));
  }
}
```

- [ ] **Step 4: Player uses the avatar**

In `player.ts`:
- Keep the capsule as a placeholder until `setView` is called. `setView(view)` removes the capsule children and adds `view.root`.
- Add `activity: Activity = 'idle'` and `private view: AvatarView | null = null`.
- Add `private seated: { position: Vec3; rotY: number } | null = null`.
- `seatAt(socket)` stores the socket, sets `state.x = socket.position[0]`, `state.z = socket.position[2]` and `state.heading = socket.rotY * Math.PI / 180`, then calls `sync()`.
- `standAt(point: Vec3)` clears `seated`, puts the state at `point`, and keeps the heading.
- Add `setActivity(a)`, which sets `this.activity` and calls `this.view?.setActivity(a)`.
- `update(input, yaw, dt)`:
```ts
const moving = input.forward !== 0 || input.right !== 0;
if (!this.seated) {
  this.state = stepPlayer(this.state, input, yaw, dt, officeLayout.colliders);
  if (this.activity !== 'drinking' || moving) {
    this.setActivity(nextActivity(this.activity, { type: moving ? 'move' : 'stop' }));
  }
}
this.view?.update(dt);
this.sync();
```
The mesh root stays at y = 0 when seated. DEC says `Sitting_Idle_Loop` aligns with a 0.45 m seat when the root is on the floor below the seat socket.

In `Game.ts`, take `avatarId: AvatarId` as a second constructor parameter, then call `void AvatarView.load(avatarId).then((v) => this.player.setView(v))`. Add `getActivity: () => this.player.activity` and `avatarOk: () => this.player.viewFinite()` to the dev hook. `viewFinite()` returns `view?.hasFiniteBones() ?? false`. `App.tsx` passes `'men_suit'` until Task 6.

- [ ] **Step 5: Verify**

**Run:** `pnpm --filter @office/web test` and `pnpm check`. Expected: PASS.
**Run (agy):** for each of `men_suit` and `women_suit` (temporarily switch the id in `App.tsx`, then revert), wait 3 s after load, walk with W for 1 s, and assert that `window.__office.avatarOk()` is `true`. Save screenshots `task4-<id>-idle.png` and `task4-<id>-walk.png`. **Lead review:** the avatar is upright, the feet are on the floor, the walk cycle is visible and there are no stretched limbs.

- [ ] **Step 6: Commit** `feat(web): add Quaternius avatars with retargeted UAL animation`

---

### Task 5: Interaction controller — sit at desk, work, stand (core)

**Files:** Create `apps/web/src/game/interaction/InteractionController.ts`, `src/ui/Prompt.tsx` and `test/interactionController.test.ts`. Modify `src/game/Game.ts` and `src/App.tsx`.

**Interfaces:**
- Consumes `findInteractionTarget`, `SeatRegistry`, `nextActivity`, `isSeated`, `officeLayout` and `Player`.
- Produces:
  - `type Prompt = { text: string; available: boolean } | null`.
  - `class InteractionController { constructor(player: Player, seats: SeatRegistry, ownerId: string, hooks: { onExit(): void }); currentPrompt(): Prompt; press(): void; onMoveIntent(): void }`.
  - `Game` gains `onPrompt?: (p: Prompt) => void`, which is called only when the prompt text changes, and `onExit?: () => void`.
  - The `E` key calls `controller.press()`. Any WASD key while seated calls `controller.onMoveIntent()`, which stands the player up.

Prompt text per state:

| State | Prompt |
|---|---|
| Free chair in range and facing | `E — Sit` |
| Taken chair | `Desk taken` (available `false`) |
| Seated at a desk | `E — Start working` or `E — Stop working`, plus the hint `WASD — Stand up` |
| Main door | `E — Leave office` |
| Coffee machine or water | `E — Take a break` |
| Sofa | `E — Rest` |
| Storage cabinet | `E — Open cabinet` |

Task 7 implements the effects for the last three. Until then their `press()` does nothing.

- [ ] **Step 1: Failing test** (pure, with a fake player)

```ts
import { describe, expect, it, vi } from 'vitest';
import { SeatRegistry, officeLayout, type Activity, type PlayerState, type Vec3 } from '@office/protocol';
import { InteractionController } from '../src/game/interaction/InteractionController';

function fakePlayer(state: PlayerState) {
  return {
    state,
    activity: 'idle' as Activity,
    seatedAt: null as Vec3 | null,
    setActivity(a: Activity) { this.activity = a; },
    seatAt(s: { position: Vec3; rotY: number }) { this.seatedAt = s.position; this.state = { x: s.position[0], z: s.position[2], heading: (s.rotY * Math.PI) / 180 }; },
    standAt(p: Vec3) { this.seatedAt = null; this.state = { ...this.state, x: p[0], z: p[2] }; },
  };
}

describe('InteractionController', () => {
  it('sits at the faced free desk, toggles work and stands', () => {
    const p = fakePlayer({ x: 0.4, z: 2.05, heading: Math.PI });
    const c = new InteractionController(p, new SeatRegistry(), 'me', { onExit: vi.fn() });
    expect(c.currentPrompt()?.text).toBe('E — Sit');
    c.press();
    expect(p.activity).toBe('sitting');
    expect(p.seatedAt).toEqual(officeLayout.workstations.find((w) => w.id === 'ws_5')!.seat.position);
    c.press();
    expect(p.activity).toBe('working');
    c.onMoveIntent();
    expect(p.activity).toBe('idle');
    expect([p.state.x, p.state.z]).toEqual([0.4, 2.05]);
  });
  it('refuses a taken desk', () => {
    const seats = new SeatRegistry();
    seats.claim('ws_5_seat', 'other');
    const p = fakePlayer({ x: 0.4, z: 2.05, heading: Math.PI });
    const c = new InteractionController(p, seats, 'me', { onExit: vi.fn() });
    expect(c.currentPrompt()).toEqual({ text: 'Desk taken', available: false });
    c.press();
    expect(p.activity).toBe('idle');
  });
  it('leaves through the main door', () => {
    const onExit = vi.fn();
    const p = fakePlayer({ x: -0.4, z: -3, heading: Math.PI });
    new InteractionController(p, new SeatRegistry(), 'me', { onExit }).press();
    expect(onExit).toHaveBeenCalledOnce();
  });
});
```
**Run:** `pnpm --filter @office/web test`. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
import {
  findInteractionTarget, isSeated, nextActivity, officeLayout,
  type Activity, type Interactable, type PlayerState, type SeatRegistry, type Vec3,
} from '@office/protocol';

export type Prompt = { text: string; available: boolean } | null;
type Seat = { id: string; position: Vec3; rotY: number; interactionPoint: Vec3 };
export interface PlayerLike {
  state: PlayerState;
  activity: Activity;
  setActivity(a: Activity): void;
  seatAt(s: { position: Vec3; rotY: number }): void;
  standAt(p: Vec3): void;
}

const LABELS: Record<string, string> = {
  main_door: 'E — Leave office',
  coffee_machine: 'E — Take a break',
  water_dispenser: 'E — Take a break',
  sofa: 'E — Rest',
  storage_cabinet: 'E — Open cabinet',
};
const TARGETS = officeLayout.interactables.filter((i) => i.type !== 'computer' && i.type !== 'TV');

function deskSeat(target: Interactable): Seat | null {
  const ws = officeLayout.workstations.find((w) => w.id === target.workstationId);
  return ws ? { ...ws.seat, interactionPoint: ws.interactionPoint } : null;
}

export class InteractionController {
  private seat: Seat | null = null;

  constructor(
    private readonly player: PlayerLike,
    private readonly seats: SeatRegistry,
    private readonly ownerId: string,
    private readonly hooks: { onExit(): void; onAction?(target: Interactable): void },
  ) {}

  private target(): Interactable | null {
    return findInteractionTarget(this.player.state, TARGETS);
  }

  currentPrompt(): Prompt {
    const a = this.player.activity;
    if (a === 'sitting') return { text: 'E — Start working · WASD — Stand up', available: true };
    if (a === 'working') return { text: 'E — Stop working · WASD — Stand up', available: true };
    if (a === 'resting') return { text: 'WASD — Stand up', available: true };
    const t = this.target();
    if (!t) return null;
    if (t.type === 'chair') {
      const seat = deskSeat(t);
      if (!seat) return null;
      return this.seats.occupant(seat.id) ? { text: 'Desk taken', available: false } : { text: 'E — Sit', available: true };
    }
    const label = LABELS[t.type];
    return label ? { text: label, available: true } : null;
  }

  press(): void {
    const a = this.player.activity;
    if (a === 'sitting' || a === 'working') {
      this.player.setActivity(nextActivity(a, { type: 'toggleWork' }));
      return;
    }
    if (isSeated(a)) return;
    const t = this.target();
    if (!t) return;
    if (t.type === 'chair') {
      const seat = deskSeat(t);
      if (!seat || !this.seats.claim(seat.id, this.ownerId)) return;
      this.seat = seat;
      this.player.seatAt(seat);
      this.player.setActivity(nextActivity(a, { type: 'sit', kind: 'desk' }));
      return;
    }
    if (t.type === 'main_door') {
      this.hooks.onExit();
      return;
    }
    this.hooks.onAction?.(t);
  }

  /** Called by Task 7 to seat the player on a sofa socket. */
  sitOn(seat: Seat, kind: 'desk' | 'sofa'): boolean {
    if (!this.seats.claim(seat.id, this.ownerId)) return false;
    this.seat = seat;
    this.player.seatAt(seat);
    this.player.setActivity(nextActivity(this.player.activity, { type: 'sit', kind }));
    return true;
  }

  onMoveIntent(): void {
    if (!isSeated(this.player.activity) || !this.seat) return;
    this.seats.release(this.ownerId);
    this.player.standAt(this.seat.interactionPoint);
    this.seat = null;
    this.player.setActivity(nextActivity(this.player.activity, { type: 'stand' }));
  }
}
```
The test expects the prompt `E — Sit` for a free chair. The seated prompts combine both hints into one line, as written in the code above.

- [ ] **Step 3: Wire into `Game.ts` and `App.tsx`**

`Game.ts`:
- Create `readonly seats = new SeatRegistry()` and the controller with owner id `'local'`.
- Pass `hooks.onExit = () => this.onExit?.()`.
- In the frame loop, before `player.update`: if the player is seated and the input has movement, call `controller.onMoveIntent()`.
- After `player.update`: compute `controller.currentPrompt()` and call `onPrompt` when the text changes.
- Add `keydown` for `KeyE` (ignoring `e.repeat`), which calls `controller.press()`. Remove the listener in `dispose()`.
- Add `teleport(x, z, heading)` to the dev hook so e2e tests can set the player state.

`Player.seatAt` and `Player.standAt` are implemented as described in Task 4. `Player` satisfies `PlayerLike`.

`Prompt.tsx`:
```tsx
import type { Prompt as P } from '../game/interaction/InteractionController';
export function Prompt({ prompt }: { prompt: P }) {
  if (!prompt) return null;
  return (
    <div data-testid="prompt" style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      padding: '8px 16px', borderRadius: 8, background: 'rgba(34,36,38,0.8)', color: prompt.available ? '#fff' : '#f5a3a3',
      font: '600 15px system-ui' }}>{prompt.text}</div>
  );
}
```
`App.tsx`: hold `const [prompt, setPrompt] = useState<P>(null)`, set `game.onPrompt = setPrompt`, and render `<Prompt prompt={prompt} />` over the canvas host (`position: relative` wrapper).

- [ ] **Step 4: Verify**

**Run:** `pnpm --filter @office/web test` and `pnpm check`. Expected: PASS.
**Run (agy):** in the dev app, `teleport(0.4, 2.05, Math.PI)`, press E, wait 2 s and screenshot `task5-seated.png`. Press E again and screenshot `task5-working.png`. Press W and screenshot `task5-stood.png`. Report `getActivity()` after each step: expect `sitting`, `working`, `idle`.
**Lead review:** the avatar sits on the ws_5 chair facing the desk, the hips sit on the seat and nothing sinks through the chair.

- [ ] **Step 5: Commit** `feat(web): sit at a free desk, toggle work and stand with E/WASD`

---

### Task 6: Join screen, identity storage, nameplate and exit

**Files:** Create `apps/web/src/ui/JoinScreen.tsx`, `src/ui/identityStorage.ts`, `src/game/hud/Nameplate.ts` and `test/identityStorage.test.ts`. Modify `src/App.tsx` and `src/game/Game.ts`.

**Interfaces:**
- Produces:
  - `type JoinDraft = { name: string; officeCode: string; avatarId: AvatarId }`.
  - `loadDraft(storage: Pick<Storage, 'getItem'> | null): JoinDraft`.
  - `saveDraft(storage: Pick<Storage, 'setItem'> | null, d: JoinDraft): void`. Both swallow storage errors.
  - `safeLocalStorage(): Storage | null`.
  - `class Nameplate { readonly object: CSS2DObject; set(name: string, status: string): void }`.
  - `Game` constructor becomes `(host, identity: { name: string; avatarId: AvatarId })`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from '../src/ui/identityStorage';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('identityStorage', () => {
  it('round-trips a draft', () => {
    const s = mem();
    saveDraft(s, { name: 'An', officeCode: 'NOZVI', avatarId: 'women_suit' });
    expect(loadDraft(s)).toEqual({ name: 'An', officeCode: 'NOZVI', avatarId: 'women_suit' });
  });
  it('falls back to defaults on missing, corrupt or throwing storage', () => {
    const def = { name: '', officeCode: '', avatarId: 'men_suit' };
    expect(loadDraft(null)).toEqual(def);
    expect(loadDraft({ getItem: () => '{bad' })).toEqual(def);
    expect(loadDraft({ getItem: () => { throw new Error('denied'); } })).toEqual(def);
    expect(loadDraft({ getItem: () => JSON.stringify({ name: 'x', officeCode: 'y', avatarId: 'robot' }) }).avatarId).toBe('men_suit');
    expect(() => saveDraft({ setItem: () => { throw new Error('quota'); } }, def as never)).not.toThrow();
  });
});
```
**Run:** `pnpm --filter @office/web test`. Expected: FAIL.

- [ ] **Step 2: Implement `identityStorage.ts`**

```ts
import { isAvatarId, type AvatarId } from '@office/protocol';

export type JoinDraft = { name: string; officeCode: string; avatarId: AvatarId };
const KEY = 'office.identity';
const DEFAULT: JoinDraft = { name: '', officeCode: '', avatarId: 'men_suit' };

export function safeLocalStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function loadDraft(storage: Pick<Storage, 'getItem'> | null): JoinDraft {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const v = JSON.parse(raw) as Partial<Record<keyof JoinDraft, unknown>>;
    return {
      name: typeof v.name === 'string' ? v.name : '',
      officeCode: typeof v.officeCode === 'string' ? v.officeCode : '',
      avatarId: isAvatarId(v.avatarId) ? v.avatarId : 'men_suit',
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveDraft(storage: Pick<Storage, 'setItem'> | null, d: JoinDraft): void {
  try { storage?.setItem(KEY, JSON.stringify(d)); } catch { /* storage unavailable: keep in memory only */ }
}
```

- [ ] **Step 3: `JoinScreen.tsx`**

```tsx
import { useState } from 'react';
import { AVATAR_IDS, normalizeOfficeCode, validateName, type AvatarId } from '@office/protocol';
import { loadDraft, safeLocalStorage, saveDraft } from './identityStorage';

export type JoinResult = { name: string; officeCode: string; avatarId: AvatarId };
const LABEL: Record<AvatarId, string> = { men_suit: 'Suit (men)', women_suit: 'Suit (women)' };

export function JoinScreen({ onJoin }: { onJoin(r: JoinResult): void }) {
  const [draft, setDraft] = useState(() => loadDraft(safeLocalStorage()));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = validateName(draft.name);
    const officeCode = normalizeOfficeCode(draft.officeCode);
    if (!name) return setError('Name must be 1–20 characters, without < or >.');
    if (!officeCode) return setError('Office code must be 4–12 letters, digits or "-".');
    const result = { name, officeCode, avatarId: draft.avatarId };
    saveDraft(safeLocalStorage(), result);
    onJoin(result);
  };
  return (
    <form onSubmit={submit} data-testid="join" style={{ maxWidth: 360, margin: '12vh auto', display: 'grid', gap: 12, font: '15px system-ui' }}>
      <h1 style={{ margin: 0 }}>Virtual Office</h1>
      <label>Your name<input name="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Office code<input name="officeCode" value={draft.officeCode} onChange={(e) => setDraft({ ...draft, officeCode: e.target.value })} /></label>
      <fieldset><legend>Avatar</legend>
        {AVATAR_IDS.map((id) => (
          <label key={id} style={{ marginRight: 12 }}>
            <input type="radio" name="avatar" value={id} checked={draft.avatarId === id} onChange={() => setDraft({ ...draft, avatarId: id })} /> {LABEL[id]}
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" style={{ color: '#b42318', margin: 0 }}>{error}</p>}
      <button type="submit">Join Office</button>
    </form>
  );
}
```

- [ ] **Step 4: Nameplate and App flow**

`Nameplate.ts`:
```ts
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class Nameplate {
  readonly object: CSS2DObject;
  private readonly nameEl = document.createElement('div');
  private readonly statusEl = document.createElement('div');
  constructor() {
    const el = document.createElement('div');
    el.style.cssText = 'padding:2px 8px;border-radius:6px;background:rgba(34,36,38,.75);color:#fff;font:600 12px system-ui;text-align:center;white-space:nowrap';
    this.statusEl.style.cssText = 'font-weight:400;font-size:11px;color:#6CB33F';
    el.append(this.nameEl, this.statusEl);
    this.object = new CSS2DObject(el);
    this.object.position.set(0, 2.1, 0);
  }
  set(name: string, status: string): void {
    this.nameEl.textContent = name;
    this.statusEl.textContent = status;
  }
}
```
`Game.ts`:
- Add a `CSS2DRenderer` whose DOM element is absolutely positioned over the canvas with `pointer-events: none`. Size it in `resize()` and render it after the WebGL render.
- Add `nameplate.object` to `player.mesh`.
- Each frame, call `nameplate.set(identity.name, label)`, where `label` is `Working` for `working`, `Break` for `drinking`, `Resting` for `resting`, and `Online` otherwise.
- Remove the CSS2D element in `dispose()`.

`App.tsx`:
- Keep `const [joined, setJoined] = useState<JoinResult | null>(null)`.
- When the player has not joined, render `<JoinScreen onJoin={setJoined} />`.
- Otherwise render the game host and prompt. Construct `new Game(host, { name: joined.name, avatarId: joined.avatarId })`, with the effect depending on `joined`.
- Set `game.onExit = () => setJoined(null)`.

- [ ] **Step 5: Verify**

**Run:** `pnpm --filter @office/web test` and `pnpm check`. Expected: PASS.
**Run (agy):**
1. Open the app, fill `Khánh`, `nozvi-01` and women_suit, then click Join. Expect a canvas, and a nameplate with the text `Khánh`.
2. Reload: the form is prefilled.
3. Teleport to `(-0.4, -3, Math.PI)`, press E and expect the join form again.
4. Submit an empty name and expect the alert text.

Take screenshots of the join form and of the in-office nameplate.

- [ ] **Step 6: Commit** `feat(web): add join screen, identity storage, nameplate and exit door`

---

### Task 7 (secondary): Coffee break, wave, sofa rest, cabinet

**Files:** Modify `apps/web/src/game/Game.ts` and `src/game/interaction/InteractionController.ts`. Create `test/extras.test.ts`.

**Interfaces:** Uses `hooks.onAction(target)`, `controller.sitOn(seat, 'sofa')`, `BALANCE.activity` and `officeLayout.sofaSeats`.

- [ ] **Step 1: Failing test**

```ts
import { expect, it, vi } from 'vitest';
import { SeatRegistry, officeLayout, type Activity, type PlayerState, type Vec3 } from '@office/protocol';
import { InteractionController } from '../src/game/interaction/InteractionController';
import { handleAction } from '../src/game/interaction/extras';

function fake(state: PlayerState) {
  return { state, activity: 'idle' as Activity, setActivity(a: Activity) { this.activity = a; },
    seatAt(s: { position: Vec3; rotY: number }) { this.state = { x: s.position[0], z: s.position[2], heading: 0 }; },
    standAt(p: Vec3) { this.state = { ...this.state, x: p[0], z: p[2] }; } };
}

it('coffee starts a timed break', () => {
  const p = fake({ x: 2.35, z: -2.75, heading: Math.PI });
  const t = officeLayout.interactables.find((i) => i.id === 'coffee_machine')!;
  const c = new InteractionController(p, new SeatRegistry(), 'me', { onExit: vi.fn() });
  const r = handleAction(t, p, c);
  expect(p.activity).toBe('drinking');
  expect(r.timer).toBeCloseTo(2.5);
});

it('sofa seats the player on the first free sofa seat', () => {
  const p = fake({ x: -1.2, z: -1.4, heading: -Math.PI / 2 });
  const seats = new SeatRegistry();
  seats.claim('sofa_seat_1', 'other');
  const c = new InteractionController(p, seats, 'me', { onExit: vi.fn() });
  handleAction(officeLayout.interactables.find((i) => i.id === 'sofa')!, p, c);
  expect(p.activity).toBe('resting');
  expect(seats.seatOf('me')).toBe('sofa_seat_2');
});
```

- [ ] **Step 2: Implement `src/game/interaction/extras.ts`**

```ts
import { BALANCE, nextActivity, officeLayout, type Interactable } from '@office/protocol';
import type { InteractionController, PlayerLike } from './InteractionController';

export type ActionResult = { timer: number; message?: string };

export function handleAction(t: Interactable, player: PlayerLike, c: InteractionController): ActionResult {
  if (t.type === 'coffee_machine' || t.type === 'water_dispenser') {
    player.setActivity(nextActivity(player.activity, { type: 'drink' }));
    return { timer: BALANCE.activity.drinkSeconds };
  }
  if (t.type === 'sofa') {
    for (const seat of officeLayout.sofaSeats) if (c.sitOn(seat, 'sofa')) break;
    return { timer: 0 };
  }
  if (t.type === 'storage_cabinet') return { timer: 0, message: 'Cabinet opened' };
  return { timer: 0 };
}
```
`Game.ts`:
- Pass `onAction: (t) => { const r = handleAction(t, this.player, this.controller); this.actionTimer = r.timer; if (r.message) this.onToast?.(r.message); }`.
- Each frame, when `actionTimer > 0`, decrement it. When it reaches 0 and the activity is `drinking` or `waving`, call `player.setActivity(nextActivity(a, { type: 'actionDone' }))`.
- The `KeyG` key down calls `player.setActivity(nextActivity(a, { type: 'wave' }))` and sets `actionTimer = BALANCE.activity.waveSeconds`.
- `onToast` shows the message for 1.5 s in `App.tsx`, using the same style as `Prompt`.
- Add `G — Wave` as a permanent small hint in the bottom-left corner.

- [ ] **Step 3: Verify**

**Run:** `pnpm --filter @office/web test` and `pnpm check`. Expected: PASS.
**Run (agy):** teleport to the coffee approach facing north, press E and expect `getActivity()` to be `drinking`, then `idle` after 3 s. Press G and screenshot during the wave. Teleport to `(-1.2, -1.4, -Math.PI / 2)` facing the sofa, press E and screenshot while resting. **Lead review:** the right arm is raised during the wave and the avatar sits on the sofa facing the TV.

- [ ] **Step 4: Commit** `feat(web): add coffee break, wave emote, sofa rest and cabinet feedback`

---

### Task 8: End-to-end core flow (Playwright)

**Files:** Create `apps/web/e2e/sit.spec.ts`. Modify `apps/web/e2e/walk.spec.ts` so that its `beforeEach` first completes the join form.

- [ ] **Step 1: Shared join helper** (top of both spec files, or `e2e/helpers.ts`)

```ts
import type { Page } from '@playwright/test';
export async function join(page: Page, name = 'Tester', code = 'TEST-01') {
  await page.goto('/');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Office code').fill(code);
  await page.getByRole('button', { name: 'Join Office' }).click();
  await page.waitForFunction(() => 'getPlayer' in ((window as unknown as { __office?: object }).__office ?? {}));
  await page.locator('canvas').first().click({ position: { x: 640, y: 360 } });
}
```

- [ ] **Step 2: `sit.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { join } from './helpers';

// Evaluated in the browser as plain JS: no TypeScript casts inside these strings.
const hook = 'window.__office';

test('core flow: join, sit at desk, work, stand, leave', async ({ page }) => {
  await join(page, 'Khánh');
  await expect(page.getByText('Khánh', { exact: true })).toBeVisible();
  await page.evaluate(`(${hook}).teleport(0.4, 2.05, Math.PI)`);
  await expect(page.getByTestId('prompt')).toHaveText('E — Sit');
  await page.keyboard.press('e');
  await page.waitForTimeout(2000);
  expect(await page.evaluate(`(${hook}).getActivity()`)).toBe('sitting');
  await page.screenshot({ path: 'test-results/core-seated.png' });
  await page.keyboard.press('e');
  expect(await page.evaluate(`(${hook}).getActivity()`)).toBe('working');
  await expect(page.getByText('Working', { exact: true })).toBeVisible();
  await page.keyboard.down('w');
  await page.waitForTimeout(200);
  await page.keyboard.up('w');
  expect(await page.evaluate(`(${hook}).getActivity()`)).not.toBe('working');
  await page.evaluate(`(${hook}).teleport(-0.4, -3, Math.PI)`);
  await page.keyboard.press('e');
  await expect(page.getByTestId('join')).toBeVisible();
});

test('rejects an invalid office code', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your name').fill('A');
  await page.getByLabel('Office code').fill('ab');
  await page.getByRole('button', { name: 'Join Office' }).click();
  await expect(page.getByRole('alert')).toContainText('Office code');
});
```

- [ ] **Step 3: Verify**

**Run (agy):** `pnpm --filter @office/web e2e` (all walk and sit specs pass) and `pnpm check`. Report the outputs and screenshot paths.
**Lead review:** open `core-seated.png`.
**Manual FPS (REQ-PERF-001):** with the furnished room and the avatar, walk for 30 s and record the average FPS in STATUS next to the Phase 1 number.

- [ ] **Step 4: Commit** `test(web): add end-to-end core flow for join, sit, work and leave`

---

## Phase 2 exit criteria

- `pnpm check` and all Playwright specs pass. The lead has reviewed the screenshots for furniture orientation, avatar walk, seated alignment, wave and sofa.
- The core flow works single-player: join → avatar → sit at a free desk → work → stand → leave.
- `CREDITS.md` lists every shipped asset.
- STATUS records the FPS. SPEC open questions OQ-008, 010, 013, 014, 015 and 019 are marked resolved in SPEC (lead decisions above).
- Next is Phase 3 (multiplayer): Colyseus room, seat claims through the server-side `SeatRegistry`, and replicated activity and status.
