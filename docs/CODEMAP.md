# Code map

Updated: 2026-11-09 · Keep under ~80 lines. One row per module, not per file.

> Add rows only for paths that actually exist. Architecture: `docs/ARCHITECTURE.md` §2. Commands: `pnpm check` (format, lint, typecheck, test, build), `pnpm --filter @office/web dev`, `pnpm --filter @office/web e2e`, `node docs/layout/validate-layout.mjs`. Node 24 required.

## Entry points

| What                   | File                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| App bootstrap          | `apps/web/src/main.tsx`, `apps/web/src/App.tsx`                                           |
| Main game scene / loop | `apps/web/src/game/Game.ts`                                                               |
| Balance config         | `packages/protocol/src/balance.ts`                                                        |
| Layout data            | `packages/protocol/src/layout/office-layout.json`                                         |
| Server entry           | `apps/server/src/main.ts`                                                                 |
| Test setup             | Vitest per package (`test/`); Playwright `apps/web/playwright.config.ts`, `apps/web/e2e/` |

## Modules

| Module (folder) | Responsibility | Key files (max 3) | Depends on | Requirement IDs | Tests |
| --------------- | -------------- | ----------------- | ---------- | --------------- | ----- |

| packages/protocol | Shared pure TS: layout loader, balance, 2.5D collision, movement step, wire contract in `src/net/` (Colyseus schema, message validators, fixed-step `applyInput`) (no React/Three) | `src/layout/layout.ts`, `src/collision.ts`, `src/movement.ts`, `src/net/schema.ts`, `src/net/messages.ts`, `src/net/fixedStep.ts` | @colyseus/schema | REQ-ROOM-002, REQ-MOVE-001, REQ-MOVE-002 | `packages/protocol/test/` |
| apps/web/src/game | Three.js room, render loop, lighting/shadows, input, capsule player, orbit camera with ceiling clamp (outside React) | `Game.ts`, `room.ts`, `lighting.ts`, `camera.ts`, `cameraMath.ts` | protocol, three | REQ-ROOM-001, REQ-ROOM-003, REQ-CAM-001 | `apps/web/test/`, `apps/web/e2e/walk.spec.ts`, `apps/web/e2e/visual.spec.ts` (evidence capture to `apps/web/visual-out/`) |
| apps/web/src/net | Colyseus connection wrapper: join/leave, status (`idle/connecting/connected/error`), typed join errors (`room_full`, `invalid_identity`, `version_mismatch`, `rate_limited`, `unreachable`, `unknown`), `VITE_SERVER_URL` (no React/Three) | `connection.ts`, `index.ts` | protocol, @colyseus/sdk | REQ-UI-002, REQ-NET-008 | `apps/web/test/connection.test.ts`, `apps/web/test/connection.integration.test.ts` (spawns the real server), `apps/web/e2e/connect.spec.ts` |
| apps/server | Colyseus server: `OfficeRoom` per normalized office code (capacity, join validation, join rate limit) and `GET /health` on one port | `src/main.ts`, `src/app.ts`, `src/rooms/OfficeRoom.ts`, `src/joinRateLimiter.ts`, `src/health.ts` | protocol, @colyseus/core, @colyseus/ws-transport | REQ-NFR-001, REQ-NET-001, REQ-UI-002, REQ-NFR-005 | `apps/server/test/` (integration tests use real `@colyseus/sdk` clients) |

Phase 2 interaction: `apps/web/src/game/interaction/InteractionController.ts` owns targeting, desk claims and sit/work/stand transitions; `Game.ts` wires E/WASD and prompt callbacks; `apps/web/src/ui/Prompt.tsx` renders the prompt through `App.tsx`. Pure controller tests: `apps/web/test/interactionController.test.ts` (REQ-INT-001/002/005).

Phase 2 extras: `apps/web/src/game/interaction/extras.ts` handles coffee/water breaks, sofa sockets and cabinet feedback; `Game.ts` owns action timers and G to wave; `App.tsx` shows timed toasts and the wave hint. Tests: `apps/web/test/extras.test.ts` (REQ-INT-003/004, REQ-AVATAR-004).

Phase 2 identity: `apps/web/src/ui/JoinScreen.tsx` validates the join form, shows connecting and join-error states (Phase 3); `identityStorage.ts` safely persists drafts (tests: `apps/web/test/identityStorage.test.ts`). `App.tsx` owns join/exit lifecycle (one `Connection`; the joined room reaches `Game` as `netRoom`; door exit leaves the room); `apps/web/src/game/hud/Nameplate.ts` renders the player name and activity through Game's CSS2D overlay.

## Do not read (generated, vendored or binary)

`dist/`, `build/`, `coverage/`, `node_modules/`, `assets/` binaries, `except/` images, `.token-ledger/`, lockfiles — unless the task is specifically about them.

## Conventions that help navigation

- One module = one folder with a small public entry (e.g. `index.ts`); other modules import only that entry.
- Keep source files under ~300 lines; split when larger.
- File and folder names match the domain terms in the GDD / MEC specs.
