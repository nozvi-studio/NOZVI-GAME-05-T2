# AGENTS.md — rules for AI agents
Ruleset version: 0.6.0

Start with `docs/README.md` to route the task. Read `docs/CODEMAP.md` when locating code. Read `docs/STATUS.md` only when current project state affects the task. Open only relevant specs, source files and tests; do not scan the repository for general familiarity.

## 0. Language (mandatory)
All repository content you write is **English only**: docs, plans, code comments, commit messages, PR text, changelogs, status and review reports. The owner may talk to you in Vietnamese; still write files in English. Exceptions: player-facing localized strings and exact vendor identifiers.

## 1. Project stack
Use the commands and technology choices documented in the project README or setup docs. Ask only when a missing value blocks the requested work.

## 2. Project authority
Use the GDD for product scope, mechanic specs for exact gameplay behavior, balance config for tuning, architecture docs for module boundaries, and DECISIONS for accepted technical trade-offs. Keep one source of truth per rule or value. If authoritative sources conflict on a consequential behavior, ask rather than guessing.

## 2b. Efficient context
Use `docs/README.md` for task routing and `docs/CODEMAP.md` for code locations. Search before opening files; read only relevant sections and avoid generated/vendor paths. Keep both maps accurate when project structure or documentation changes. GitNexus is optional; fall back to CODEMAP and code search when unavailable.


## 3. Project records
Update STATUS, CHANGELOG, DECISIONS and document maps when a change makes them stale or records meaningful project progress, a committed change, or a non-obvious decision. Do not rewrite project status for routine or trivial work.

## 4. Optional workflow tools
Use Superpowers or other installed workflow skills when they materially improve the task. They are optional capabilities, not prerequisites. If a skill is unavailable, continue with an appropriate lightweight workflow and report any meaningful limitation.

## 5. Scope guard
- Keep implementation aligned with the approved GDD scope and current milestone; park unrelated ideas rather than silently expanding scope.
- Ask when a missing or conflicting requirement materially affects correctness. Do not invent gameplay behavior.
- Changes to approved gameplay rules, product pillars or milestone scope require human approval before implementation.

## 6. Code rules
- Keep gameplay logic testable and separate from rendering where practical.
- Put tunable gameplay values in the project's balance configuration when one exists.
- Follow the repository's Git and commit conventions. Explain material new dependencies and record significant trade-offs.
- **Secrets:** never commit credentials, API secret keys, private keys, signing files or tokens; use env vars / CI secrets. Public client IDs (e.g. ad unit IDs, analytics app IDs) may be committed in config after review, separated per environment.

## 6b. Verification
Run focused tests and checks for changed behavior. Increase coverage for gameplay-critical, cross-module, security-sensitive or destructive changes, and run the relevant full verification before merge. If a check cannot run, report the command, blocker and residual risk; never claim it passed.

## 7. Completion
Keep changes scoped, verify affected behavior, and consider relevant regression, architecture and security risks. Use deterministic checks as primary evidence. Request independent review only when complexity or risk warrants it. Report changed areas, checks actually run, outcomes and remaining risks.

## 8. Protected actions
Ask before pushing, installing dependencies, changing agent configuration, editing protected instruction/config files, or performing destructive/high-impact actions. Never read or print `.env` files.
