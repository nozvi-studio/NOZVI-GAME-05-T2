# Virtual 3D Office

> One-line pitch: Walk into a shared 3D office in your browser, see your teammates in real time, work at your desk, take a coffee break and watch YouTube together on the office TV.

**Genre:** Casual · social multiplayer 3D sandbox **Platform:** web (desktop browser) **Status:** see [docs/STATUS.md](docs/STATUS.md)

## Quick start

```bash
# Not scaffolded yet. Planned stack: Three.js + React + TypeScript + Vite (web), Node.js + Colyseus (server).
# Install / run / test commands will be added when the monorepo is created.
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
