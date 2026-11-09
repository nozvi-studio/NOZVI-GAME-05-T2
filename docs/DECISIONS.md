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
