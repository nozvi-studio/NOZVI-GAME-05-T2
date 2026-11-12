# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer (0.x until first public release).

## [Unreleased]

### Added

- Phase 2 desk interaction: exclusive seat claims, E to sit and toggle work, WASD to stand, contextual prompts, main-door exit callback and a dev teleport hook. Secondary furniture effects remain deferred to Task 7.

- Architecture, decisions and proof-of-concept findings (docs/ARCHITECTURE.md, docs/DECISIONS.md).
- Implementation spec with REQ-IDs and PRD traceability (docs/SPEC.md).
- Validated 10 x 8 m office layout data and validator (docs/layout/).
- Phase 1 walkable-office implementation plan (docs/plans/phase-1.md).
- Phase 2 avatars and interaction implementation plan (docs/plans/phase-2.md).
- Phase 1 walkable office: pnpm monorepo with CI, shared protocol package (layout loader, balance config, 2.5D collision, movement), procedural Three.js room, WASD capsule player, spring-damped orbit camera with occlusion, server health endpoint, Playwright walk test.

### Changed

- Layout data moved to `packages/protocol/src/layout/office-layout.json`; OQ-001 closed at 10 x 8 x 2.7 m.
- Phase 1.1 lighting and camera polish: ACES tone mapping, RoomEnvironment light probe fill, soft 2048 px window-sun shadows fitted to the room (tunables in `BALANCE.rendering`); camera stays below the ceiling, player fades when the camera is close; spawn moved to (-1, 0, -2.7) facing west; `e2e/visual.spec.ts` captures fixed review poses to `apps/web/visual-out/`.

### Fixed

- Five defects in the Phase 1 plan's collision/movement code (corner test geometry, unbounded loop on huge deltas, residual furniture overlap, seam drift, non-finite input); camera no longer shows the outside of the room when the player is against a wall.

### Removed

## [0.0.1] - 2026-11-09

### Added

- Project scaffold: AI agent ruleset v0.6.0 (AGENTS.md, CLAUDE.md, .claude/settings.json) and docs skeleton.
