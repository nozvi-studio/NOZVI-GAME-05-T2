# Virtual 3D Office

> One-line pitch: Walk into a shared 3D office in your browser, see your teammates in real time, work at your desk, take a coffee break and watch YouTube together on the office TV.

**Genre:** Casual · social multiplayer 3D sandbox **Platform:** web (desktop browser) **Status:** see [docs/STATUS.md](docs/STATUS.md)

## Quick start

```bash
pnpm install
pnpm dev                     # game server (:2567) and web client (:5173) together
pnpm check                   # format, lint, typecheck, unit tests, build
```

The game always connects to a server (no offline mode): `pnpm dev` starts both. The client uses `VITE_SERVER_URL` (default `http://localhost:2567`).

End-to-end tests (Playwright, software WebGL; run in the foreground, one worker). Playwright starts the game server on port 2580 (join limit raised with `JOIN_LIMIT_PER_MINUTE`) and the web dev server on 5180; specs may add headless SDK bots from `e2e/bots.ts`:

```bash
pnpm --filter web e2e                          # full suite
pnpm --filter web e2e e2e/walk.spec.ts         # one spec file
pnpm --filter web e2e e2e/walk.spec.ts --repeat-each=5   # flakiness check
```

## Docs map

| File                                                        | Purpose                                        | Who updates               |
| ----------------------------------------------------------- | ---------------------------------------------- | ------------------------- |
| [AGENTS.md](AGENTS.md)                                      | Rules for AI agents (read first)               | Human                     |
| [docs/GDD.md](docs/GDD.md)                                  | Game design: product intent, scope, milestones | Human (AI may propose)    |
| [docs/STATUS.md](docs/STATUS.md)                            | Project memory: now, next, blockers            | AI every session          |
| [CHANGELOG.md](CHANGELOG.md)                                | What changed, per version                      | AI with every change      |
| [docs/DECISIONS.md](docs/DECISIONS.md)                      | Why we chose X over Y                          | AI / Human                |
| [docs/README.md](docs/README.md)                            | Docs map: index + what to read per task        | AI when docs change       |
| [docs/CODEMAP.md](docs/CODEMAP.md)                          | Code map: where code lives                     | AI when structure changes |
| `docs/specs/`, `docs/integrations/`, `docs/ARCHITECTURE.md` | Detailed specs, created only when needed       | AI / Human                |

## AI setup (required)

Built with an AI agent + Superpowers ([obra/superpowers](https://github.com/obra/superpowers), MIT). In Claude Code:

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Other agents (Codex, Cursor): install Superpowers for that harness. All repository content is written in English.
