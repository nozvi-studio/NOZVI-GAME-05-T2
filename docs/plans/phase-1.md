# Phase 1 — Walkable Office Implementation Plan

> **For agentic workers:** Execute task by task. Codex writes code (no network); agy installs dependencies and runs every command marked **Run**. The lead reviews diffs and screenshots before ticking a task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One player opens the web app, sees the procedural 10 x 8 m office built from the layout data, and walks a placeholder capsule around with WASD under a third-person camera without passing through walls or furniture.

**Architecture:** A pnpm monorepo. `packages/protocol` holds the layout data, balance config, collision solver and movement step as pure TypeScript (no React, no Three.js), so the server can reuse them in Phase 3. `apps/web` renders with Three.js outside React's render cycle. React only mounts the canvas host. `apps/server` is a minimal Node HTTP health service in this phase; Colyseus arrives in Phase 3.

**Tech Stack:** Node 24 LTS, pnpm 10, TypeScript strict (`tsc -b`), Vite + React, Three.js 0.187.x (the PoC version), Vitest, Playwright, ESLint (typescript-eslint, react-hooks), Prettier, GitHub Actions.

**Spec:** `docs/SPEC.md` (REQ-ROOM-001..003, REQ-MOVE-001/002, REQ-CAM-001, REQ-NFR-001/002, REQ-PERF-001), `docs/layout/README.md`, `docs/ARCHITECTURE.md` §§2–4.

## Global Constraints

- English only in code, comments and commits.
- `packages/protocol` must not import `react`, `react-dom` or `three`.
- Tunable values live only in `packages/protocol/src/balance.ts`.
- Exact dependency versions: `.npmrc` sets `save-exact=true`. `three` is pinned to `0.187.x`. Other packages use the latest stable version at install, recorded by the lockfile.
- Coordinates: meters, origin at floor center, +X east, +Z south, +Y up. `rotY` in degrees, 0 faces +Z. Heading in radians uses the same convention: facing vector `(sin h, cos h)`.
- Layout sizes are world-axis extents. Render them without extra rotation.
- Defaults (from SPEC): walk 2.0 m/s, run 4.0 m/s, capsule radius 0.3 m, camera-relative WASD, normalized diagonals, no jump.
- Phase 1 scope deviation: furniture renders as palette-colored boxes. CC0 GLB furniture replaces them in Phase 2 (REQ-ROOM-004..008 stay open).
- Dependency installs are approved by the owner (2026-11-09) and are run by agy.

## File structure

```
package.json, pnpm-workspace.yaml, .npmrc, tsconfig.base.json, tsconfig.json,
eslint.config.js, .prettierrc.json, .prettierignore, .github/workflows/ci.yml
packages/protocol/
  package.json, tsconfig.json
  src/index.ts                 re-exports
  src/balance.ts               all tunables
  src/layout/office-layout.json   moved from docs/layout (single source)
  src/layout/layout.ts         types + parseLayout + officeLayout
  src/collision.ts             circle-vs-AABB sweep-and-slide
  src/movement.ts              input -> velocity -> stepPlayer
  test/*.test.ts
apps/server/
  package.json, tsconfig.json, src/main.ts, src/health.ts, test/health.test.ts
apps/web/
  package.json, tsconfig.json, vite.config.ts, index.html, playwright.config.ts
  src/main.tsx, src/App.tsx
  src/game/Game.ts             owns renderer + loop (no React)
  src/game/room.ts             layout -> THREE.Group
  src/game/input.ts            keyboard state -> MoveInput
  src/game/cameraMath.ts       pure camera math (tested)
  src/game/camera.ts           Three.js camera rig using cameraMath
  src/game/player.ts           capsule mesh + protocol stepPlayer
  test/*.test.ts, e2e/walk.spec.ts
docs/layout/validate-layout.mjs   default path updated to the moved JSON
```

---

### Task 1: Monorepo scaffold, tooling, CI and server health

**Files:** Create all root files listed above, `packages/protocol/{package.json,tsconfig.json,src/index.ts,test/smoke.test.ts}`, `apps/server/*`, `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx,src/App.tsx}`.

**Interfaces:** Produces the root scripts `format:check`, `lint`, `typecheck`, `test`, `build`, `check` (all five in order) and the workspace package name `@office/protocol`.

- [ ] **Step 1: Root config**

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
```
`.npmrc`:
```
save-exact=true
```
`package.json`:
```json
{
  "name": "virtual-office",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.33.0",
  "engines": { "node": ">=24 <25" },
  "scripts": {
    "format:check": "prettier --check .",
    "format": "prettier --write .",
    "lint": "eslint .",
    "typecheck": "tsc -b",
    "test": "pnpm -r --if-present test",
    "build": "pnpm -r --if-present build",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  }
}
```
`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "composite": true,
    "declaration": true
  }
}
```
`tsconfig.json`:
```json
{ "files": [], "references": [{ "path": "packages/protocol" }, { "path": "apps/server" }, { "path": "apps/web" }] }
```
`.prettierrc.json`: `{ "singleQuote": true, "printWidth": 100 }`. `.prettierignore`: `pnpm-lock.yaml`, `dist`, `coverage`, `spike`, `PRD`, `except`, `playwright-report`, `test-results`.

`eslint.config.js`:
```js
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', 'spike/**', 'coverage/**', '**/playwright-report/**', 'docs/layout/*.mjs'] },
  ...tseslint.configs.recommended,
  { files: ['apps/web/src/**/*.tsx'], plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
  {
    files: ['packages/protocol/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['react', 'react-dom', 'three'] }],
    },
  },
);
```

- [ ] **Step 2: Protocol package skeleton with a smoke test**

`packages/protocol/package.json`:
```json
{
  "name": "@office/protocol",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" }
}
```
`packages/protocol/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "." }, "include": ["src", "src/**/*.json", "test"] }
```
`src/index.ts`: `export const PROTOCOL_VERSION = 1;`
`test/smoke.test.ts`:
```ts
import { expect, it } from 'vitest';
import { PROTOCOL_VERSION } from '../src/index';
it('exports a protocol version', () => expect(PROTOCOL_VERSION).toBe(1));
```

- [ ] **Step 3: Server health service (TDD)**

`apps/server/package.json`:
```json
{
  "name": "@office/server",
  "private": true,
  "type": "module",
  "scripts": { "test": "vitest run", "dev": "tsx watch src/main.ts", "start": "tsx src/main.ts" },
  "dependencies": { "@office/protocol": "workspace:*" }
}
```
`apps/server/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": ".", "types": ["node"] }, "include": ["src", "test"], "references": [{ "path": "../../packages/protocol" }] }
```
Write the failing test `apps/server/test/health.test.ts`:
```ts
import { afterEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createHealthServer } from '../src/health';

let close: (() => void) | undefined;
afterEach(() => close?.());

it('answers GET /health with ok', async () => {
  const server = createHealthServer();
  await new Promise<void>((r) => server.listen(0, r));
  close = () => server.close();
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok' });
});

it('returns 404 for other paths', async () => {
  const server = createHealthServer();
  await new Promise<void>((r) => server.listen(0, r));
  close = () => server.close();
  const { port } = server.address() as AddressInfo;
  expect((await fetch(`http://127.0.0.1:${port}/nope`)).status).toBe(404);
});
```
**Run:** `pnpm --filter @office/server test`. Expected: FAIL, cannot resolve `../src/health`.

`apps/server/src/health.ts`:
```ts
import { createServer, type Server } from 'node:http';

export function createHealthServer(): Server {
  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });
}
```
`apps/server/src/main.ts`:
```ts
import { createHealthServer } from './health';

const port = Number(process.env.PORT ?? 2567);
createHealthServer().listen(port, () => console.log(`server listening on ${port}`));
```

- [ ] **Step 4: Web app shell**

`apps/web/package.json`:
```json
{
  "name": "@office/web",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview", "test": "vitest run", "e2e": "playwright test" },
  "dependencies": { "@office/protocol": "workspace:*" }
}
```
`apps/web/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "outDir": "dist-types", "rootDir": ".", "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client"] }, "include": ["src", "test", "e2e", "vite.config.ts", "playwright.config.ts"], "references": [{ "path": "../../packages/protocol" }] }
```
`apps/web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { port: 5173, strictPort: true } });
```
`apps/web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Virtual Office</title>
    <style>html,body,#root{margin:0;height:100%;overflow:hidden;background:#F5F6F8}</style></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```
`apps/web/src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
createRoot(document.getElementById('root')!).render(<App />);
```
`apps/web/src/App.tsx` (placeholder, replaced in Task 5):
```tsx
export function App() {
  return <div data-testid="app">Virtual Office</div>;
}
```

- [ ] **Step 5: CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
```

- [ ] **Step 6: Install dependencies (agy)**

**Run:**
```
pnpm add -Dw typescript prettier eslint typescript-eslint eslint-plugin-react-hooks vitest @types/node
pnpm --filter @office/server add -D tsx
pnpm --filter @office/web add react react-dom three@0.187
pnpm --filter @office/web add -D vite @vitejs/plugin-react @types/react @types/react-dom @types/three @playwright/test
pnpm --filter @office/web exec playwright install chromium
```

- [ ] **Step 7: Verify**

**Run:** `pnpm format` then `pnpm check`. Expected: all five stages pass, and the protocol smoke test plus 2 server tests pass.
**Run:** `pnpm --filter @office/server start`, then `curl http://127.0.0.1:2567/health`. Expected: `{"status":"ok"}`.

- [ ] **Step 8: Commit** `chore: scaffold pnpm monorepo with tooling, CI and server health`

---

### Task 2: Layout data and balance config in protocol

**Files:** Move `docs/layout/office-layout.json` to `packages/protocol/src/layout/office-layout.json`. Modify `docs/layout/validate-layout.mjs` (default path) and `docs/layout/README.md` (location line). Create `packages/protocol/src/balance.ts`, `src/layout/layout.ts` and `test/layout.test.ts`. Modify `src/index.ts`.

**Interfaces:**
- Produces `type Aabb = { x: number; z: number; w: number; d: number }` and `type Vec2 = { x: number; z: number }`.
- Produces the layout types `OfficeLayout`, `LayoutBox` and `Workstation`, plus `parseLayout(raw: unknown): OfficeLayout` and `officeLayout: OfficeLayout`.
- Produces `BALANCE` (shape below).

- [ ] **Step 1: Move the JSON (single source of truth)**

**Run:** `git mv docs/layout/office-layout.json packages/protocol/src/layout/office-layout.json`
In `docs/layout/validate-layout.mjs`, replace the default path expression `new URL('./office-layout.json', import.meta.url)` with `new URL('../../packages/protocol/src/layout/office-layout.json', import.meta.url)`. In `docs/layout/README.md`, change the first sentence to: "`packages/protocol/src/layout/office-layout.json` is the authoritative placement data for this room."
**Run:** `node docs/layout/validate-layout.mjs`. Expected: exit 0 and the same summary as before.

- [ ] **Step 2: Balance config**

`packages/protocol/src/balance.ts`:
```ts
export const BALANCE = {
  movement: { walkSpeed: 2.0, runSpeed: 4.0, capsuleRadius: 0.3, turnRate: 12 },
  camera: {
    distance: 4.0,
    minDistance: 1.0,
    maxDistance: 6.0,
    minPitchDeg: 10,
    maxPitchDeg: 60,
    defaultPitchDeg: 25,
    targetHeight: 1.4,
    stiffness: 10,
    mouseSensitivity: 0.0035,
    occlusionPadding: 0.2,
  },
} as const;
export type Balance = typeof BALANCE;
```

- [ ] **Step 3: Failing layout test**

`packages/protocol/test/layout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { officeLayout, parseLayout } from '../src/layout/layout';

describe('officeLayout', () => {
  it('has the 10 x 8 x 2.7 m room', () => {
    expect(officeLayout.room).toEqual({ width: 10, depth: 8, height: 2.7 });
  });
  it('has eight workstations with seat sockets', () => {
    expect(officeLayout.workstations).toHaveLength(8);
    for (const ws of officeLayout.workstations) expect(ws.seat.position).toHaveLength(3);
  });
  it('exposes collider footprints including walls', () => {
    expect(officeLayout.colliders.some((c) => c.kind === 'wall')).toBe(true);
    expect(officeLayout.colliders.every((c) => c.w > 0 && c.d > 0)).toBe(true);
  });
  it('places spawn in the Entrance zone', () => {
    expect(officeLayout.spawn.zone).toBe('Entrance');
  });
  it('rejects malformed data', () => {
    expect(() => parseLayout({})).toThrow(/layout/i);
  });
});
```
**Run:** `pnpm --filter @office/protocol test`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `layout.ts`**

```ts
import raw from './office-layout.json';

export type Vec2 = { x: number; z: number };
export type Aabb = { x: number; z: number; w: number; d: number };
export type Vec3 = [number, number, number];
export type Collider = Aabb & { id: string; kind: string };
export type LayoutBox = { id: string; type: string; position: Vec3; size: Vec3; material?: string };
export type Workstation = { id: string; seat: { position: Vec3; rotY: number }; interactionPoint: Vec3 };
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
    return { id: ws.id as string, seat: { position: seat.position, rotY: seat.rotY }, interactionPoint: ws.interactionPoint as Vec3 };
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
```
`src/index.ts`:
```ts
export const PROTOCOL_VERSION = 1;
export * from './balance';
export * from './layout/layout';
```

- [ ] **Step 5: Verify**

**Run:** `pnpm --filter @office/protocol test` (expect PASS), then `pnpm check` (expect PASS).

- [ ] **Step 6: Commit** `feat(protocol): move layout data into protocol with typed loader and balance config`

---

### Task 3: Collision solver (circle vs AABB sweep-and-slide)

**Files:** Create `packages/protocol/src/collision.ts` and `test/collision.test.ts`. Modify `src/index.ts` (add `export * from './collision';`).

**Interfaces:**
- Consumes `Aabb` and `Vec2` from Task 2.
- Produces `resolveCircle(p: Vec2, r: number, boxes: readonly Aabb[]): Vec2` and `moveCircle(from: Vec2, delta: Vec2, r: number, boxes: readonly Aabb[]): Vec2`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { moveCircle, resolveCircle } from '../src/collision';
import { officeLayout } from '../src/layout/layout';

const wall = { x: 0, z: 0, w: 1, d: 1 }; // spans -0.5..0.5
const r = 0.3;

describe('collision', () => {
  it('leaves a free circle untouched', () => {
    expect(resolveCircle({ x: 2, z: 0 }, r, [wall])).toEqual({ x: 2, z: 0 });
  });
  it('pushes an overlapping circle out to the surface', () => {
    const p = resolveCircle({ x: 0.6, z: 0 }, r, [wall]);
    expect(p.x).toBeCloseTo(0.8, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });
  it('does not tunnel through a box on a large step', () => {
    const p = moveCircle({ x: -2, z: 0 }, { x: 4, z: 0 }, r, [wall]);
    expect(p.x).toBeLessThanOrEqual(-0.8 + 1e-6);
  });
  it('slides along a face when moving obliquely', () => {
    const p = moveCircle({ x: -0.8, z: -1 }, { x: 0.5, z: 1 }, r, [wall]);
    expect(p.x).toBeCloseTo(-0.8, 3);
    expect(p.z).toBeGreaterThan(-0.1);
  });
  it('is deterministic for identical inputs', () => {
    const a = moveCircle({ x: -0.8, z: -1 }, { x: 0.5, z: 1 }, r, [wall]);
    const b = moveCircle({ x: -0.8, z: -1 }, { x: 0.5, z: 1 }, r, [wall]);
    expect(a).toEqual(b);
  });
  it('keeps the player inside the office walls', () => {
    const { x, z } = { x: officeLayout.spawn.position[0], z: officeLayout.spawn.position[2] };
    const p = moveCircle({ x, z }, { x: 0, z: -20 }, r, officeLayout.colliders);
    expect(p.z).toBeGreaterThan(-officeLayout.room.depth / 2);
  });
});
```
**Run:** `pnpm --filter @office/protocol test`. Expected: FAIL, module not found.

- [ ] **Step 2: Implement**

```ts
import type { Aabb, Vec2 } from './layout/layout';

const EPS = 1e-6;

export function resolveCircle(p: Vec2, r: number, boxes: readonly Aabb[]): Vec2 {
  let { x, z } = p;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const b of boxes) {
      const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
      const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
      const cx = Math.min(Math.max(x, minX), maxX);
      const cz = Math.min(Math.max(z, minZ), maxZ);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r - EPS) continue;
      if (d2 > EPS * EPS) {
        const d = Math.sqrt(d2);
        const push = (r - d + EPS) / d;
        x += dx * push;
        z += dz * push;
      } else {
        const left = x - minX + r, right = maxX - x + r;
        const north = z - minZ + r, south = maxZ - z + r;
        const m = Math.min(left, right, north, south);
        if (m === left) x -= left;
        else if (m === right) x += right;
        else if (m === north) z -= north;
        else z += south;
      }
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

export function moveCircle(from: Vec2, delta: Vec2, r: number, boxes: readonly Aabb[]): Vec2 {
  const len = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
  let p: Vec2 = { x: from.x, z: from.z };
  for (let i = 0; i < steps; i++) {
    p = resolveCircle({ x: p.x + delta.x / steps, z: p.z + delta.z / steps }, r, boxes);
  }
  return p;
}
```

- [ ] **Step 3: Verify** with **Run:** `pnpm --filter @office/protocol test` (expect PASS), then `pnpm check`.
- [ ] **Step 4: Commit** `feat(protocol): add shared 2.5D circle-vs-AABB collision solver`

---

### Task 4: Movement step

**Files:** Create `packages/protocol/src/movement.ts` and `test/movement.test.ts`. Modify `src/index.ts` (add `export * from './movement';`).

**Interfaces:**
- Consumes `moveCircle`, `BALANCE`, `Aabb` and `Vec2`.
- Produces:
  - `type MoveInput = { forward: number; right: number; run: boolean }`. Axes are -1, 0 or 1. W is `forward: 1`, D is `right: 1`.
  - `type PlayerState = { x: number; z: number; heading: number }`.
  - `desiredVelocity(input: MoveInput, cameraYaw: number): Vec2`.
  - `stepPlayer(state: PlayerState, input: MoveInput, cameraYaw: number, dt: number, colliders: readonly Aabb[]): PlayerState`.
- Convention: camera yaw θ means the camera looks along `(sin θ, cos θ)`. Forward is `(sin θ, cos θ)` and right is `(-cos θ, sin θ)`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { desiredVelocity, stepPlayer } from '../src/movement';
import { BALANCE } from '../src/balance';

const none = { forward: 0, right: 0, run: false };

describe('movement', () => {
  it('W moves along the camera forward at walk speed', () => {
    const v = desiredVelocity({ ...none, forward: 1 }, 0);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(BALANCE.movement.walkSpeed);
  });
  it('D moves to camera right (yaw 0 -> -X)', () => {
    const v = desiredVelocity({ ...none, right: 1 }, 0);
    expect(v.x).toBeCloseTo(-BALANCE.movement.walkSpeed);
  });
  it('is camera-relative (yaw 90deg, W -> +X)', () => {
    const v = desiredVelocity({ ...none, forward: 1 }, Math.PI / 2);
    expect(v.x).toBeCloseTo(BALANCE.movement.walkSpeed);
    expect(v.z).toBeCloseTo(0);
  });
  it('normalizes diagonals', () => {
    const v = desiredVelocity({ forward: 1, right: 1, run: false }, 0.3);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(BALANCE.movement.walkSpeed);
  });
  it('runs at run speed', () => {
    const v = desiredVelocity({ forward: 1, right: 0, run: true }, 0);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(BALANCE.movement.runSpeed);
  });
  it('steps position and turns heading toward travel', () => {
    const s = stepPlayer({ x: 0, z: 0, heading: 0 }, { ...none, forward: 1 }, Math.PI / 2, 0.5, []);
    expect(s.x).toBeCloseTo(1.0);
    expect(s.heading).toBeGreaterThan(0);
  });
  it('keeps heading when idle', () => {
    const s = stepPlayer({ x: 0, z: 0, heading: 1 }, none, 0, 0.1, []);
    expect(s).toEqual({ x: 0, z: 0, heading: 1 });
  });
  it('is blocked by colliders', () => {
    const s = stepPlayer({ x: 0, z: 0, heading: 0 }, { ...none, forward: 1 }, 0, 1, [{ x: 0, z: 1, w: 4, d: 0.2 }]);
    expect(s.z).toBeLessThanOrEqual(0.6 + 1e-6);
  });
});
```
**Run:** `pnpm --filter @office/protocol test`. Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
import { BALANCE } from './balance';
import { moveCircle } from './collision';
import type { Aabb, Vec2 } from './layout/layout';

export type MoveInput = { forward: number; right: number; run: boolean };
export type PlayerState = { x: number; z: number; heading: number };

export function desiredVelocity(input: MoveInput, cameraYaw: number): Vec2 {
  const fx = Math.sin(cameraYaw), fz = Math.cos(cameraYaw);
  const rx = -Math.cos(cameraYaw), rz = Math.sin(cameraYaw);
  const x = fx * input.forward + rx * input.right;
  const z = fz * input.forward + rz * input.right;
  const len = Math.hypot(x, z);
  if (len < 1e-9) return { x: 0, z: 0 };
  const speed = input.run ? BALANCE.movement.runSpeed : BALANCE.movement.walkSpeed;
  return { x: (x / len) * speed, z: (z / len) * speed };
}

function turnToward(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

export function stepPlayer(
  state: PlayerState,
  input: MoveInput,
  cameraYaw: number,
  dt: number,
  colliders: readonly Aabb[],
): PlayerState {
  const v = desiredVelocity(input, cameraYaw);
  if (v.x === 0 && v.z === 0) return state;
  const p = moveCircle(state, { x: v.x * dt, z: v.z * dt }, BALANCE.movement.capsuleRadius, colliders);
  const heading = turnToward(state.heading, Math.atan2(v.x, v.z), BALANCE.movement.turnRate * dt);
  return { x: p.x, z: p.z, heading };
}
```

- [ ] **Step 3: Verify** with **Run:** `pnpm --filter @office/protocol test` (expect PASS), then `pnpm check`.
- [ ] **Step 4: Commit** `feat(protocol): add camera-relative movement step`

---

### Task 5: Procedural room render and game loop outside React

**Files:** Create `apps/web/src/game/Game.ts`, `src/game/room.ts` and `test/room.test.ts`. Replace `src/App.tsx`.

**Interfaces:**
- Consumes `officeLayout` and `OfficeLayout`.
- Produces:
  - `buildRoom(layout: OfficeLayout): THREE.Group`. Mesh names equal the layout ids. `userData.occluder = true` is set on walls and items.
  - `class Game { constructor(host: HTMLElement); start(): void; dispose(): void; readonly scene: THREE.Scene }`.
  - Optional hook `onFrame(dt: number)` used by later tasks.

- [ ] **Step 1: Failing test** (`apps/web/test/room.test.ts`, runs in Node because no WebGL is needed)

```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { officeLayout } from '@office/protocol';
import { buildRoom } from '../src/game/room';

describe('buildRoom', () => {
  const room = buildRoom(officeLayout);
  it('creates one mesh per wall and item', () => {
    for (const box of [...officeLayout.walls, ...officeLayout.items]) {
      expect(room.getObjectByName(box.id)).toBeInstanceOf(THREE.Mesh);
    }
  });
  it('sizes meshes from world-axis extents without rotation', () => {
    const desk = officeLayout.items.find((i) => i.id === 'ws_1_desk')!;
    const mesh = room.getObjectByName('ws_1_desk') as THREE.Mesh;
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(desk.size[0]);
    expect(size.z).toBeCloseTo(desk.size[2]);
  });
  it('has a floor matching the room', () => {
    const floor = room.getObjectByName('floor') as THREE.Mesh;
    const size = new THREE.Box3().setFromObject(floor).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(10);
    expect(size.z).toBeCloseTo(8);
  });
});
```
**Run:** `pnpm --filter @office/web test`. Expected: FAIL.

- [ ] **Step 2: Implement `room.ts`**

```ts
import * as THREE from 'three';
import type { LayoutBox, OfficeLayout } from '@office/protocol';

const TYPE_COLORS: Record<string, string> = {
  main_door: 'mainDoor', plant: 'deskDividers', shoe_rack: 'deskFrame', countertop: 'lowerCabinetry',
  water_dispenser: 'waterBottles', storage_cabinet: 'lowerCabinetry', lockers: 'upperCabinetry',
  shelves: 'credenza', air_conditioner: 'airConditioner', utility_door: 'upperCabinetry', TV: 'fridge',
  sofa: 'chairBack', coffee_table: 'credenza', decorative_lighting: 'upperCabinetry',
};

function colorFor(box: LayoutBox, palette: Record<string, string>): string {
  const key = box.material ?? TYPE_COLORS[box.type] ?? 'walls';
  return palette[key] ?? '#cccccc';
}

function boxMesh(box: LayoutBox, color: string): THREE.Mesh {
  const [w, h, d] = box.size;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
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
```

- [ ] **Step 3: Implement `Game.ts`**

```ts
import * as THREE from 'three';
import { officeLayout } from '@office/protocol';
import { buildRoom } from './room';

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  onFrame: ((dt: number) => void) | undefined;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly host: HTMLElement) {
    this.scene.background = new THREE.Color('#dfe9f3');
    this.scene.add(buildRoom(officeLayout));
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a0', 1.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.4);
    sun.position.set(2, 6, 6);
    sun.castShadow = true;
    this.scene.add(sun);
    this.camera.position.set(0, 2.2, -1);
    this.camera.lookAt(0, 1, 2);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
```

- [ ] **Step 4: Mount from React** (`apps/web/src/App.tsx`)

```tsx
import { useEffect, useRef } from 'react';
import { Game } from './game/Game';

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const game = new Game(hostRef.current!);
    game.start();
    return () => game.dispose();
  }, []);
  return <div ref={hostRef} data-testid="game-host" style={{ width: '100%', height: '100%' }} />;
}
```

- [ ] **Step 5: Verify**

**Run:** `pnpm --filter @office/web test` (expect PASS) and `pnpm check` (expect PASS).
**Run (agy):** `pnpm --filter @office/web dev`, take a Playwright screenshot of `http://localhost:5173` at 1280x720 and save it to `apps/web/test-results/task5-room.png`. The lead opens the screenshot and checks that the room is visible with walls, desks, sofa and TV boxes in palette colors.

- [ ] **Step 6: Commit** `feat(web): render procedural office from layout data`

---

### Task 6: Keyboard input and capsule player

**Files:** Create `apps/web/src/game/input.ts`, `src/game/player.ts` and `test/input.test.ts`. Modify `src/game/Game.ts`.

**Interfaces:**
- Consumes `stepPlayer`, `MoveInput`, `PlayerState` and `officeLayout`.
- Produces:
  - `class KeyboardInput { constructor(target: Window); read(): MoveInput; dispose(): void }`.
  - Pure helper `toMoveInput(pressed: ReadonlySet<string>): MoveInput`, which uses `KeyboardEvent.code` values `KeyW`, `KeyA`, `KeyS`, `KeyD`, `ShiftLeft` and `ShiftRight`.
  - `class Player { readonly mesh: THREE.Group; state: PlayerState; update(input: MoveInput, cameraYaw: number, dt: number): void }`.
  - `Game` gains `player`, `input` and `cameraYaw` (fixed at 0 until Task 7).
  - Debug hook: when `import.meta.env.DEV` is true, `window.__office = { getPlayer: () => PlayerState, getCameraYaw: () => number }`.

- [ ] **Step 1: Failing test** (`apps/web/test/input.test.ts`)

```ts
import { expect, it } from 'vitest';
import { toMoveInput } from '../src/game/input';

it('maps WASD and shift', () => {
  expect(toMoveInput(new Set(['KeyW']))).toEqual({ forward: 1, right: 0, run: false });
  expect(toMoveInput(new Set(['KeyS', 'KeyD', 'ShiftLeft']))).toEqual({ forward: -1, right: 1, run: true });
  expect(toMoveInput(new Set(['KeyA', 'KeyD']))).toEqual({ forward: 0, right: 0, run: false });
  expect(toMoveInput(new Set(['Space']))).toEqual({ forward: 0, right: 0, run: false });
});
```
**Run:** `pnpm --filter @office/web test`. Expected: FAIL.

- [ ] **Step 2: Implement `input.ts`**

```ts
import type { MoveInput } from '@office/protocol';

export function toMoveInput(pressed: ReadonlySet<string>): MoveInput {
  const axis = (pos: string, neg: string) => (pressed.has(pos) ? 1 : 0) - (pressed.has(neg) ? 1 : 0);
  return {
    forward: axis('KeyW', 'KeyS'),
    right: axis('KeyD', 'KeyA'),
    run: pressed.has('ShiftLeft') || pressed.has('ShiftRight'),
  };
}

export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private readonly down = (e: KeyboardEvent) => this.pressed.add(e.code);
  private readonly up = (e: KeyboardEvent) => this.pressed.delete(e.code);
  private readonly blur = () => this.pressed.clear();

  constructor(private readonly target: Window) {
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.blur);
  }
  read(): MoveInput {
    return toMoveInput(this.pressed);
  }
  dispose(): void {
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.blur);
  }
}
```

- [ ] **Step 3: Implement `player.ts`**

```ts
import * as THREE from 'three';
import { BALANCE, officeLayout, stepPlayer, type MoveInput, type PlayerState } from '@office/protocol';

export class Player {
  readonly mesh = new THREE.Group();
  state: PlayerState;

  constructor() {
    const r = BALANCE.movement.capsuleRadius;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, 1.7 - 2 * r, 4, 12),
      new THREE.MeshStandardMaterial({ color: '#3B9AE2' }),
    );
    body.position.y = 0.85;
    body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: '#222426' }));
    nose.position.set(0, 1.5, r);
    this.mesh.add(body, nose);
    const [x, , z] = officeLayout.spawn.position;
    this.state = { x, z, heading: (officeLayout.spawn.rotY * Math.PI) / 180 };
    this.sync();
  }

  update(input: MoveInput, cameraYaw: number, dt: number): void {
    this.state = stepPlayer(this.state, input, cameraYaw, dt, officeLayout.colliders);
    this.sync();
  }

  private sync(): void {
    this.mesh.position.set(this.state.x, 0, this.state.z);
    this.mesh.rotation.y = this.state.heading;
  }
}
```
Rotation check: `rotation.y = h` maps local +Z to `(sin h, cos h)`, which matches the convention.

- [ ] **Step 4: Wire into `Game.ts`**

Add the imports `KeyboardInput` and `Player`. Add fields `readonly player = new Player()`, `readonly input = new KeyboardInput(window)` and `cameraYaw = 0`. In the constructor, after building the room, add:
```ts
this.scene.add(this.player.mesh);
if (import.meta.env.DEV) {
  (window as unknown as { __office: unknown }).__office = {
    getPlayer: () => ({ ...this.player.state }),
    getCameraYaw: () => this.cameraYaw,
  };
}
```
In `start()`, before `this.onFrame?.(dt)`, add `this.player.update(this.input.read(), this.cameraYaw, dt);`. In `dispose()`, add `this.input.dispose();`. Temporarily keep the fixed camera from Task 5. Task 7 replaces it.

- [ ] **Step 5: Verify** with **Run:** `pnpm --filter @office/web test` and `pnpm check`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): add WASD input and capsule player using shared movement`

---

### Task 7: Third-person orbit camera with occlusion

**Files:** Create `apps/web/src/game/cameraMath.ts`, `src/game/camera.ts` and `test/cameraMath.test.ts`. Modify `src/game/Game.ts`.

**Interfaces:**
- Consumes `BALANCE.camera` and `Player`.
- Produces:
  - `clampPitch(rad: number): number`.
  - `orbitOffset(yaw: number, pitch: number, distance: number): { x: number; y: number; z: number }`. The camera sits behind the target, opposite the look direction `(sin yaw, cos yaw)`.
  - `resolveDistance(desired: number, hitDistance: number | null): number`. It returns the occlusion-shortened distance, never below `minDistance`.
  - `damp(current: number, target: number, stiffness: number, dt: number): number`.
  - `class CameraRig { yaw: number; pitch: number; constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, occluders: THREE.Object3D[]); update(target: THREE.Vector3, dt: number): void; dispose(): void }`. Mouse drag with the left button orbits the camera, and the wheel zooms within `[minDistance, maxDistance]`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import { clampPitch, damp, orbitOffset, resolveDistance } from '../src/game/cameraMath';

const C = BALANCE.camera;
const deg = Math.PI / 180;

describe('cameraMath', () => {
  it('clamps pitch to configured range', () => {
    expect(clampPitch(0)).toBeCloseTo(C.minPitchDeg * deg);
    expect(clampPitch(Math.PI / 2)).toBeCloseTo(C.maxPitchDeg * deg);
  });
  it('places the camera behind the look direction', () => {
    const o = orbitOffset(0, 0, 4);
    expect(o.z).toBeCloseTo(-4);
    expect(o.x).toBeCloseTo(0);
  });
  it('raises the camera with pitch', () => {
    expect(orbitOffset(0, 30 * deg, 4).y).toBeCloseTo(2);
  });
  it('pulls in when occluded but never below min distance', () => {
    expect(resolveDistance(4, null)).toBe(4);
    expect(resolveDistance(4, 2)).toBeCloseTo(2 - C.occlusionPadding);
    expect(resolveDistance(4, 0.3)).toBe(C.minDistance);
  });
  it('damps toward the target and converges', () => {
    let v = 0;
    for (let i = 0; i < 120; i++) v = damp(v, 1, C.stiffness, 1 / 60);
    expect(v).toBeCloseTo(1, 3);
    expect(damp(0, 1, C.stiffness, 1 / 60)).toBeGreaterThan(0);
    expect(damp(0, 1, C.stiffness, 1 / 60)).toBeLessThan(1);
  });
});
```
**Run:** `pnpm --filter @office/web test`. Expected: FAIL.

- [ ] **Step 2: Implement `cameraMath.ts`**

```ts
import { BALANCE } from '@office/protocol';

const C = BALANCE.camera;
const deg = Math.PI / 180;

export function clampPitch(rad: number): number {
  return Math.min(Math.max(rad, C.minPitchDeg * deg), C.maxPitchDeg * deg);
}

export function orbitOffset(yaw: number, pitch: number, distance: number) {
  const horizontal = Math.cos(pitch) * distance;
  return { x: -Math.sin(yaw) * horizontal, y: Math.sin(pitch) * distance, z: -Math.cos(yaw) * horizontal };
}

export function resolveDistance(desired: number, hitDistance: number | null): number {
  const d = hitDistance === null ? desired : Math.min(desired, hitDistance - C.occlusionPadding);
  return Math.max(d, C.minDistance);
}

export function damp(current: number, target: number, stiffness: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-stiffness * dt));
}
```

- [ ] **Step 3: Implement `camera.ts`**

```ts
import * as THREE from 'three';
import { BALANCE } from '@office/protocol';
import { clampPitch, damp, orbitOffset, resolveDistance } from './cameraMath';

const C = BALANCE.camera;

export class CameraRig {
  yaw = 0;
  pitch = clampPitch((C.defaultPitchDeg * Math.PI) / 180);
  private distance: number = C.distance;
  private currentDistance: number = C.distance;
  private dragging = false;
  private readonly ray = new THREE.Raycaster();
  private readonly focus = new THREE.Vector3();

  private readonly onDown = (e: PointerEvent) => { if (e.button === 0) this.dragging = true; };
  private readonly onUp = () => { this.dragging = false; };
  private readonly onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.yaw -= e.movementX * C.mouseSensitivity;
    this.pitch = clampPitch(this.pitch + e.movementY * C.mouseSensitivity);
  };
  private readonly onWheel = (e: WheelEvent) => {
    this.distance = Math.min(Math.max(this.distance + e.deltaY * 0.002, C.minDistance), C.maxDistance);
  };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly occluders: THREE.Object3D[],
  ) {
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointermove', this.onMove);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
  }

  update(target: THREE.Vector3, dt: number): void {
    this.focus.set(target.x, target.y + C.targetHeight, target.z);
    const dir = orbitOffset(this.yaw, this.pitch, 1);
    const dirVec = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    this.ray.set(this.focus, dirVec);
    this.ray.far = this.distance;
    const hit = this.ray.intersectObjects(this.occluders, false)[0];
    const wanted = resolveDistance(this.distance, hit ? hit.distance : null);
    this.currentDistance = wanted < this.currentDistance ? wanted : damp(this.currentDistance, wanted, C.stiffness, dt);
    const o = orbitOffset(this.yaw, this.pitch, this.currentDistance);
    this.camera.position.set(this.focus.x + o.x, this.focus.y + o.y, this.focus.z + o.z);
    this.camera.lookAt(this.focus);
  }

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointermove', this.onMove);
    this.dom.removeEventListener('wheel', this.onWheel);
  }
}
```
Occlusion snaps inward immediately and eases outward. This settles OQ-007's "clamp vs occlusion" question: the minimum-distance clamp wins.

- [ ] **Step 4: Wire into `Game.ts`**

Collect the occluders after building the room:
```ts
const room = buildRoom(officeLayout);
this.scene.add(room);
const occluders: THREE.Object3D[] = [];
room.traverse((o) => { if (o.userData.occluder) occluders.push(o); });
this.rig = new CameraRig(this.camera, this.renderer.domElement, occluders);
```
Add the field `private readonly rig: CameraRig`. Remove the fixed camera placement and the `cameraYaw` field. In the loop:
```ts
this.player.update(this.input.read(), this.rig.yaw, dt);
this.rig.update(this.player.mesh.position, dt);
```
Change the debug hook to `getCameraYaw: () => this.rig.yaw`. In `dispose()`, add `this.rig.dispose();`. Initial yaw: set `this.rig.yaw = this.player.state.heading` after the rig is constructed, so the camera starts behind the player.

- [ ] **Step 5: Verify** with **Run:** `pnpm --filter @office/web test` and `pnpm check`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): add spring-damped third-person camera with occlusion pull-in`

---

### Task 8: End-to-end walk test (Playwright)

**Files:** Create `apps/web/playwright.config.ts` and `apps/web/e2e/walk.spec.ts`. Modify `apps/web/vite.config.ts` so that Vitest excludes `e2e/**`.

**Interfaces:** Consumes the `window.__office` debug hook from Tasks 6–7.

- [ ] **Step 1: Config**

In `vite.config.ts`, add `test: { exclude: ['e2e/**', 'node_modules/**'] }` and use `/// <reference types="vitest/config" />` at the top.

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
});
```

- [ ] **Step 2: Test**

```ts
import { expect, test, type Page } from '@playwright/test';

type P = { x: number; z: number; heading: number };
const getPlayer = (page: Page) => page.evaluate(() => (window as unknown as { __office: { getPlayer(): P } }).__office.getPlayer());
const getYaw = (page: Page) => page.evaluate(() => (window as unknown as { __office: { getCameraYaw(): number } }).__office.getCameraYaw());

async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => 'getPlayer' in ((window as unknown as { __office?: object }).__office ?? {}));
  await page.locator('canvas').click({ position: { x: 640, y: 360 } });
});

test('renders the office canvas', async ({ page }) => {
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/walk-start.png' });
});

test('W moves along the camera forward', async ({ page }) => {
  const a = await getPlayer(page);
  const yaw = await getYaw(page);
  await hold(page, 'w', 600);
  const b = await getPlayer(page);
  const along = (b.x - a.x) * Math.sin(yaw) + (b.z - a.z) * Math.cos(yaw);
  expect(along).toBeGreaterThan(0.5);
});

test('S, A and D move in their camera-relative directions', async ({ page }) => {
  const yaw = await getYaw(page);
  const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const right = { x: -Math.cos(yaw), z: Math.sin(yaw) };
  for (const [key, axis, sign] of [['s', fwd, -1], ['d', right, 1], ['a', right, -1]] as const) {
    const a = await getPlayer(page);
    await hold(page, key, 400);
    const b = await getPlayer(page);
    expect(((b.x - a.x) * axis.x + (b.z - a.z) * axis.z) * sign).toBeGreaterThan(0.3);
  }
});

test('walls stop the player', async ({ page }) => {
  await hold(page, 's', 4000);
  const p = await getPlayer(page);
  expect(p.z).toBeGreaterThan(-4 + 0.3 - 0.01);
  await page.screenshot({ path: 'test-results/walk-wall.png' });
});
```
Spawn faces +Z, so S walks north into the entrance wall at z = -3.9.

- [ ] **Step 3: Verify**

**Run (agy):** `pnpm --filter @office/web e2e`. Expected: 4 passed.
agy reports the Playwright output and the paths of `apps/web/test-results/walk-start.png` and `walk-wall.png`. The lead opens both screenshots and checks that the capsule is visible behind the camera, the room is in palette colors and the player is pressed against the north wall.
**Run (agy):** `pnpm check`. Expected: PASS.

- [ ] **Step 4: Manual FPS note (REQ-PERF-001).** agy opens the dev app in Chromium with the stats shown in the DevTools performance panel, walks for 30 s, and records hardware, browser, resolution and the average FPS in its report. The lead copies the number into STATUS.

- [ ] **Step 5: Commit** `test(web): add Playwright walk and collision checks`

---

## Phase 1 exit criteria

- `pnpm check` passes locally and in CI.
- Playwright `walk.spec.ts` shows 4 passed, with screenshots reviewed by the lead.
- `node docs/layout/validate-layout.mjs` exits 0 against the moved JSON.
- STATUS updated with the measured FPS and Phase 2 as next. Phase 2 covers GLB furniture and avatars, sitting at a desk, and the identity form.
