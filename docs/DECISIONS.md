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
