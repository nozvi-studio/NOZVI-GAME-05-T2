# Architecture — Virtual 3D Office (prototype)

Updated: 2026-11-09 · Status: Accepted (lead decision) · Requirements source: `PRD/` · Visual reference: `except/`

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

- Colyseus, one `OfficeRoom` per normalized office code, single Node process, `maxClients = 10`; 11th player rejected (no duplicate room for same code).
- Server-authoritative fixed 20 Hz simulation, 50 ms patch rate. Client sends movement intent + sequence (≤ 20/s), predicts local avatar, reconciles; remote avatars interpolated ~100 ms behind.
- Reconnect: seat held 20 s (`allowReconnection`), token in `sessionStorage`, full resync on reconnect, explicit rejoin after expiry.
- Validation: office code 4–12 chars `[A-Z0-9-]` (uppercased); name 1–24 visible chars, no control chars/markup, rendered as text; known avatar IDs only; speed, bounds, collision, interaction range and state-transition checks; token buckets ≈25 move/s, 5 interact/s, 2 TV/s per session, join cap per IP. Limits are tunable defaults, not PRD rules.
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
