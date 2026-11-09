# STATUS — project memory

> AI: read at session start, rewrite at session end. Keep under ~60 lines; move history to CHANGELOG.

**Updated:** 2026-11-09 by Claude Code **Milestone:** M1 — core loop playable (Roadmap Phase 1: 3D environment foundation)

## Now (in progress)
- [x] Project setup closed (agent ruleset + docs committed); no application code yet.

## Next (ordered, max 5)
1. Owner reviews and fills remaining TBD items in `docs/GDD.md`.
2. Scaffold monorepo (`apps/web`, `apps/server`, `apps/shared`) per `PRD/TechnicalArchitecture.md` §5.3.
3. Phase 1: Three.js + Vite scene, third-person camera, office greybox, WASD movement, collision.

## Blockers / open questions for human
- Package manager (npm / pnpm) and test framework not yet chosen.
- Hosting targets for frontend and Colyseus server not yet chosen.

## Known issues / tech debt
- `.claude/settings.json` plugin prompt and permission patterns not yet verified in a live session.

## Last session summary
- What was done: Created AI agent setup files from Notion "AI Vibe-Code Rules — Casual Game" v0.6.0.
- Last verified step (command + result): JSON validation of `.claude/settings.json`.
- Commands that failed / work left uncommitted (check `git status`): none; setup committed and pushed.
- What was learned / gotchas: Requirements live in `PRD/` (Vietnamese source docs); reference photos in `except/`.
