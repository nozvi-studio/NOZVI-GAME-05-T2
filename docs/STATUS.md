# STATUS — project memory

Updated: 2026-11-13 by Claude Code · Phase: Phase 3 (FEAT-51) — all 11 tasks implemented on `feat/phase-3`; T-1041 verification on `feat/T-1041-verification`; owner checks pending
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
- **Phase 2.1 T-1044** (e2e speed-up, branch `feat/T-1044-e2e-speedup`): `walk.spec.ts` shares one join (serial, one page) and holds keys until the player has moved 0.5 m (or, for the wall check, until it stops) instead of fixed `waitForTimeout`. Per-file commands in README. 2026-11-13, Claude Code cloud container (Linux, Chromium 1243 SwiftShader, 1 worker): `pnpm --filter web e2e e2e/walk.spec.ts --repeat-each=5` 15/15 pass (1.2 min); **first full green run `pnpm --filter web e2e`: 6/6 pass (1.1 min)** — sit, visual and walk specs.

- **Phase 3 implemented** on `feat/phase-3` (`docs/plans/phase-3.md`, Meridian FEAT-51): Colyseus server (OfficeRoom per code, 20 Hz authoritative movement, server-owned activity and seats, 20 s reconnect window), client connection, fixed-step prediction, remote avatars, replicated seats, employee list and entrance board, reconnect banner. T-1041 verification results and the acceptance record: plan §10: ten-client check passes (9 bots + 1 browser, 11th refused); the 10-minute network-profile soak shows remote jumps in 0.6% of frames, in line with retransmit spikes longer than the 100 ms interpolation delay.

## Next (ordered)

1. Owner: review and merge `feat/T-1041-verification` into `feat/phase-3`, then `feat/phase-3` into `dev`.
2. Owner-only Phase 3 checks (plan §10): FPS and draw calls on a normal desktop with ten employees, the draw-call budget decision (still open; ten employees measure about 350 calls under SwiftShader against the 45-call target), a LAN playtest with real browsers, and one foreground Playwright run.
3. Phase 4 — shared TV (not planned yet).

## Open items

- TV error path (Phase 4): use a non-existent or private video id; oEmbed 401 identifies embed-blocked ids.
- Hosting accounts (Cloudflare Pages, Render) needed only at Phase 5.

## Working notes

- Claude writes code and plans (Codex no longer used); agy installs dependencies and runs tests.
- agy has twice reported PASS on broken visuals — always open screenshots before accepting.
- e2e under agy + software WebGL exceeds RAM and gets reaped; prefer the owner running `npx playwright test` in the foreground.
- Machine is low on RAM: run one worker at a time; Claude Code may kill background tasks (`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` disables this).
- Key spike artifact to reuse: `spike/poc/avatar/src/retarget.ts`.
