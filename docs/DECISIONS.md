# Decision log
Append-only. Format: `## YYYY-MM-DD — <decision>` then Context / Choice / Alternatives / Consequence (1 line each).

## 2026-11-09 — Adopt Studio "AI Vibe-Code Rules" v0.6.0 for a non-casual project
Context: The project is a browser-based multiplayer 3D virtual office, not a mobile casual game.
Choice: Use the casual-game ruleset and GDD template; mobile-casual numeric defaults (one-hand portrait, session length, ads) do not apply.
Alternatives: Write a custom ruleset.
Consequence: GDD sections are adapted to desktop web; `PRD/` remains the detailed requirements source.
