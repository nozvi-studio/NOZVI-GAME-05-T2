# Code map

Updated: 2026-11-09 · Keep under ~80 lines. One row per module, not per file.

> No source code exists yet. Add rows only for paths that actually exist. Planned layout: `docs/ARCHITECTURE.md` §2 (apps/web, apps/server, packages/protocol); Phase 1 file plan in `docs/plans/phase-1.md`. Layout data: `docs/layout/office-layout.json` (moves to packages/protocol in Phase 1 Task 2).

## Entry points

| What                   | File            |
| ---------------------- | --------------- |
| App bootstrap          | — (not created) |
| Main game scene / loop | — (not created) |
| Balance config         | — (not created) |
| Test setup             | — (not created) |

## Modules

| Module (folder) | Responsibility | Key files (max 3) | Depends on | Requirement IDs | Tests |
| --------------- | -------------- | ----------------- | ---------- | --------------- | ----- |

<!-- add rows: apps/web, apps/server, packages/protocol ... -->

## Do not read (generated, vendored or binary)

`dist/`, `build/`, `coverage/`, `node_modules/`, `assets/` binaries, `except/` images, `.token-ledger/`, lockfiles — unless the task is specifically about them.

## Conventions that help navigation

- One module = one folder with a small public entry (e.g. `index.ts`); other modules import only that entry.
- Keep source files under ~300 lines; split when larger.
- File and folder names match the domain terms in the GDD / MEC specs.
