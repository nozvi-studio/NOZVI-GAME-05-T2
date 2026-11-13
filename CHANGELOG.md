# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: SemVer (0.x until first public release).

## [Unreleased]

### Added

- Phase 3 verification (T-1041): headless walking bots `pnpm --filter @office/server bots` (`apps/server/scripts/bots.ts`); e2e `ten.spec.ts` (nine walking bots plus one browser fill a room, the list and board show 10, the eleventh join gets room-full headless and in the browser); dev-only network test profile on the server (`NET_PROFILE=test`, `apps/server/src/netProfile.ts`: in-order delay of 100 ms ± 20 ms with 1% 200 ms retransmit spikes, values in `BALANCE.net.testProfile`, off by default and never with `NODE_ENV=production`) and the manual 10-minute soak `netProfile.spec.ts` (skipped unless `NET_PROFILE=test`); Phase 3 acceptance record in `docs/plans/phase-3.md` §10.

- Disconnect handling (T-1051): an unexpected drop keeps the employee and its seat for `BALANCE.net.reconnectSeconds` (20 s) with `connected = false` (server `onDrop` + `allowReconnection`; a consented leave or expiry removes both at once); the client runs its own retry path (`apps/web/src/net/reconnect.ts`, attempts after 1/2/4/8 s with the token in `sessionStorage`, SDK auto-reconnect off), resumes the same employee with a full resync (prediction snapped to the server, remote avatars and list rebuilt), then offers Rejoin (resume if still held, else a fresh join with the same identity); connection banner with retry countdown; "Reconnecting…" marker on remote nameplates and in the employee list; e2e `reconnect.spec.ts`, and `remote.spec.ts` / `employees.spec.ts` leave through the door (consented).

- Replicated seats and activities (T-1039): the client no longer owns seats; `InteractionController` reads occupancy from room state ("Desk taken" for seats other employees hold) and sends `intent` messages for sit, toggleWork, drink, sofa rest and wave; the local player sits, works, rests and takes breaks only when the server state confirms (no optimistic sit), prediction pauses on the seat socket and resumes by replaying unacknowledged inputs from the server position; client drink/wave timers removed; remote avatars sit on the seat socket instead of the interpolated position; e2e `seats.spec.ts` (two pages) and `sit.spec.ts` walk to the desk with keys.

- Online employee list and entrance count board (T-1040): `apps/web/src/ui/EmployeeList.tsx` panel lists every employee in the room with the shared activity label, local player first and marked "(you)", names as text; driven by the plain-TS `ui/employeeRoster.ts` store (`useSyncExternalStore`, notifies only on join, leave, name, label or connection change); decorative `game/hud/EntranceBoard.ts` on the entrance wall shows "Online: N" (one unlit plane with a canvas texture, +1 draw call, no shadow); dev hook `getBoardText()`; e2e `employees.spec.ts`.

- Client prediction and reconciliation (T-1037): the local player moves in fixed 50 ms steps through the shared `applyInput`, sends `input` with seq from 1 (at most 20 per second), renders a partial step for no added input lag, and on each patch replays unacknowledged inputs from the server state; corrections above `BALANCE.net.reconcileEpsilon` blend over `BALANCE.net.correctionBlendSeconds`; the dev teleport hook detaches from server patches.

- Remote avatars (T-1038): `apps/web/src/game/remote/RemoteAvatars.ts` adds one avatar and nameplate per remote employee and disposes both on leave; poses come from the pure `apps/web/src/net/interpolation.ts` buffer 100 ms in the past (shortest-arc heading, last pose held when dry); avatar GLBs load once per `avatarId` and are cloned; shared `activityLabel`; dev hook `getRemotes()` / `getRemoteCount()`; two-page e2e `remote.spec.ts`.

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

- Docs for Phase 3 (T-1041): ARCHITECTURE §5 (server packages, name length 1 to 20, rate limits per SPEC, fixed-step input), DECISIONS (fixed-step model and owner-confirmed plan §6 defaults; network profile), CODEMAP, STATUS, README commands.
- e2e walk spec: one join for the whole file, condition-based key holds (move a distance / until stopped) instead of fixed waits; README documents full and per-file e2e commands (T-1044).
- Layout data moved to `packages/protocol/src/layout/office-layout.json`; OQ-001 closed at 10 x 8 x 2.7 m.
- Phase 1.1 lighting and camera polish: ACES tone mapping, RoomEnvironment light probe fill, soft 2048 px window-sun shadows fitted to the room (tunables in `BALANCE.rendering`); camera stays below the ceiling, player fades when the camera is close; spawn moved to (-1, 0, -2.7) facing west; `e2e/visual.spec.ts` captures fixed review poses to `apps/web/visual-out/`.

### Fixed

- Five defects in the Phase 1 plan's collision/movement code (corner test geometry, unbounded loop on huge deltas, residual furniture overlap, seam drift, non-finite input); camera no longer shows the outside of the room when the player is against a wall.

### Removed

## [0.0.1] - 2026-11-09

### Added

- Project scaffold: AI agent ruleset v0.6.0 (AGENTS.md, CLAUDE.md, .claude/settings.json) and docs skeleton.
