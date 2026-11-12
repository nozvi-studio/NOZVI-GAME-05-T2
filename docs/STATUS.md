# STATUS — project memory

Updated: 2026-11-12 by Claude Code (lead) · Phase: Phase 2 implemented on `feat/phase-2`, e2e verification pending
Authority: `PRD/` (requirements), `except/` (visual reference), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SPEC.md` (implementation spec). `docs/GDD.md` is deprecated (casual template).

## Done

- Architecture accepted (Codex + agy proposals, lead decision) → `docs/ARCHITECTURE.md`.
- Owner decisions: no accounts/no DB; procedural room + CC0 assets (no Blender); photo-faithful layout enlarged to ~10 x 8 m; Quaternius avatars.
- Asset spike (Kenney Furniture Kit + Quaternius) and floor plan from photos (agy).
- `docs/SPEC.md` written (Codex), cross-reviewed (agy), owner + lead decisions applied; 19 technical open questions remain, none blocking.
- Layout data `docs/layout/office-layout.json` (10 x 8 x 2.7 m, 8 desks, 5 zones, colliders, seat sockets); validator `node docs/layout/validate-layout.mjs` checks bounds, 0.9 m aisles and grid reachability (agy ran it: exit 0; lead reviewed top-down render).
- Owner core-first priority recorded in DECISIONS.
- Proof-of-concepts in `spike/poc/` (gitignored): TV CSS3D pass 5/6, Colyseus 0.18 sync pass 8/8, Quaternius retarget pass after 2 fixes. Findings in DECISIONS.

- **Phase 1 complete** (walkable office): 8 tasks in 4 batches, each re-verified by the PM; see `docs/plans/phase-1-execution.md`. 46 unit tests + 4 Playwright tests pass. Phase 1.1 lighting and camera polish accepted 2026-11-10. FPS measured only under software rendering (13 FPS, not representative); real-hardware measurement pending.

- **Phase 2 implemented** on `feat/phase-2` (`docs/plans/phase-2.md`): Tasks 1-7 committed (protocol identity/activity/seats, CC0 furniture, Quaternius avatars, sit/work/stand, join screen + nameplate + exit, coffee/wave/sofa/cabinet). Task 8 e2e spec (`apps/web/e2e/sit.spec.ts`, shared `helpers.ts`) committed in `e0b2221`; its run result is not yet recorded.

## Next (ordered)

1. agy: run unit tests and full Playwright suite on `feat/phase-2`; lead reviews screenshots personally.
2. If green: merge `feat/phase-2` into `dev`.
3. Owner: measure FPS on a normal desktop (`pnpm --filter @office/web dev`, walk 30 s) and decide the draw-call budget question in `phase-1-execution.md` §7 (deferred until after Phase 2 visuals).

## Open items

- Find a truly embed-blocked YouTube video id to verify the TV error path.
- Hosting accounts (Cloudflare Pages, Render) needed only at Phase 5.

## Working notes

- Claude writes code and plans (Codex no longer used); agy installs dependencies and runs tests.
- agy has twice reported PASS on broken visuals — always open screenshots before accepting.
- Machine is low on RAM: run one worker at a time; Claude Code may kill background tasks (`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` disables this).
- Key spike artifact to reuse: `spike/poc/avatar/src/retarget.ts`.
