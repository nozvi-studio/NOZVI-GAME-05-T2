# STATUS — project memory
Updated: 2026-11-09 by Claude Code (lead) · Phase: pre-spec done → Specs next
Authority: `PRD/` (requirements), `except/` (visual reference), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`. `docs/GDD.md` is deprecated (casual template).

## Done
- Architecture accepted (Codex + agy proposals, lead decision) → `docs/ARCHITECTURE.md`.
- Owner decisions: no accounts/no DB; procedural room + CC0 assets (no Blender); photo-faithful layout enlarged to ~10 x 8 m; Quaternius avatars.
- Asset spike (Kenney Furniture Kit + Quaternius) and floor plan from photos (agy).
- Proof-of-concepts in `spike/poc/` (gitignored): TV CSS3D pass 5/6, Colyseus 0.18 sync pass 8/8, Quaternius retarget pass after 2 fixes. Findings in DECISIONS.

## Next (ordered)
1. **Specs** — Codex turns PRD into English `docs/SPEC.md`: requirement IDs (REQ-xxx), measurable acceptance criteria, PoC findings (TV focus exit, client rejoin retry, Colyseus 0.18 API, retarget task).
2. **Cross-review** — agy reviews SPEC against PRD for gaps/conflicts; lead decides; ask owner only on core-feature questions.
3. **Layout data** — extend agy floor-plan JSON to ~10 x 8 m with distinct Pantry/Storage/Entertainment (sofa, coffee table) zones.
4. **Phase 1 plan** — `docs/plans/phase-1.md`: monorepo scaffold (pnpm, apps/web, apps/server, packages/protocol), procedural room, third-person camera, WASD + shared 2.5D collision, placeholder capsule avatar. Small tasks with verification commands.
5. **Execute Phase 1** — Codex implements per task; agy runs tests/Playwright and reports; lead reviews screenshots personally.

## Open items
- Find a truly embed-blocked YouTube video id to verify the TV error path.
- Hosting accounts (Cloudflare Pages, Render) needed only at Phase 5.

## Working notes
- Codex sandbox has no network: Codex writes code, agy installs dependencies and runs tests.
- agy has twice reported PASS on broken visuals — always open screenshots before accepting.
- Machine is low on RAM: run one worker at a time; Claude Code may kill background tasks (`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` disables this).
- Key spike artifacts to reuse: `spike/poc/avatar/src/retarget.ts`, agy floor-plan JSON (copy into the layout task brief).
