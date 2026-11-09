# GDD — Virtual 3D Office

> Casual-game GDD. Sections marked **[REQUIRED]** must be filled (no `TBD`) before any gameplay code.
> Keep it short: a casual GDD over ~3 pages usually means scope is too big.
> Numeric targets below are **defaults** for mobile casual games, not laws. Override per game with a one-line reason in `docs/DECISIONS.md`.
> The GDD owns product intent, scope and milestones. Exact rules of a complex mechanic go in `docs/specs/mechanics/MEC-xxx.md` and are linked here, not repeated.
> **Version:** 0.1 · **Updated:** 2026-11-09 · **Owner:** TBD
> Detailed source requirements: `PRD/` (Vietnamese). This GDD summarizes them; on conflict, ask the owner.

## 1. Pitch [REQUIRED]

- **One sentence:** Join your office's shared 3D space by name and office code, walk around, sit and work, and watch YouTube together on the office TV.
- **Hook (why someone taps it in a store/feed in 3 seconds):** TBD
- **Reference games (2–3) and what we take / avoid from each:** TBD
- **Target player:** Members of one office (3–10 concurrent), desktop browser, during work breaks.

## 2. Core loop [REQUIRED]

    Join office → Move / meet colleagues → Interact (workstation, pantry, TV) → See others react in real time → Continue / leave

- **Core verb(s)** (max 2): move, interact.
- **What makes one attempt different from the last** (skill, randomness, choice): who is online and what they are doing.

## 2b. Mechanics index [REQUIRED once a 2nd mechanic exists]

| ID      | Mechanic                 | Player-facing purpose   | Spec    | Status |
| ------- | ------------------------ | ----------------------- | ------- | ------ |
| MEC-001 | Third-person movement    | Explore the office      | GDD §3  | Draft  |
| MEC-002 | Workstation sit/work     | Show "working" presence | PRD-SRS | Draft  |
| MEC-003 | Pantry interaction       | Take a break            | PRD-SRS | Draft  |
| MEC-004 | Shared TV (YouTube sync) | Watch together          | PRD-SRS | Draft  |

## 3. Controls & input [REQUIRED]

- Input scheme: keyboard WASD + mouse camera, interaction key (TBD), desktop landscape. Mobile-first controls are out of scope.
- Launch to first input: **≤ 5 s**. No tutorial text walls; teach by playing.

## 3b. First-time user experience (first 60 s) [REQUIRED]

- Second 0–5: Join screen — enter name, office code, pick avatar.
- How the core verb is taught (by doing, not by text): TBD
- First success moment and when it happens (target ≤ 15 s): TBD
- First failure and how the game invites a retry: N/A (no fail state).
- What is hidden until later (menus, currencies, settings): TBD

## 4. Win / lose & session [REQUIRED]

- **Fail condition:** none (social sandbox).
- **Win / level-complete condition:** none — open-ended presence.
- **Target session length:** TBD
- **Restart cost:** rejoin ≤ 1 tap, ≤ 1 s.

## 5. Difficulty & pacing [REQUIRED]

- Not applicable (no difficulty curve); pacing driven by zones and interactions. Owner to confirm.

## 6. Feedback & juice [REQUIRED for M2]

| Event          | Visual | Sound | Haptic |
| -------------- | ------ | ----- | ------ |
| Core action    |        |       |        |
| Score / reward |        |       |        |
| Fail           |        |       |        |

## 7. Balance parameters [REQUIRED]

All numbers live in `config/balance.json`; this table is the human-readable mirror.

| Key               | Value | Notes                |
| ----------------- | ----- | -------------------- |
| maxPlayersPerRoom | 10    | PRD: 3–10 concurrent |

## 8. Progression & meta [M3]

- Out of scope for prototype (no economy or inventory).

## 9. Monetization [M4 — optional for prototype]

- Model: none (internal tool).

## 10. Art, audio & UI direction [REQUIRED]

- Style: semi-realistic stylized 3D, bright warm modern office; references in `except/`.
- Screens (minimal): Join (name, office code, avatar) → Office.
- Five office zones (see PRD-SRS for names and contents).

## 11. Scope & milestones [REQUIRED]

Milestones follow `PRD/RoadMap.md` phases; owner to confirm mapping.

| Milestone               | Exit criteria                                | In scope                          | Out of scope              |
| ----------------------- | -------------------------------------------- | --------------------------------- | ------------------------- |
| M1 3D environment       | One player walks the office without clipping | Scene, camera, zones, movement    | multiplayer               |
| M2 Avatar & interaction | Sit/work, pantry, nameplates                 | Avatars, animations, interactions | multiplayer               |
| M3 Multiplayer          | 3–10 players synced via Colyseus             | Rooms, state sync                 | —                         |
| M4 Shared TV            | Synced YouTube play/pause/seek               | TV                                | —                         |
| M5 Ship                 | Deployed and reachable online                | Deployment, polish                | voice, video, VR, economy |

## 12. Success metrics & playtest [REQUIRED]

- Hypothesis being tested: TBD
- Metrics: see `PRD/FinalDefinition fDone.md`.
- Analytics events needed: TBD
- Playtest log → `docs/PLAYTEST.md` (create at first playtest).

## 13. Technical constraints [REQUIRED]

- Target devices / browsers: common desktop computers, modern browsers (details in `PRD/NonFeature.md`).
- Frame-rate target and load-time budget: TBD (see `PRD/NonFeature.md`).
- Build size budget: TBD
- Offline play? Save data: online only; no persistent save for prototype.

## Parking lot (ideas not in scope)

- Text chat, emotes, running, personal lockers, TV voting, activity history, multiple layouts (PRD optional).
