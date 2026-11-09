# Docs map (read this instead of scanning docs/)
Updated: 2026-11-09

## 1. Document index
Only files listed here exist. Status: Draft / Approved / Deprecated.
| ID | File | Owns (source of truth for) | Status |
|---|---|---|---|
| ARCH | `docs/ARCHITECTURE.md` | Accepted stack, module layout, realtime, deployment | Accepted |
| SPEC | `docs/SPEC.md` | REQ-IDs, acceptance criteria, traceability to PRD, open questions | Accepted |
| GDD | `docs/GDD.md` | Casual template, superseded by PRD + ARCH | Deprecated |
| STATUS | `docs/STATUS.md` | Current state, next steps, blockers | — |
| CODEMAP | `docs/CODEMAP.md` | Where code lives, module boundaries, entry points | — |
| DEC | `docs/DECISIONS.md` | Technical/design trade-offs (ADR-lite) | — |
| — | `CHANGELOG.md` | History | — |
| PRD-SRS | `PRD/SoftwareRequirementsSpecification.md` | Detailed functional requirements (Vietnamese source) | Draft |
| PRD-ARCH | `PRD/TechnicalArchitecture.md` | Stack, architecture, asset pipeline (Vietnamese source) | Draft |
| PRD-ROAD | `PRD/RoadMap.md` | Five-phase roadmap and acceptance criteria | Draft |
| PRD-SCOPE | `PRD/Scope.md`, `PRD/NonFeature.md` | Must-have / optional / out of scope; non-functional reqs | Draft |
| PRD-DOD | `PRD/FinalDefinition fDone.md` | Prototype definition of done | Draft |
| REF | `except/*.jpg` | Office reference photos | — |

## 2. Routing: what to read per task
Read the "First" column; open "Then" only if the task needs it. Never read every file.
| Task | First | Then (only if needed) |
|---|---|---|
| New gameplay feature | GDD (relevant § only), STATUS | PRD-SRS section, MEC spec, CODEMAP module row, related tests |
| Gameplay bug | MEC spec (or GDD §) for that behavior | CODEMAP module row → that module's files + tests |
| Balance / tuning | GDD §7, balance config | MEC spec §9 |
| Refactor | CODEMAP, ARCHITECTURE | DECISIONS (grep topic), module tests |
| UI / juice | GDD §6, §10 | CODEMAP ui row |
| Multiplayer / TV sync | PRD-ARCH | PRD-SRS, CODEMAP server row |
| 3D environment / assets | GDD §10, REF images | PRD-ARCH §6 |
| Playtest follow-up | PLAYTEST (latest entry only) | GDD §12 |
| Release | STATUS, CHANGELOG [Unreleased] | PRD-DOD, test results |

## 3. Requirement IDs
IDs (GDD-§n, MEC-xxx, INT-xxx) appear in specs, in test names and in a one-line comment at the main implementing function, so `grep -r "MEC-001"` finds spec, code and tests without scanning.
