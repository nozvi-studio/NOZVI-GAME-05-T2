# Phase 3 — Multiplayer Foundation

> Status: Implemented, 2026-11-13 (verification in §10; owner checks pending). Branch: `feat/phase-3` (create from `dev` after Phase 2.1 merges). Tracked in Meridian as FEAT-51 with tech spec doc `phase-3-multiplayer-tech-spec`; task ids are in §4 ("proposal" means it awaits owner approval in Meridian). This plan lists design, scope and acceptance; step-by-step implementation detail belongs in each task.

**Goal:** 3 to 10 employees join the same office code and see each other move, sit, work and take breaks in real time, with no ghost avatars after a disconnect (`PRD/RoadMap.md` Phase 3).

**Requirements covered:** REQ-NET-001 to REQ-NET-008, REQ-UI-003, the P3 parts of REQ-UI-001, REQ-UI-002, REQ-INT-002, REQ-NFR-004 and REQ-NFR-005 (`docs/SPEC.md`).

## 1. Starting point

- `apps/server` is a 16-line HTTP health service; no Colyseus package is installed anywhere.
- `packages/protocol` already holds what the server needs for authority: `stepPlayer` and the collision solver, `nextActivity`, `SeatRegistry`, `findInteractionTarget`, identity validators and the layout.
- `apps/web` runs a single local player: `Game.ts` steps `Player` with a variable frame `dt`, and `InteractionController` claims seats in a local `SeatRegistry`.
- The Colyseus proof-of-concept passed 8/8 (`docs/DECISIONS.md`, 2026-11-09) but lives in the gitignored `spike/` folder; it is evidence, not delivered code.

## 2. Entry gates

| Gate                                                             | Blocks                 | Why                                                             |
| ---------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| Owner approves installing the Colyseus packages                  | Task 1                 | AGENTS.md §8; agy installs                                      |
| Phase 2.1 merged: room 12 x 9.6 m (T-1014) and one green e2e run | Tasks 5 to 11 (client) | Client tasks touch `Game.ts` and e2e; they need a verified base |
| Owner FPS measurement and draw-call budget (Phase 2.1 task 5)    | Task 7 acceptance      | Up to 9 remote avatars multiply skinned-mesh draw calls         |

Tasks 1 to 4 (protocol and server) do not depend on the room size, because the layout is data, and may start while Phase 2.1 is still running.

## 3. Design

### 3.1 Wire contract (`packages/protocol/src/net/`)

- Room state (Colyseus Schema): `OfficeState { employees: Map<sessionId, EmployeeState> }`. `EmployeeState { name, avatarId, x, z, heading, activity, seatId, connected, lastSeq }`.
- Client to server messages: `input { seq, forward, right, run, yaw }` and `intent { type: sit | stand | toggleWork | drink | wave, seatId? }`. Each has a validator that rejects non-finite numbers, out-of-range axes and unknown ids.
- Join options: `{ name, officeCode, avatarId, protocolVersion }`, validated with the existing identity validators. Typed join errors: `room_full`, `invalid_identity`, `version_mismatch`, `rate_limited`.
- Network tuning goes into `BALANCE.net`: tick 20 Hz, patch 50 ms, interpolation delay 100 ms, reconnect window 20 s, backoff 1/2/4/8 s, max clients 10, input queue cap, join limit 10 per minute per IP.
- `PROTOCOL_VERSION` moves to 2.

### 3.2 Fixed-step movement (the key design decision)

Today the client steps movement with the variable frame `dt`. The server will step at a fixed 50 ms. Two different step sizes through a sweep-and-slide solver give slightly different positions near walls, which breaks reconciliation.

Decision: one input equals one fixed 50 ms step on both sides.

- Client: every 50 ms it samples the keyboard and camera yaw, applies `stepPlayer(state, input, yaw, 0.05, colliders)`, stores the input in a pending buffer and sends it with a sequence number. For rendering it applies a throwaway partial step for the time left over since the last fixed step, so the local avatar has no added input lag.
- Server: each tick it consumes queued inputs per client with the same function and writes the result plus `lastSeq`. The queue is capped, so flooding inputs cannot move a player faster than real time.
- Reconciliation: on each patch the client resets to the server position, drops inputs up to `lastSeq` and replays the rest. Because both sides run identical code on identical inputs, the result normally equals the predicted position and nothing visibly moves. A visible correction happens only when the server rejected something.

### 3.3 Server (`apps/server`)

- One `OfficeRoom` per normalized office code, custom room id, `maxClients = 10`, single Node process. `/health` stays on the same HTTP server.
- The server owns position, heading, activity and seats. It reuses `stepPlayer`, `nextActivity` and `SeatRegistry` from `packages/protocol`, checks interaction range for sit and pantry intents, and runs the drink and wave timers.
- A client can only change its own employee through `input` and `intent`. There is no message that sets state directly.
- Leave: a consented leave removes the employee and frees the seat at once. An unexpected drop sets `connected = false`, keeps the avatar and seat for 20 s (`allowReconnection`), then removes both.

### 3.4 Client (`apps/web`)

- `src/net/`: a connection wrapper around `@colyseus/sdk` (join, leave, status, typed errors), the prediction buffer, the interpolation buffer and the reconnect state machine. These are plain TypeScript with no Three.js import so they are unit-testable.
- `src/game/remote/`: `RemoteAvatars` adds and removes an `AvatarView` plus nameplate per remote employee, samples the interpolation buffer 100 ms in the past, and maps replicated `activity` and `seatId` to animation and seat pose. Avatar GLBs are loaded once per `avatarId` and cloned.
- `InteractionController` stops owning seats. It reads seat occupancy from room state and sends intents; the player sits when the server confirms.
- UI: join screen shows connecting, room full and server unreachable; a 2D online employee list; a decorative entrance board with the online count; a connection banner with retry countdown and a Rejoin button.
- The game always runs against a server. There is no offline mode; e2e starts the server next to the web dev server.

## 4. Tasks

| #   | Meridian | Task                                                                  | Size | Depends on | Requirements                          |
| --- | -------- | --------------------------------------------------------------------- | ---- | ---------- | ------------------------------------- |
| 1   | proposal | Pin Colyseus packages; wire contract, schema and `BALANCE.net`        | M    | owner OK   | REQ-NET-007, REQ-NET-008, REQ-NFR-004 |
| 2   | T-1033   | Server: `OfficeRoom`, room per office code, join validation, capacity | M    | 1          | REQ-NET-001, REQ-UI-002, REQ-NFR-005  |
| 3   | T-1034   | Server: authoritative fixed-step movement at 20 Hz                    | M    | 2          | REQ-NET-002, REQ-NET-003              |
| 4   | T-1036   | Server: authoritative activity and seats                              | M    | 3          | REQ-NET-002, REQ-INT-002              |
| 5   | T-1035   | Client: connection layer and networked join flow                      | M    | 2, P2.1    | REQ-UI-002, REQ-NET-008               |
| 6   | T-1037   | Client: fixed-step prediction and reconciliation                      | L    | 3, 5       | REQ-NET-003, REQ-NET-004              |
| 7   | T-1038   | Client: remote avatars with interpolation and nameplates              | L    | 5          | REQ-NET-004, REQ-UI-001               |
| 8   | T-1039   | Client: replicated seats and activities                               | M    | 4, 6, 7    | REQ-NET-002, REQ-INT-002              |
| 9   | T-1040   | Online employee list and entrance count board                         | S    | 7          | REQ-UI-003                            |
| 10  | proposal | Disconnect, 20 s reconnect, backoff and rejoin                        | L    | 8          | REQ-NET-005, REQ-NET-006, REQ-UI-003  |
| 11  | T-1041   | Multi-client verification, draw-call measurement, docs                | M    | 9, 10      | REQ-NET-001, REQ-NET-004              |

**Milestone A (after task 7):** two browsers on one office code see each other walk. Stop here for a short LAN playtest with two or three colleagues before investing in tasks 8 to 10. If remote movement looks wrong, fix it before adding seats and reconnect on top.

**Milestone B (after task 11):** Phase 3 acceptance below.

## 5. Phase acceptance

- Two browser clients on the same code see each other's avatar, position, heading and animation; a third on another code sees neither (Playwright, two pages).
- One client sits, works and stands; the other sees the same seat and state; two simultaneous sit requests on one desk give exactly one winner (unit + Playwright).
- Ten headless bot clients fill a room while one browser observes; the eleventh join gets the room-full message and no second room is created.
- Dropping a client shows a "reconnecting" marker; it comes back within 20 s with full state, or is removed with its list entry after 20 s; a consented leave removes it at once. No avatar remains without a session.
- Controlled-clock unit tests prove the 50 ms tick, at most 20 input sends per second, the 100 ms interpolation delay, and the 1/2/4/8 s backoff followed by Rejoin.
- `pnpm check` passes; one green foreground Playwright run by the owner.

## 6. Decisions the owner needs to confirm

Each has a default so work is not blocked; say so if you want a different one.

1. **Ten-client test uses headless bots, not ten browsers.** REQ-NET-001 says Playwright with ten clients. Ten software-WebGL browsers will not fit in this machine's RAM (three already get killed). Default: ten Node SDK bots plus one observing browser now; a real ten-person session is the Phase 5 stress test.
2. **No offline mode.** Default: the game always connects to a server. Cost: local visual work and every e2e run need the server process. Benefit: one code path instead of two.
3. **`away` status stays unused in Phase 3 (OQ-010).** Default: status is `working` or `online` as today; "reconnecting" is a separate `connected` flag, not a status. An idle timer for `away` is not specified anywhere and is not invented here.
4. **Seating waits for the server (about 50 to 150 ms).** Default: no optimistic sit. Simpler, and it cannot show a seat you then lose.
5. **Join rate limit ignores proxy headers until Phase 5.** Default: limit by socket address now; `X-Forwarded-For` handling is added when the Render deployment exists and can be tested.

## 7. Out of scope

Shared TV (Phase 4), deployment and hosting accounts (Phase 5), chat, accounts, database, more than one server process, loading-screen polish, settings UI, mobile.

## 8. Risks

| Risk                                                                                              | Mitigation                                                                                                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Schema classes use decorators; the web build may not compile them from `packages/protocol` source | Task 1 proves the schema compiles under `tsx` and `vite build`; the client may import schema types only      |
| Registry versions have moved past the tested 0.18 baseline                                        | Pin the tested versions exactly (REQ-NET-007); record any divergence in DECISIONS                            |
| Prediction and server diverge near colliders                                                      | Fixed 50 ms step on both sides; a determinism test runs the same input trace through client and server code  |
| Ten avatars exceed the draw-call budget                                                           | Measure in task 7 with `__office.getDrawCalls()`; budget decision comes from Phase 2.1                       |
| e2e with two pages plus a server exceeds RAM                                                      | One worker, foreground run by the owner, logic covered by Node tests; only two specs use two pages           |
| Reconnect is the least predictable part (SDK auto-reconnect needs 5 s room uptime)                | Own retry path (REQ-NET-006); scheduled last so the core demo does not wait on it                            |
| WebSocket runs on TCP, so "1% loss" appears as delay spikes, not missing packets                  | Dev-only server flag adds latency and jitter to approximate the 100 ms RTT profile; record what was measured |
| Phase 2.1 slips                                                                                   | Server tasks 1 to 4 proceed in parallel; client tasks wait                                                   |

## 9. Documents to update when the phase lands (task 11)

`docs/CODEMAP.md` (server and `net` rows), `docs/ARCHITECTURE.md` §5 (name length is 1 to 20 per SPEC, not 1 to 24; rate limits per SPEC), `docs/DECISIONS.md` (fixed-step input model and the confirmed items from §6), `docs/STATUS.md`, `CHANGELOG.md`.

## 10. Verification record (task 11, T-1041, 2026-11-13)

Environment: Claude Code cloud container (Linux, Node 22, headless Chromium with SwiftShader software WebGL, 1280x720, one Playwright worker). Software-rendered numbers are evidence of behaviour, not of real-hardware performance.

**Ten-client check** (`apps/web/e2e/ten.spec.ts`, plan §6 item 1): one browser plus nine headless bots walking 2 m squares at 20 inputs/s. The browser's list shows the ten names, the entrance board reads "Online: 10" and nine remote avatars render. The eleventh join is refused twice: a headless bot gets `room_full`, and a second browser shows "This office is full" with no game started; the observer still lists ten. Measured in that browser: 352 draw calls (158 main + 194 shadow), 145,296 triangles, 6.4 FPS over 3 s. Manual equivalent: `pnpm --filter @office/server bots -- --code TEN-01 --count 11` printed ten joins and `Bot11 rejected: room_full`.

**Network profile soak** (`NET_PROFILE=test`, `apps/web/e2e/netProfile.spec.ts`, 10.1 min): profile 100 ms ± 20 ms added downlink delay with 1% of messages delayed a further 200 ms (TCP retransmit model: a "lost" message is late and holds back the ones behind it; nothing goes missing). One browser observed nine walking bots and walked its own player for 1 s every 20 s.

| Measure                                                    | Result                                       |
| ---------------------------------------------------------- | -------------------------------------------- |
| Patches received by one bot                                | 11,944; gap p50 49 ms, p99 89 ms, max 284 ms |
| Patch gaps over 150 ms (retransmit spikes)                 | 111                                          |
| Remote avatar frame samples                                | 14,040                                       |
| Remote frames faster than 3 m/s (1.5x walk) and over 0.1 m | 87 (0.6%), max 8.1 m/s, max step 2.26 m      |
| Local player frames over the same threshold                | 1 (max 13.3 m/s)                             |
| Browser frame rate / longest frame                         | 2.6 FPS / 1,259 ms                           |
| Draw calls at the end (10 employees)                       | 368 (174 main + 194 shadow), 146,716 tris    |

Observed result: **jumps seen**. Remote movement is continuous for 99.4% of frames; the remaining 0.6% are most likely catch-up steps after the 100 ms interpolation buffer runs dry: their count is in line with the 111 patch gaps longer than 150 ms (not proven frame by frame). The local player had one visible correction in 10 minutes. At 2.6 FPS every frame is coarse, so the owner should judge the visual quality on real hardware; OQ-017 still has no numeric jump threshold.

**REQ-NET-007 baseline**: manifests pin `@colyseus/core` 0.18.28, `@colyseus/ws-transport` 0.18.5, `@colyseus/schema` 5.0.45 (server and protocol) and `@colyseus/sdk` 0.18.9 (web, server dev); the lockfile resolves exactly these with one core instance. Divergence from the tested `colyseus` 0.18.12 is the one recorded in DECISIONS (T-1050, T-1033) and covered by the server integration tests; nothing new.

**Phase acceptance (§5)**

| Item                                                                                                                          | State                                                                                                                                                         | Evidence                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Two browsers on one code see each other's avatar, position, heading, animation; another code sees neither                     | Done                                                                                                                                                          | e2e `remote.spec.ts` (two pages)                                                                                                              |
| Sit / work / stand seen remotely; simultaneous sit gives one winner                                                           | Done                                                                                                                                                          | `apps/server/test/activity.test.ts` (same-tick contest), e2e `seats.spec.ts`                                                                  |
| Ten clients fill a room while a browser observes; eleventh gets room-full, no second room                                     | Done (owner default: nine bots + one browser = ten)                                                                                                           | e2e `ten.spec.ts`, `connect.spec.ts` (ten bots, browser refused), `apps/server/test/officeRoom.test.ts` (11th `room_full`, one room per code) |
| Drop shows "reconnecting"; back within 20 s with full state, or removed after 20 s; consented leave removes at once; no ghost | Done                                                                                                                                                          | e2e `reconnect.spec.ts`, `employees.spec.ts` (door exit), `officeRoom.test.ts` (hold, restore, expiry)                                        |
| Controlled-clock unit tests: 50 ms tick, ≤ 20 sends/s, 100 ms interpolation, 1/2/4/8 s backoff then Rejoin                    | Done                                                                                                                                                          | `apps/server/test/movement.test.ts`, `officeRoom.test.ts`; `apps/web/test/prediction.test.ts`, `interpolation.test.ts`, `reconnect.test.ts`   |
| `pnpm check` passes; one green foreground Playwright run by the owner                                                         | Agent runs green: `pnpm check` (protocol 80, server 72, web 131 unit tests; build ok); full e2e 20 passed, 1 skipped (soak) in 7.0 min; **owner run pending** | `pnpm check`, `pnpm --filter @office/web e2e --trace off`                                                                                     |

**Open gaps (owner only)**

1. FPS and draw calls on a normal desktop with ten employees (REQ-PERF-001); the numbers above are SwiftShader only.
2. Draw-call budget decision: ten employees measure 352 to 368 calls (about 160 to 175 main pass) and about 146k triangles, against the 45-call and 120k-triangle targets. Still open since T-1038.
3. LAN playtest with real browsers on several machines, including a visual judgement of remote smoothness under the network profile.
4. One foreground Playwright run by the owner.
