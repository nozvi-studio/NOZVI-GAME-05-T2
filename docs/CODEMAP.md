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

| packages/protocol | Shared pure TS: layout loader, balance, 2.5D collision, movement step (no React/Three) | `src/layout/layout.ts`, `src/collision.ts`, `src/movement.ts` | — | REQ-ROOM-002, REQ-MOVE-001, REQ-MOVE-002 | `packages/protocol/test/` |
| apps/web/src/game | Three.js room, render loop, lighting/shadows, input, capsule player, orbit camera with ceiling clamp (outside React) | `Game.ts`, `room.ts`, `lighting.ts`, `camera.ts`, `cameraMath.ts` | protocol, three | REQ-ROOM-001, REQ-ROOM-003, REQ-CAM-001 | `apps/web/test/`, `apps/web/e2e/walk.spec.ts`, `apps/web/e2e/visual.spec.ts` (evidence capture to `apps/web/visual-out/`) |
| apps/server | Node HTTP health service (Colyseus arrives in Phase 3) | `src/main.ts`, `src/health.ts` | protocol | REQ-NFR-001 | `apps/server/test/` |

Phase 2 interaction: `apps/web/src/game/interaction/InteractionController.ts` owns targeting, desk claims and sit/work/stand transitions; `Game.ts` wires E/WASD and prompt callbacks; `apps/web/src/ui/Prompt.tsx` renders the prompt through `App.tsx`. Pure controller tests: `apps/web/test/interactionController.test.ts` (REQ-INT-001/002/005).

Phase 2 identity: `apps/web/src/ui/JoinScreen.tsx` validates the join form; `identityStorage.ts` safely persists drafts (tests: `apps/web/test/identityStorage.test.ts`). `App.tsx` owns join/exit lifecycle; `apps/web/src/game/hud/Nameplate.ts` renders the player name and activity through Game's CSS2D overlay.

## Do not read (generated, vendored or binary)

`dist/`, `build/`, `coverage/`, `node_modules/`, `assets/` binaries, `except/` images, `.token-ledger/`, lockfiles — unless the task is specifically about them.

## Conventions that help navigation

- One module = one folder with a small public entry (e.g. `index.ts`); other modules import only that entry.
- Keep source files under ~300 lines; split when larger.
- File and folder names match the domain terms in the GDD / MEC specs.
