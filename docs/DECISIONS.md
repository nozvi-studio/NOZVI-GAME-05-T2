# Decision log

Append-only. Format: `## YYYY-MM-DD — <decision>` then Context / Choice / Alternatives / Consequence (1 line each).

## 2026-11-09 — Adopt Studio "AI Vibe-Code Rules" v0.6.0 for a non-casual project

Context: The project is a browser-based multiplayer 3D virtual office, not a mobile casual game.
Choice: Use the casual-game ruleset and GDD template; mobile-casual numeric defaults (one-hand portrait, session length, ads) do not apply.
Alternatives: Write a custom ruleset.
Consequence: GDD sections are adapted to desktop web; `PRD/` remains the detailed requirements source.

## 2026-11-09 — PRD/ and except/ are the authority; casual template is not

Context: docs/ was generated from a casual-game Notion template that does not fit a desktop multiplayer web app.
Choice: Requirements come from `PRD/`, visuals from `except/`; `docs/GDD.md` is deprecated in favour of `docs/ARCHITECTURE.md` + PRD.
Alternatives: Keep adapting the casual GDD.
Consequence: Supersedes the earlier "adopt casual ruleset GDD" decision for product content.

## 2026-11-09 — No accounts, no database

Context: Owner chose PRD §3.2 identity (name + office code, no password) under a zero-cost constraint.
Choice: Name/avatar in localStorage; room state in server memory only.
Alternatives: SQLite light accounts; SQLite office-code allowlist.
Consequence: Rooms and TV state are lost on server restart; office code is not a security mechanism.

## 2026-11-09 — Procedural room shell + CC0 GLB assets, no Blender

Context: Avoid extra installs and paid assets.
Choice: Three.js parametric shell; Kenney furniture + Quaternius characters (CC0).
Alternatives: AI-written Blender scripts; artist-provided GLB.
Consequence: Only Node.js needed; visual fidelity limited by CC0 packs.

## 2026-11-09 — pnpm monorepo, TS strict, Vitest, Colyseus single process

Context: Codex foundation proposal.
Choice: apps/web, apps/server, packages/protocol (shared types, validators, layout, collision).
Alternatives: npm workspaces; Jest.
Consequence: Contributors need pnpm (via corepack).

## 2026-11-09 — Custom 2.5D collision instead of Rapier

Context: Single flat floor, static props; server must validate movement.
Choice: Capsule-vs-AABB sweep-and-slide shared by client and server.
Alternatives: Rapier WASM (~2 MB, harder to share with server).
Consequence: No dynamic physics; acceptable per PRD scope.

## 2026-11-09 — Free hosting: Cloudflare Pages + Render Free

Context: Zero cost; Colyseus needs a long-lived Node process.
Choice: Pages for web, Render Free for server; Oracle Always Free VPS as fallback.
Alternatives: Fly.io, Railway (no lasting free tier), Koyeb (low CPU, far region).
Consequence: ~1 min cold start after 15 min idle; UI must handle it.

## 2026-11-09 — Layout: photo-faithful office, enlarged to ~10 x 8 m (owner)

Context: The real office in `except/` measures ~6 x 8 m with 8 seats; too tight for the PRD Entertainment Zone (sofa, coffee table).
Choice: Keep the photo layout and palette (8 desks in two pods, TV wall, entrance, pantry) and widen the room so Entertainment, Pantry and Storage zones are distinct.
Alternatives: Exact 6 x 8 m replica (drops sofa); free-form layout.
Consequence: Layout data starts from the agy floor-plan JSON and is extended, not used verbatim.

## 2026-11-09 — Avatars: Quaternius characters + Universal Animation Library (owner)

Context: PRD asks for semi-realistic stylized characters; Kenney Mini Characters are chibi.
Choice: Quaternius CC0 characters with UAL clips (Idle, Walk, Sitting_Enter/Idle/Exit, Interact); Kenney Furniture Kit for props.
Alternatives: Kenney Mini Characters (lightest, shared rig, off-style).
Consequence: Bone retargeting work; typing and drinking clips must be composed (no CC0 source found; Mixamo is not CC0).

## 2026-11-09 — Proof-of-concept results (spike/poc, not committed)

Context: Validate the three highest technical risks before writing specs.
Choice: Keep the accepted architecture; findings below become spec requirements.

- TV (CSS3D + YouTube IFrame API, three 0.187): muted autoplay, orbit through pointer-events:none, depth-only occluder and TV-mode toggle all work. Clicking inside the iframe steals keyboard focus, so TV mode needs an on-screen exit and focus recovery. Embed-blocked error path still unverified (need a truly blocked video id).
- Multiplayer (Colyseus 0.18.12, @colyseus/sdk 0.18.9, @colyseus/schema 5.0.45): room per office code via custom roomId, movement sync at 20 Hz, TV state sync and 20 s reconnection pass. 0.18 API differs from older docs (Room<{state}>, onLeave(client, code), CloseCode). SDK auto-reconnect requires 5 s minimum room uptime; client needs its own retry/rejoin path.
- Avatars (Quaternius Modular Men/Women Suit + Universal Animation Library): rigs differ (49/51 vs 53 joints, rest rotations up to ~90 deg apart), so clips need world-space rest-pose retargeting plus hip-motion transfer. Working implementation: spike/poc/avatar/src/retarget.ts (port into apps/web). Height ~1.85 m; Sitting_Idle_Loop aligns with a 0.45 m seat.
  Alternatives: Kenney Mini Characters (shared rig, no retarget) remain the fallback.
  Consequence: Retargeting becomes an explicit Phase 2 task with a numeric pose check test.

## 2026-11-09 — Core-first priority; PRD deviations accepted (owner)

Context: SPEC cross-review surfaced PRD conflicts; owner clarified what matters most.
Choice: Release-critical core = join a room, see other employees in real time, move, sit at a workstation, and watch a shared YouTube TV. Other interactions (coffee, wave, sofa rest, doors, cabinets) follow after the core works; lockers and most props are decorative. Accepted deviations: Quaternius Suit avatars instead of stylized big-head proportions; curated video catalog + pasted YouTube URL instead of live search (no Data API key); 8 photo-faithful desks with first-come seating; room 10 x 8 x 2.7 m (DEC over ARCH 10 x 7 x 2.8); closing the TV is local, Stop is shared.
Alternatives: Build every SRS interaction to equal depth before release; live YouTube search.
Consequence: Phase plans order core tasks first; SPEC "Resolved decisions" lists the full set.

## 2026-11-09 — OQ-001 closed: room is 10 x 8 x 2.7 m (PM, decide + inform)

Context: SPEC OQ-001 left ARCH (~10 x 7 x 2.8 m) and the owner layout decision (~10 x 8 m) in conflict.
Choice: Use the accepted layout JSON (10 x 8 x 2.7 m), which implements the owner's decision; ARCH updated.
Alternatives: Keep 2.8 m height (no requirement depends on it).
Consequence: Phase 1 tests assert 10 x 8 x 2.7; changing the room size later means editing only the layout JSON.

## 2026-11-09 — Phase 1 runs in the cloud session with Claude subagents (owner)

Context: Owner asked the PM to manage Phase 1 in this session instead of Codex + agy on the local machine.
Choice: Batches A–D per `docs/plans/phase-1-execution.md`; PM re-verifies every batch; `@playwright/test` pinned to the pre-installed Playwright (1.63.0).
Alternatives: Local Codex + agy execution as planned in phase-1.md.
Consequence: phase-1.md stays the build source; the execution brief records roles, contracts and acceptance.

## 2026-11-10 — Phase 1.1 lighting and spawn trade-offs (implementer, for PM review)

Context: Phase 1.1 brief asked for `RoomEnvironment` + `PMREMGenerator` environment lighting, `PCFSoftShadowMap`, and a spawn moved within the Entrance zone so the capsule fills < 20% of the frame.
Choice: (1) Bake `RoomEnvironment` into a spherical-harmonics `LightProbe` (`LightProbeGenerator`) instead of a PMREM `scene.environment`; (2) `PCFShadowMap` with `shadow.radius`, because three r187 removed `PCFSoftShadowMap` (it now only warns and falls back); (3) shell walls receive but do not cast shadows, since the sun enters through the south window that is part of `wall_south`; (4) spawn at (-1, 0, -2.7) with rotY 270 (facing west) — the Entrance strip is only 1.6 m deep, so a south-facing spawn always pins the camera against the north wall.
Alternatives: PMREM environment (same diffuse look on these roughness-1 materials, but measured ~165 vs ~88 ms per frame under SwiftShader and it made `walk.spec.ts` time out of its key holds); south-facing spawn with a ~1.4 m camera.
Consequence: no specular environment reflections until Phase 2 materials need them (switch back to PMREM then and re-measure); `walk.spec.ts` "walls stop the player" starts from a fixed pose 0.9 m from the north wall via the DEV hook.

## 2026-11-13 — Room widened to 12 x 9.6 x 2.7 m (owner, Phase 2.1 T-1014)

Context: Owner feedback after Phase 2: the 10 x 8 m office feels tight, especially the aisles. Owner asked for +20% per horizontal dimension, stretched evenly on all sides.
Choice: Room becomes 12 x 9.6 x 2.7 m. Floor positions scale by 1.2 about the room center; each furniture assembly moves rigidly by its own center (back-to-back desk pairs as one block, so desks stay joined and seat sockets stay on their chairs); wall-mounted items (main door, TV, AC, utility door, window) stay on their walls. No size, furniture or zone changes. The validator now reads the footprint from `ROOM_W` / `ROOM_D` constants.
Alternatives: Scale every coordinate by 1.2 (splits desk pairs with 0.12 m slits and detaches wall-mounted items); stretch only the aisles.
Consequence: Minimum exposed circulation gap rises from 0.9 m to 1.15 m. Wall-hugging free-standing furniture sits up to ~0.2 m off the wall. Tests and e2e poses use the new coordinates; supersedes the 10 x 8 x 2.7 m entry of 2026-11-09.

## 2026-11-13 — Phase 3 packages pinned; schema without decorators (T-1050)

Context: REQ-NET-007 requires the PoC baseline pinned exactly after a registry check. Owner approved the install and the five plan §6 defaults (phase-3.md) on 2026-11-13.
Choice: `colyseus` 0.18.12 and `@colyseus/schema` 5.0.45 (server), `@colyseus/schema` 5.0.45 (protocol), `@colyseus/sdk` 0.18.9 (web), all exact; all three baseline versions exist on the registry. Divergence: `colyseus` 0.18.12 declares `@colyseus/core ^0.18.10`, so the lockfile resolves core 0.18.28 and ws-transport 0.18.5 (the PoC's core version was not recorded). Schema classes use the `schema()` / `t.*` builder instead of `@type` decorators, so one module compiles under tsx and Vite with no `experimentalDecorators` setting. Positions and heading replicate as float64 so reconciliation compares the exact server result. One input = one fixed 50 ms step through `applyInput` (phase-3.md §3.2).
Alternatives: Decorator classes server-only with plain client types (needs legacy decorator config, two definitions); float32 positions (smaller patches, but reconciliation would see rounding corrections every patch).
Consequence: The web bundle includes `@colyseus/schema` (the SDK needs it anyway). Compatibility of core 0.18.28 with the 0.18 API is verified by the T-1033 integration tests, not assumed. `pnpm install` runs with esbuild and msgpackr-extract build scripts ignored (pnpm 10 default); msgpackr falls back to pure JS.

## 2026-11-13 — Server depends on @colyseus/core directly; one core instance (T-1033)

Context: With the `colyseus` meta-package, pnpm installed two copies of `@colyseus/core` 0.18.28 (core and ws-transport peer-depend on each other), so the transport and the rooms used different matchmaker singletons and every join failed with "seat reservation expired".
Choice: `apps/server` depends on `@colyseus/core` 0.18.28, `@colyseus/ws-transport` 0.18.5 and `express` 5.3.0 (ws-transport's required peer) instead of `colyseus` 0.18.12, and `pnpm-workspace.yaml` sets `dedupePeers: true`; the lockfile now has one core instance. `@colyseus/sdk` 0.18.9 is a server devDependency for the integration tests. Rooms are matched on the normalized office code (`filterBy(['officeCode'])` with a normalizing `getFilterOptions`) and the room id is the code; a second room for a code is refused in `onCreate` with `room_full`. `/health` is a Colyseus router endpoint on the same HTTP server.
Alternatives: Keep the meta-package (drags in auth, monitor, playground, redis driver and the duplicate core); `matchMaker.joinById` with client-side create (race on first join).
Consequence: Supersedes the `colyseus` 0.18.12 pin of the previous entry; the 0.18 room API (`Room<{state}>`, `onLeave(client, code)`) is unchanged. A rejection raised in `onCreate` reaches the client as HTTP 500 with the code string as message, so clients match on the message. The join rate limit uses the socket address; Colyseus' own `context.ip` trusts X-Forwarded-For and is not used until Phase 5.

## 2026-11-13 — Client prediction: rate cap, local seating and dev teleport (T-1037)

Context: The local player is now driven by fixed-step prediction (`apps/web/src/net/prediction.ts`) reconciled against the server's `x, z, heading, lastSeq`. The server has no teleport and does not own seats until T-1036 / T-1039.
Choice: Steps follow the frame clock (backlog capped at three steps) and a sliding window defers any step that would make more than `BALANCE.net.tickHz` inputs in one second, so frames that batch two steps never exceed 20 per second. Replays within `BALANCE.net.reconcileEpsilon` (1 mm) change nothing; larger corrections are blended over `BALANCE.net.correctionBlendSeconds` (0.15 s). The DEV `teleport` / `setPose` hook detaches prediction from server patches for the rest of the session (inputs are still sent), so e2e poses keep working without a server change. Sitting stays local; standing re-bases the prediction at the stand point and the next patch blends it back to the server position.
Alternatives: A dev-only server teleport message (needs a server change, out of scope for T-1037); snapping corrections (visible pops); ignoring the rate cap edge case (21 inputs in a one-second window when frames batch steps).
Consequence: After a dev teleport the local client no longer matches the server (remote viewers see the server position). Until T-1039 sends sit intents, the server never seats the local player, so standing up slides the avatar back to where E was pressed. The T-1036 server stands a seated player at the seat's interaction point before applying a moving input; the client's re-base at the stand point mirrors that, so once T-1039 lands the stand should need no correction (to be verified there).
