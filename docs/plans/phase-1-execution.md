# Phase 1 — Execution brief (PM layer)

Updated: 2026-11-09 · PM: Claude Code (cloud session) · Method: Notion "AI Project Manager" Part 1 + "AI Leader — Anti-patterns and Guardrails" Part 2

This file adds coordination only. **What to build and how** lives in `docs/plans/phase-1.md` (single source); do not copy steps here.

## 1. Task brief

- **Outcome:** one player opens the web app, sees the procedural 10 x 8 x 2.7 m office from layout data, walks a capsule with WASD under a third-person camera, and cannot pass through walls or furniture.
- **Authority:** owner delegated Phase 1 management to the PM (2026-11-09). Dependency installs approved (phase-1.md Global Constraints). Push only to `claude/blissful-edison-oh66t2`.
- **Ask owner before:** any scope/gameplay change, paid service, hosted storage, deployment, destructive action.
- **Out of scope:** GLB furniture, avatars, sitting, join screen, Colyseus (Phases 2–3).

## 2. Execution model (replaces Codex/agy roles for this run)

| phase-1.md role                         | This run                                                             |
| --------------------------------------- | -------------------------------------------------------------------- |
| Codex (writes code)                     | One Claude subagent per batch, model chosen by risk                  |
| agy (installs, runs tests, screenshots) | Same subagent; PM re-runs checks independently                       |
| Lead (reviews diffs, screenshots)       | PM opens every screenshot and re-runs `pnpm check` before acceptance |

Environment: Node 24 at `/opt/node24/bin` (prepend to `PATH`); pre-installed Chromium at `/opt/pw-browsers`, so `@playwright/test` is pinned to the pre-installed Playwright version (1.63.0) and `playwright install` is skipped.

## 3. Batches and contracts

Batches are sequential (each consumes the previous interfaces), so one worker runs at a time.

| Batch | Tasks                                         | Model  | Why                                                 | Primary REQs                          | Evidence required                                         |
| ----- | --------------------------------------------- | ------ | --------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| A     | 1 Scaffold + CI + health · 2 Layout + balance | sonnet | Mechanical, fully specified                         | NFR-001, NFR-002, ROOM-002            | `pnpm check` output, health curl, validator exit 0        |
| B     | 3 Collision · 4 Movement                      | opus   | Correctness-critical shared math (server reuses it) | MOVE-001, MOVE-002                    | protocol test output; PM diff review                      |
| C     | 5 Room render · 6 Input + capsule             | sonnet | Specified rendering/glue                            | ROOM-001, ROOM-003, MOVE-001, NFR-001 | web tests, `task5-room.png`                               |
| D     | 7 Camera · 8 Playwright walk + FPS            | opus   | Spring/occlusion math and e2e stability             | CAM-001, MOVE-002, PERF-001           | 4 e2e passes, `walk-start.png`, `walk-wall.png`, FPS note |

Common contract terms for every batch:

- `scope.allowed`: files listed by the batch's tasks in phase-1.md, plus `pnpm-lock.yaml`. `scope.excluded`: `PRD/`, `except/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, other tasks' files.
- `constraints`: follow phase-1.md code; deviations only to make the specified checks pass, each listed in the report. No new dependencies beyond phase-1.md Step 6. No push.
- `report_back`: status, changed files, commands run with real output tails, deviations, blockers, assumptions.
- Commit once per task with the message given in phase-1.md.

## 4. Acceptance and limits

- A batch is **Accepted** only after the PM re-runs `pnpm check` (and e2e for D), reviews the diff and opens each screenshot. A subagent "PASS" is a claim, not acceptance.
- Rework: at most 2 retries per failed criterion, each with a diagnosis; then stop and report to owner.
- Workers: 1 at a time. Spending: zero.

## 5. Decisions taken under PM authority (decide + inform)

- OQ-001: room is 10 x 8 x 2.7 m, per owner DEC "Layout ... enlarged to ~10 x 8 m" and the accepted layout JSON; ARCHITECTURE updated to match.
- REQ-MOVE-002 main-door exit to join screen is deferred to the phase that adds the join screen (Phase 2); Phase 1 treats the door as a wall.
- `@playwright/test` pinned to the pre-installed browser's Playwright version instead of downloading browsers.
- TypeScript pinned to 6.0.3 (latest 6.x): typescript-eslint 8.72.2 does not support TypeScript 7 yet. Revisit when typescript-eslint adds TS 7 support.
- Vitest 5 scripts exclude `dist/` and `dist-types/` because `tsc -b` emits compiled tests there; `.prettierignore` excludes protected agent files so `pnpm format` cannot rewrite them.

- Batch B fixed five defects in the phase-1.md collision/movement code, all covered by new tests: (1) the plan's oblique-slide test started at a box corner, not the face, so no correct solver could pass it; start moved to z = -0.5 and the original geometry kept as a corner-rounding test; (2) non-finite or huge deltas hung the loop, now capped at 256 substeps; (3) 4 push-out rounds left the circle inside furniture in narrow desk gaps, now 16 rounds and an unresolvable substep is rejected; (4) flush box seams caused sideways drift, now the deepest overlap is resolved first; (5) NaN/Infinity input or non-positive dt produced NaN or backward motion, now ignored. Consequence: a player whose start position overlaps a collider cannot move; the layout validator guarantees spawn is clear.

## 6. Status

| Batch | State    | Evidence / notes                                                                                                                                                                                                                                                                                                            |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | Accepted | PM re-ran `pnpm check` (exit 0; protocol 6, server 2 tests), validator exit 0, layout JSON semantically unchanged after move, protected files untouched                                                                                                                                                                     |
| B     | Accepted | PM re-ran `pnpm check` (exit 0; protocol 35 tests) and reviewed `collision.ts`; plan defects fixed, see §5                                                                                                                                                                                                                  |
| C     | Accepted | PM re-ran `pnpm check` (exit 0; web 4 tests) and opened `task5-room.png` / `task6-player.png`: walls, floor, desks, dividers and blue capsule render; player stopped at +Z wall (z = 3.6). `THREE.Clock` replaced by `THREE.Timer` (deprecated in 0.187). Note: walls read mid-grey under current lighting, tune in Phase 2 |
| D     | Accepted | PM re-ran `pnpm check` (exit 0; web 9 unit tests) and `playwright test` (4 passed; subagent 3/3 consecutive); opened `walk-start.png`, `walk-wall.png`, `camera-orbit.png`. Camera hides occluders between focus and camera instead of leaving the room                                                                     |

## 7. Phase 1 close-out

- Exit criteria: `pnpm check` passes locally (CI result recorded in STATUS); `walk.spec.ts` 4 passed with screenshots reviewed by PM; validator exits 0 against the moved JSON; STATUS updated.
- Performance (software-rendered SwiftShader, 4 vCPU Xeon, 1280x720, not representative of REQ-PERF-001): 13.0 FPS average over 30 s; 72 draw calls/frame average (main pass ≤ 42, rest is the shadow pass); ~1.3k triangles.
- Open for owner/lead: (1) real-hardware FPS measurement; (2) does the ≤ 45 draw-call budget include the shadow pass? PM recommendation: count all passes and limit shadow casters to large furniture in Phase 2; (3) camera can rise above the 2.7 m ceiling in open areas (plan does not treat the ceiling as an occluder), review in Phase 2; (4) Playwright clears `test-results/` per run, so set a separate evidence folder in Phase 2.
