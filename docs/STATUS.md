# STATUS — project memory
Updated: 2026-11-09 by Claude Code (lead) · Phase: Phase 1 + 2 plans ready → execute Phase 1
Authority: `PRD/` (requirements), `except/` (visual reference), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SPEC.md` (implementation spec). `docs/GDD.md` is deprecated (casual template).

## Done
- Architecture accepted (Codex + agy proposals, lead decision) → `docs/ARCHITECTURE.md`.
- Owner decisions: no accounts/no DB; procedural room + CC0 assets (no Blender); photo-faithful layout enlarged to ~10 x 8 m; Quaternius avatars.
- Asset spike (Kenney Furniture Kit + Quaternius) and floor plan from photos (agy).
- `docs/SPEC.md` written (Codex), cross-reviewed (agy), owner + lead decisions applied; 19 technical open questions remain, none blocking.
- Layout data `docs/layout/office-layout.json` (10 x 8 x 2.7 m, 8 desks, 5 zones, colliders, seat sockets); validator `node docs/layout/validate-layout.mjs` checks bounds, 0.9 m aisles and grid reachability (agy ran it: exit 0; lead reviewed top-down render).
- Owner core-first priority recorded in DECISIONS.
- Proof-of-concepts in `spike/poc/` (gitignored): TV CSS3D pass 5/6, Colyseus 0.18 sync pass 8/8, Quaternius retarget pass after 2 fixes. Findings in DECISIONS.

## Next (ordered)
1. **Execute Phase 1** (`docs/plans/phase-1.md`, 8 tasks), then **Phase 2** (`docs/plans/phase-2.md`, 8 tasks; Tasks 1-6 core, Task 7 secondary) — Codex implements per task; agy runs tests/Playwright and reports; lead reviews screenshots personally.

## Open items
- Find a truly embed-blocked YouTube video id to verify the TV error path.
- Hosting accounts (Cloudflare Pages, Render) needed only at Phase 5.

## Working notes
- Codex sandbox has no network: Codex writes code, agy installs dependencies and runs tests.
- agy has twice reported PASS on broken visuals — always open screenshots before accepting.
- Machine is low on RAM: run one worker at a time; Claude Code may kill background tasks (`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` disables this).
- Key spike artifact to reuse: `spike/poc/avatar/src/retarget.ts`.
