# STATUS — project memory

Updated: 2026-11-13 by Claude Code · Phase: Phase 2 merged into `dev` (e2e unverified); Phase 2.1 planned (room widening assigned)
Authority: `PRD/` (requirements), `except/` (visual reference), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SPEC.md` (implementation spec). `docs/GDD.md` is deprecated (casual template).

## Done

- Architecture accepted (Codex + agy proposals, lead decision) → `docs/ARCHITECTURE.md`.
- Owner decisions: no accounts/no DB; procedural room + CC0 assets (no Blender); photo-faithful layout enlarged to ~10 x 8 m; Quaternius avatars.
- Asset spike (Kenney Furniture Kit + Quaternius) and floor plan from photos (agy).
- `docs/SPEC.md` written (Codex), cross-reviewed (agy), owner + lead decisions applied; 19 technical open questions remain, none blocking.
- Layout data `packages/protocol/src/layout/office-layout.json` (12 x 9.6 x 2.7 m since Phase 2.1 T-1014, 8 desks, 5 zones, colliders, seat sockets); validator `node docs/layout/validate-layout.mjs` checks bounds, 0.9 m aisles and grid reachability (agy ran it: exit 0; lead reviewed top-down render).
- Owner core-first priority recorded in DECISIONS.
- Proof-of-concepts in `spike/poc/` (gitignored): TV CSS3D pass 5/6, Colyseus 0.18 sync pass 8/8, Quaternius retarget pass after 2 fixes. Findings in DECISIONS.

- **Phase 1 complete** (walkable office): 8 tasks in 4 batches, each re-verified by the PM; see `docs/plans/phase-1-execution.md`. 46 unit tests + 4 Playwright tests pass. Phase 1.1 lighting and camera polish accepted 2026-11-10. FPS measured only under software rendering (13 FPS, not representative); real-hardware measurement pending.

- **Phase 2 implemented** on `feat/phase-2` (`docs/plans/phase-2.md`): Tasks 1-7 committed (protocol identity/activity/seats, CC0 furniture, Quaternius avatars, sit/work/stand, join screen + nameplate + exit, coffee/wave/sofa/cabinet). Task 8 e2e spec (`apps/web/e2e/sit.spec.ts`, shared `helpers.ts`) committed in `e0b2221`.
- 2026-11-12 verification: unit tests 94/94 pass. Playwright e2e has NO valid result: first run hit another project's dev server on 5173; e2e now uses a dedicated server on 127.0.0.1:5180, but later runs hung in webServer setup or were killed for low RAM. Owner chose to merge into `dev` without e2e evidence.

## Next (ordered)

1. Phase 2.1 (`docs/plans/phase-2.1.md`, Meridian FEAT-46): widen the room to 12 x 9.6 m (T-1014, assigned to `t1-opus`, not started), owner UI feedback, and e2e speed-up (merge walk tests into one join, replace fixed waits with condition waits, per-file run command). Get one green e2e run there.
2. Owner: measure FPS on a normal desktop and decide the draw-call budget (`phase-1-execution.md` §7).
3. Phase 3 — Multiplayer Foundation: plan drafted in `docs/plans/phase-3.md` (Meridian FEAT-51: tasks T-1033 to T-1041, plus two task proposals and the tech spec `phase-3-multiplayer-tech-spec` awaiting owner approval). Server tasks 1-4 may start in parallel with Phase 2.1; client tasks wait for it. Owner must approve the Colyseus install and confirm the five defaults in plan §6.

## Open items

- TV error path (Phase 4): use a non-existent or private video id; oEmbed 401 identifies embed-blocked ids.
- Hosting accounts (Cloudflare Pages, Render) needed only at Phase 5.

## Working notes

- Claude writes code and plans (Codex no longer used); agy installs dependencies and runs tests.
- agy has twice reported PASS on broken visuals — always open screenshots before accepting.
- e2e under agy + software WebGL exceeds RAM and gets reaped; prefer the owner running `npx playwright test` in the foreground.
- Machine is low on RAM: run one worker at a time; Claude Code may kill background tasks (`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` disables this).
- Key spike artifact to reuse: `spike/poc/avatar/src/retarget.ts`.
