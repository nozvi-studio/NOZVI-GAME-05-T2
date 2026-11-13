# Architecture — Virtual 3D Office (prototype)

Updated: 2026-11-13 · Status: Accepted (lead decision) · Requirements source: `PRD/` · Visual reference: `except/`

Synthesized from two independent proposals (Codex: engineering foundation; Antigravity: 3D client). Rationale per choice lives in `docs/DECISIONS.md`.

## 1. Hard constraints

- Zero cost: free tooling, free hosting, CC0 assets only.
- No accounts, no database. Name + avatar kept in browser `localStorage`; office code = room id (PRD-SRS §3.2). Room state is in-memory and ephemeral.
- No Blender required: room shell is procedural Three.js code; furniture and characters are CC0 GLB.

## 2. Repository layout (pnpm workspaces)

```
apps/web          Vite + React + Zustand UI, Three.js game (src/game/*), networking client
apps/server       Node + Colyseus: OfficeRoom, handlers (movement, interaction, tv)
packages/protocol Shared wire contract: message names, payload types + validators,
                  avatar/interaction IDs, Colyseus schemas, office layout data, collision solver
```

`packages/protocol` imports neither React nor Three.js. Layout data and the collision solver live there so client prediction and server authority use identical geometry.

## 3. Tooling

Node LTS + pnpm (pinned via `packageManager`/`engines`), TypeScript strict with project references (`tsc -b`), Vitest, ESLint (typescript-eslint, react-hooks) + Prettier, GitHub Actions (format, lint, typecheck, test, build). Exact versions are pinned at scaffold time after checking the registry.

## 4. Client (3D)

| System      | Choice                                                                                                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room shell  | Parametric Box/Plane assembly from layout data; 12 m × 9.6 m × 2.7 m (OQ-001 resolved; widened +20% per horizontal dimension in Phase 2.1, see DECISIONS); palette from `except/` (off-white walls, light-grey tile, walnut wood, white metal, black electronics, lime-green accents) |
| Assets      | Kenney furniture/office kits + Quaternius animated characters (CC0). Seat sockets defined per furniture type in config                                                                                                                                                                |
| Collision   | Custom 2.5D capsule-vs-AABB sweep-and-slide (no Rapier); shared with server                                                                                                                                                                                                           |
| Camera      | Spring-damped orbit third-person camera, ray occlusion pull-in, min distance clamp                                                                                                                                                                                                    |
| Interaction | `OfficeInteractable` registry, proximity (≈2 m) + facing check, `E` to interact, `Esc` closes UI; one module per zone                                                                                                                                                                 |
| Character   | FSM idle ↔ walk ↔ sit ↔ working / drinking, AnimationMixer cross-fade ≈0.25 s; replicated as enum + `seatId`                                                                                                                                                                          |
| TV          | WebGLRenderer + CSS3DRenderer; YouTube iframe as CSS3DObject; depth-only WebGL occluder mesh; iframe `pointer-events: none` except in TV mode; start muted until user gesture                                                                                                         |
| Performance | Target ≤ 45 draw calls, < 120k tris, textures ≤ 1024² props / 512² avatars, InstancedMesh for repeated props                                                                                                                                                                          |

## 5. Realtime

- Colyseus 0.18 in one Node process: `@colyseus/core` 0.18.28 + `@colyseus/ws-transport` 0.18.5 on the server (not the `colyseus` meta-package, see DECISIONS 2026-11-13), `@colyseus/sdk` 0.18.9 on the client, `@colyseus/schema` 5.0.45 shared. `GET /health` and the WebSocket upgrade share one HTTP port.
- One `OfficeRoom` per normalized office code (room id = code), `maxClients = 10`; the 11th player gets `room_full` (no duplicate room for the same code).
- Server-authoritative fixed 20 Hz simulation, 50 ms patch rate. One client input = one fixed 50 ms step through the shared `applyInput` on both sides; the client sends input + sequence (≤ 20/s), predicts the local avatar and reconciles on `lastSeq`; remote avatars are interpolated ~100 ms behind. Seating waits for the server (no optimistic sit).
- Reconnect: avatar and seat held 20 s (`allowReconnection`) with `connected = false`, token in `sessionStorage`, client-owned 1/2/4/8 s backoff then explicit Rejoin, full resync on reconnect. A consented leave removes the employee at once.
- Validation: office code 4–12 chars `[A-Z0-9-]` (uppercased); name 1–20 visible chars after trim, no control chars/markup, rendered as text (SPEC REQ-NFR-004); known avatar IDs only; speed, bounds, collision, interaction range and state-transition checks; queued inputs per client are capped so flooding cannot move a player faster than real time.
- Rate limits (SPEC REQ-NFR-005): joins 10 per minute per socket address (`BALANCE.net.joinsPerMinutePerIp`; proxy headers ignored until Phase 5), TV commands 5 per 10 s per client (Phase 4, also a balance value). Movement sends are capped at 20/s by REQ-NET-003, separate from these abuse limits. The prototype is chat-free.
- Dev only: `NET_PROFILE=test` on the server delays and jitters outgoing messages to the REQ-NET-004 test profile (`BALANCE.net.testProfile`); off by default and refused when `NODE_ENV=production`.
- Shared TV: `SharedTVState` (PRD-SRS §3.4) with server timestamp; commands serialized in room order; client drift correction: < 0.5 s ignore, 0.5–2 s playback-rate nudge, > 2 s hard seek; resync on `visibilitychange`.

## 6. Deployment (free)

- Frontend: Cloudflare Pages (fallback GitHub Pages).
- Server: Render Free web service (sleeps after 15 min idle, ~1 min cold start, restarts wipe rooms). UI must show "starting server" and auto-retry. Fallback if cold starts are unacceptable: Oracle Cloud Always Free VPS.
- Excluded: Fly.io, Railway (no lasting free tier).
- Env: `VITE_SERVER_URL` (public, no secrets), server `PORT`, `ALLOWED_ORIGINS`. No hardcoded URLs.

## 7. Known risks

1. Render sleep/restart clears rooms and TV state (accepted for prototype).
2. Quaternius clip set (sit/typing) must be verified when assets are downloaded; fallback: Kenney/Mixamo-free alternative or procedural pose.
3. Prediction vs authoritative collision mismatch → shared solver mitigates.
4. YouTube embed/autoplay restrictions → muted start + per-video error UI.
5. Free-tier terms change → recheck before demo.
