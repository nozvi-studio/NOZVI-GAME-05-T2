# Phase 2.1 — Owner UI feedback and e2e reliability

> Branch: `feat/phase-2.1`. Tracked in Meridian as FEAT-46 (task T-1014 for the room expansion). This plan lists scope and acceptance only; implementation detail belongs in each task.

**Goal:** Make the office feel less cramped, fold in the owner's remaining UI feedback, and get one green Playwright e2e run so Phase 3 (multiplayer) builds on a verified base.

**Context:** Phase 2 was merged into `dev` with 94/94 unit tests passing but no valid e2e result (see `docs/STATUS.md`). FPS has only been measured under software rendering.

## Decisions taken for this phase

- **Room size (owner, 2026-11-12):** widen the room by 20% in each horizontal dimension, from 10 x 8 m to 12 x 9.6 m, stretched evenly on all sides. Height stays 2.7 m. Positions of zones, desks, furniture, colliders, seat sockets, spawn, door and TV wall scale by 1.2 about the room center; furniture and avatar sizes do not change, so aisles widen. This is +44% floor area, more than a 20% area increase, chosen deliberately because the aisles felt tight.

## Tasks

| #   | Task                                                                                                         | Owner / state                                            |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | Widen the room to 12 x 9.6 x 2.7 m (T-1014)                                                                  | Done 2026-11-13 (`30473c6`), merged into `dev`           |
| 2   | Remaining owner UI feedback                                                                                  | Not yet listed by the owner; add tasks once it is        |
| 3   | e2e speed-up: merge walk tests into one join, replace fixed waits with condition waits, per-file run command | Not created; run after task 1 because coordinates change |
| 4   | One green e2e run, run in the foreground by the owner (`npx playwright test`)                                | Depends on task 3                                        |
| 5   | Owner measures FPS on a normal desktop and decides the draw-call budget (`phase-1-execution.md` §7)          | Owner                                                    |

## Closing note (2026-11-13)

Branch `feat/phase-2.1` was merged into `dev` (`1df1931`) and closed at the owner's request after task 1. Tasks 2 to 5 carry over unchanged and start on a new branch cut from `dev`:

- Task 2: no owner UI feedback items listed yet.
- Task 3: still needed. Evidence from T-1014 runs (agy, 2026-11-13): `sit.spec` and `visual.spec` pass; `walk.spec` "walls stop the player" passes 3/3; the timed W/S/A/D tests fail intermittently (0.24 to 0.40 m moved against 0.3 to 0.5 m thresholds, a different test on each repeat). Cause: fixed `waitForTimeout` key holds on software WebGL.
- Task 4: blocked on task 3. This is also the Phase 3 entry gate for client tasks 5 to 11.
- Task 5: owner, unchanged.

## Task 1 acceptance (T-1014)

- `node docs/layout/validate-layout.mjs` exits 0 on the new layout (bounds, 0.9 m aisles, all 8 desks reachable).
- `pnpm check` passes with unit tests updated to 12 x 9.6 x 2.7.
- A top-down render shows wider aisles and no furniture clipped through walls; the lead opens it personally.
- `docs/DECISIONS.md` has an entry for the size change and `docs/ARCHITECTURE.md` shows the new size.

## Out of scope

New zones or furniture, avatar or camera changes, multiplayer, TV.

## Risks

- Existing e2e specs hard-code positions for the old room (for example the walk test starts 0.9 m from the north wall); they need new numbers.
- e2e under software WebGL can exceed RAM and be killed; do not run it in the background.
- Room size is an owner decision; changing the 1.2 factor later means editing only the layout JSON.
