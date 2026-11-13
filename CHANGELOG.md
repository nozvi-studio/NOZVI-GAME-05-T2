# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer (0.x until first public release).

## [Unreleased]

### Added

- Server-authoritative activity and seating (T-1036): `intent` messages (sit, stand, toggleWork, drink, wave) queued per client behind earlier inputs (capped at `BALANCE.net.intentQueueMax`) and applied in the 50 ms tick with `nextActivity`, interaction-range checks and one `SeatRegistry` per room (first accepted sit wins); movement input while seated stands up at the interaction point and frees the seat; server drink/wave timers; leaving frees the seat.

- Client connection layer and networked join (T-1035): `apps/web/src/net/` Colyseus wrapper with join/leave, status and typed errors; join screen shows connecting, room full, server unreachable, invalid identity, version mismatch and rate limited with retry; the joined room reaches `Game`; door exit leaves the room; server URL from `VITE_SERVER_URL`; e2e starts the game server next to the web dev server.

- Server-authoritative movement (T-1034): `input` messages validated and queued per client (capped at `BALANCE.net.inputQueueMax`, stale seqs ignored), one input applied per client per 50 ms tick through `applyInput` with layout colliders, replicated `lastSeq` and walking/idle activity.

- Colyseus server (T-1033): `OfficeRoom` per normalized office code, 10 clients max with `room_full` for the 11th and no overflow room, typed join validation, join rate limit per address, `/health` on the same port, `ALLOWED_ORIGINS` CORS.

- Phase 3 wire contract (T-1050): pinned Colyseus 0.18.12 / SDK 0.18.9 / schema 5.0.45, `packages/protocol/src/net/` (room schema, input/intent/join validators, typed join errors, fixed-step `applyInput`), `BALANCE.net`, `PROTOCOL_VERSION` 2.

- Phase 2 join form with name/code validation, avatar selection, safe identity draft storage, player name/activity labels and return to the form through the exit door.

- Phase 2 desk interaction: exclusive seat claims, E to sit and toggle work, WASD to stand, contextual prompts, main-door exit callback and a dev teleport hook.

- Phase 2 secondary interactions: timed coffee/water breaks, G to wave with a persistent hint, first-free sofa seating and cabinet feedback shown for 1.5 seconds.

- Architecture, decisions and proof-of-concept findings (docs/ARCHITECTURE.md, docs/DECISIONS.md).
- Implementation spec with REQ-IDs and PRD traceability (docs/SPEC.md).
- Validated 10 x 8 m office layout data and validator (docs/layout/).
- Phase 1 walkable-office implementation plan (docs/plans/phase-1.md).
- Phase 2 avatars and interaction implementation plan (docs/plans/phase-2.md).
- Phase 1 walkable office: pnpm monorepo with CI, shared protocol package (layout loader, balance config, 2.5D collision, movement), procedural Three.js room, WASD capsule player, spring-damped orbit camera with occlusion, server health endpoint, Playwright walk test.

### Changed

- e2e walk spec: one join for the whole file, condition-based key holds (move a distance / until stopped) instead of fixed waits; README documents full and per-file e2e commands (T-1044).
- Layout data moved to `packages/protocol/src/layout/office-layout.json`; OQ-001 closed at 10 x 8 x 2.7 m.
- Phase 1.1 lighting and camera polish: ACES tone mapping, RoomEnvironment light probe fill, soft 2048 px window-sun shadows fitted to the room (tunables in `BALANCE.rendering`); camera stays below the ceiling, player fades when the camera is close; spawn moved to (-1, 0, -2.7) facing west; `e2e/visual.spec.ts` captures fixed review poses to `apps/web/visual-out/`.

### Fixed

- Five defects in the Phase 1 plan's collision/movement code (corner test geometry, unbounded loop on huge deltas, residual furniture overlap, seam drift, non-finite input); camera no longer shows the outside of the room when the player is against a wall.

### Removed

## [0.0.1] - 2026-11-09

### Added

- Project scaffold: AI agent ruleset v0.6.0 (AGENTS.md, CLAUDE.md, .claude/settings.json) and docs skeleton.
