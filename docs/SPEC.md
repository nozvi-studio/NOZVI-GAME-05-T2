# Virtual 3D Office — Implementation Specification

Status: Derived implementation specification; unresolved items are listed below.
Source baseline: PRD version 1.0.0 and accepted architecture/decisions dated 2026-11-09.

## Authority and reading conventions

The product is a desktop-browser, TypeScript, third-person multiplayer virtual office. Employees join with a name, office code and preset avatar, move through five functional zones, work and take breaks, see one another, and watch synchronized YouTube video. The PRD defines product requirements; accepted architecture and decisions supply implementation constraints. This document does not approve new product behavior. `docs/GDD.md` is deprecated and is not a source.

Source aliases below identify exact files. Section names are English translations where the source is Vietnamese; section numbers and existing English headings identify the original locations.

| Alias | File |
|---|---|
| SRS | [PRD/SoftwareRequirementsSpecification.md](../PRD/SoftwareRequirementsSpecification.md) |
| SCOPE | [PRD/Scope.md](../PRD/Scope.md) |
| NFR | [PRD/NonFeature.md](../PRD/NonFeature.md) |
| ROAD | [PRD/RoadMap.md](../PRD/RoadMap.md) |
| TA | [PRD/TechnicalArchitecture.md](../PRD/TechnicalArchitecture.md) |
| DOD | [PRD/FinalDefinition fDone.md](../PRD/FinalDefinition%20fDone.md) |
| ARCH | [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| DEC | [docs/DECISIONS.md](DECISIONS.md) |

Every `REQ-<AREA>-NNN` heading is a stable requirement identifier. Source references apply to both its rule and acceptance criteria. Architecture-only details are identified by an additional ARCH/DEC reference rather than attributed to the PRD. Numbers described as approximate or tunable retain that status. Acceptance criteria are checks to perform during implementation, not claims that the checks already passed. `Unit` includes deterministic server/protocol integration checks; `Playwright` denotes browser automation; `Manual` includes visual inspection, profiling, source review and live-provider checks.

The following phase tags match ROAD exactly. A requirement with multiple tags starts in the first listed phase and is integrated or verified again in the later phases. Assignment of cross-cutting constraints follows their dependent feature; it does not expand the roadmap.

| Tag | ROAD phase |
|---|---|
| P1 | Phase 1 — 3D Environment Foundation |
| P2 | Phase 2 — Employee Avatar & Interaction |
| P3 | Phase 3 — Multiplayer Foundation |
| P4 | Phase 4 — Shared TV & Entertainment |
| P5 | Phase 5 — Polish, Optimization & Deployment |

An acceptance criterion marked **conditional** records a source requirement whose exact behavior or threshold needs an answer in Open questions. It is not permission to choose that behavior silently. Unaffected implementation can proceed. Proposed decision owners in that section are suggestions, not assignments already approved. The owner and lead decisions in “Resolved decisions (2026-11-09)” govern the affected requirements and acceptance criteria below. Defaults marked tunable in balance config are initial settings, not open questions.

## Environment requirements

### REQ-ROOM-001 — Visual direction
**Phase:** P1. **Sources:** SRS §2.1; ARCH §4; DEC “Layout: photo-faithful office, enlarged to ~10 x 8 m (owner)”.

Use semi-realistic stylized 3D: a modern, tidy office, large windows and natural light; wood, metal, fabric and glass materials; friendly Quaternius Modular Suit characters; bright, warm, comfortable colors. Use the accepted photo-derived palette: off-white walls, light-grey tile, walnut wood, white metal, black electronics and lime-green accents. Photorealism is not the target. Retaining Modular Suit proportions is an owner-approved documented deviation from SRS §2.1 “stylized, slightly larger head”.

**Acceptance:** Manual: inspect the loaded scene and avatar lineup against every listed visual property and palette entry; record visual exceptions, including the approved Modular Suit proportion deviation. Artistic approval remains qualitative (OQ-003).

### REQ-ROOM-002 — Photo-derived room layout
**Phase:** P1. **Sources:** SRS §2.2; TA §6.1; ARCH §4; DEC “Layout: photo-faithful office, enlarged to ~10 x 8 m (owner)” and “Procedural room shell + CC0 GLB assets, no Blender”.

Build a parametric Three.js shell with eight desks in two pods, the TV wall, entrance and pantry in the photo-derived arrangement. Extend the agy floor-plan JSON rather than using it verbatim, leaving Entertainment, Pantry and Storage distinct. DEC specifies approximately 10 x 8 m; ARCH still specifies approximately 10 x 7 x 2.8 m. Preserve this conflict for confirmation (OQ-001).

**Acceptance:** Unit: layout contains eight desk placements in two pods and separate zone data. Manual: inspect photo-derived arrangement and palette using DEC's description. **Conditional:** verify final floor dimensions and height after OQ-001; do not silently choose one conflicting footprint. Availability of the referenced JSON is OQ-020.

### REQ-ROOM-003 — Five recognizable zones and room shell
**Phase:** P1. **Sources:** SRS §2.2; SCOPE “Must Have”; TA §6.3 “Environment”; ROAD Phase 1.

Provide exactly the five named functional zone types: Workstation, Pantry, Storage, Entrance and Entertainment. Include floor, walls, ceiling, windows, doors and lighting. Zones are functional modules, not decoration alone.

**Acceptance:** Manual: a single player can explore the loaded scene, identify each of the five zones and locate every listed shell element. Zone-specific behavior is checked by the interaction and TV requirements below.

### REQ-ROOM-004 — Workstation assets
**Phase:** P1. **Sources:** SRS §2.2.A; TA §6.3 “Furniture” and “Equipment”.

Include eight photo-faithful desks, office chairs, monitors/computers, keyboards, mice, desk lamps, stationery and decorative objects.

**Acceptance:** Manual: inspect the Workstation zone, confirm eight desks and identify every asset category listed above; Unit: each interactive workstation has the interaction and seat data required by REQ-INT-002. No unprovided per-desk decorative quantity is assumed.

### REQ-ROOM-005 — Pantry assets
**Phase:** P1. **Sources:** SRS §2.2.B; TA §6.3 “Equipment”.

Include a coffee machine, water dispenser, cups, refrigerator, countertop and cabinets.

**Acceptance:** Manual: identify all six asset categories in the Pantry zone and confirm the coffee machine and water dispenser are reachable for their Phase 2 interactions.

### REQ-ROOM-006 — Storage assets
**Phase:** P1, P2. **Sources:** SRS §2.2.C; SCOPE “Optional / Personal lockers”; TA §6.3 “Furniture”.

Include storage cabinets, personal lockers, shelves, boxes and personal decorative items. Personal lockers are visual assets only; assigned lockers and personal-item viewing are out of scope.

**Acceptance:** Manual: identify all five asset categories in Storage. Verify lockers provide no assignment or personal-item viewing; generic cabinet behavior is REQ-INT-004 and does not require an inventory system.

### REQ-ROOM-007 — Entrance assets
**Phase:** P1. **Sources:** SRS §2.2.D; TA §6.3 “Environment”.

Include a main entrance door, door frame, decorative plants and office signage. A reception desk is optional.

**Acceptance:** Manual: identify the four required categories and an Entrance spawn location. The scene passes this criterion with zero reception desks.

### REQ-ROOM-008 — Entertainment assets
**Phase:** P1, P4. **Sources:** SRS §2.2.E, §3.4 “TV Placement”; TA §6.3 “Furniture / Equipment”; ROAD Phase 4.

Include a wall-mounted TV, sofa, coffee table, speakers and decorative lighting. A TV stand is optional. Playback belongs to a separate Entertainment/TV system.

**Acceptance:** Manual: identify all five required asset categories, verify the TV is attached to the Entertainment wall, and verify its screen remains aligned during camera movement. Zero TV stands is acceptable. Functional playback is checked in P4.

## Movement and camera requirements

### REQ-MOVE-001 — Desktop movement controls
**Phase:** P1. **Sources:** SRS §3.1 “Movement”; SCOPE “Must Have”; ROAD Phase 1; DOD “WASD”.

Support camera-relative W forward, A left, S backward and D right, with normalized diagonals. Rotate toward movement direction. Default walk speed is 2.0 m/s and optional run speed is 4.0 m/s, tunable in balance config. Space/jump is dropped: optional in SRS, it is incompatible with DEC’s flat-floor 2.5D collision.

**Acceptance:** Unit: verify camera-relative directions, equal cardinal/diagonal speed and default 2.0 m/s walking (4.0 m/s if optional running is implemented). Playwright: W/A/S/D move in their camera-relative directions and heading follows travel. Manual: confirm controllability and no Space/jump action.

### REQ-MOVE-002 — Collision and office boundaries
**Phase:** P1, P3. **Sources:** SRS §3.1 “Movement”, §3.3 “Networking requirements”; ROAD Phase 1; ARCH §§2, 4–5; DEC “Custom 2.5D collision instead of Rapier”.

Use the shared custom 2.5D capsule-versus-AABB sweep-and-slide solver on the flat floor. Prevent passage through walls and furniture and constrain movement to office bounds. No Rapier or dynamic physics is required. Default capsule radius is 0.3 m, tunable in balance config. Main-door exit leaves the room and returns to the join screen; no exterior world is provided. Decorative door opening does not change collision.

**Acceptance:** Unit: sweep into a wall, furniture and a boundary; none permits crossing its blocking surface; oblique movement slides along the obstacle. Replay identical inputs/layout through client and server solver entry points and obtain identical collision results. Unit: verify the default 0.3 m radius and identical collision for open/closed decorative doors. Playwright: main-door exit returns to the join screen without entering an exterior world.

### REQ-CAM-001 — Third-person orbit camera
**Phase:** P1. **Sources:** SRS §3.1 “Movement”; ROAD Phase 1; ARCH §4.

Provide mouse rotation and a spring-damped third-person follow/orbit camera with ray-occlusion pull-in and a minimum-distance clamp.

**Acceptance:** Playwright or Manual: move and rotate in open space and near walls; the camera follows the avatar, responds to mouse motion, pulls inward when the view is occluded and never violates its configured minimum distance. Camera tuning and conflict between clamp and occlusion are OQ-007.

## Avatar and identity requirements

### REQ-AVATAR-001 — Preset avatar selection
**Phase:** P2, P3. **Sources:** SRS §3.1 “Avatar Selection”, §3.2; SCOPE “Must Have”; ROAD Phase 2; DOD “name, office code and avatar”; ARCH §§1, 4; DEC “Avatars: Quaternius characters + Universal Animation Library (owner)”.

Offer a preset set before joining, with a model and animation support for each selectable avatar. Use Quaternius CC0 Modular Suit models and Universal Animation Library (UAL) clips as accepted. These proportions are the owner-approved SRS §2.1 deviation in REQ-ROOM-001. Do not require a custom creator. Store selected avatar and name in browser localStorage; no account/database is introduced.

**Acceptance:** Playwright: select each available avatar before Join Office and observe the corresponding Modular Suit model after entry; reload and verify stored name/avatar can be recovered. Unit: reject unknown avatar IDs server-side. Preset count and storage failure behavior are OQ-008 and OQ-019.

### REQ-AVATAR-002 — Core animation transitions
**Phase:** P2, P3. **Sources:** SRS §3.1 “Character States”; TA §§5.1, 6.3 “Characters”; ROAD Phase 2; ARCH §4; DEC “Avatars: Quaternius characters + Universal Animation Library (owner)”.

Implement idle, walk, sit, working, drinking, coffee interaction, wave and rest/relax (reusing sit) with AnimationMixer, an explicit state machine and approximately 0.25 s cross-fades. Use UAL Idle, Walk, Sitting_Enter/Idle/Exit and Interact as the accepted clip basis. Compose working/typing and drinking clips; DEC reports no CC0 source found for them and notes Mixamo is not CC0. Replicate animation enum and seatId in P3.

**Acceptance:** Unit: verify core state transitions and replicated enum/seatId. Manual: enter and exit a seat, work, drink, walk and stop; animations match each activity and transition using the configured approximately 0.25 s blend rather than unrelated poses. Verify coffee, wave and sofa-rest transitions, with rest reusing sit; fallback-source discrepancies are OQ-029.

### REQ-AVATAR-003 — Phase 2 Quaternius retargeting task
**Phase:** P2. **Sources:** SRS §3.1 “Avatar Selection / Character States”; TA §6.3 “Characters”; ROAD Phase 2; DEC “Proof-of-concept results (spike/poc, not committed)” and avatar decision.

Port the working retargeting implementation referenced as `spike/poc/avatar/src/retarget.ts` into `apps/web`. Quaternius Modular Men/Women Suit rigs have 49/51 joints versus UAL's 53, with rest rotations differing by up to approximately 90 degrees. Retarget using world-space rest poses plus hip-motion transfer. The PoC reports approximately 1.85 m avatar height and `Sitting_Idle_Loop` aligned to a 0.45 m seat. Kenney Mini Characters with a shared rig remain the fallback; switching away from the owner's chosen style requires confirmation.

**Acceptance:** Unit: retargeted clips play on both suit rigs without NaN transforms. Manual: capture screenshots confirming seated-pose alignment with a 0.45 m seat. No invented angular/hip error formulas or numeric tolerances are required. Clip naming remains OQ-009; source availability remains OQ-020. PoC success is not proof the port exists.


### REQ-AVATAR-004 — Additional PRD activities
**Phase:** P2. **Sources:** SRS §3.1 “Character States”, §2.2.B; SCOPE “Optional / Emotes / Running”; ARCH §4.

Coffee interaction is a mandatory core state under SRS §3.1. Wave emote and rest/relax on the Entertainment-zone sofa are mandatory; rest/relax reuses the sit animation. These decisions resolve the optional-emote/smaller-FSM conflict. Running remains optional, with default speed in REQ-MOVE-001.

**Acceptance:** Unit: verify coffee, wave and sofa-rest transitions and reuse of sit for rest. Manual: perform coffee interaction, wave and rest/relax on the Entertainment sofa and observe corresponding activities. Omitting optional running does not fail the prototype. Pantry trigger/timing details remain OQ-015.

### REQ-UI-001 — Nameplate and activity display
**Phase:** P2, P3. **Sources:** SRS §§2.2.A–B, 3.1 “Identity Display”; ROAD Phase 2.

Display employee name, online status and current activity for each character, including working and break activity where applicable.

**Acceptance:** Playwright or Manual: the selected employee's name and activity are visible while idle, working and taking a break; with multiple clients, each display refers to the correct avatar and updates from replicated state. **Conditional:** mapping activity to the identity status enum is OQ-010.

### REQ-UI-002 — Join Office and identity contract
**Phase:** P2, P3, P5. **Sources:** SRS §3.2; SCOPE “Must Have”; ROAD Phases 3, 5; DOD “URL / name, office code and avatar”; ARCH §§1, 5.

The browser flow is: open website, enter employee name and office code, choose avatar, press Join Office, find or create the matching room unless full, spawn at Entrance. At ten total employees, reject the eleventh join with a clear room-full message and no overflow room (ARCH §5 over SRS §3.2 “find or create”). No account or password is required. Preserve `EmployeeIdentity`: sessionId, employeeName, officeCode, avatarId, status (`online | working | away`). Office code identifies a room, not authenticated identity.

**Acceptance:** Playwright: complete that ordered flow from the entry URL and observe the chosen avatar at Entrance; another client with the same normalized code joins that room; the eleventh join receives a clear room-full message and no overflow room is created. Unit: identity contract supports all five fields and only the three specified status values. Exact status transitions remain OQ-010; input validation is REQ-NFR-004.

### REQ-UI-003 — Online employee list
**Phase:** P3. **Sources:** SRS §§2.2.D, 3.3; TA §5.1 “Frontend UI”; ROAD Phase 3.

Show online employees in a 2D UI panel, plus a decorative entrance board showing the online count. No in-world terminal interaction is required. During the 20 s reconnect reservation the avatar remains visible with a “reconnecting” nameplate marker; this bounded marked state is not a ghost. Confirmed leave or reservation expiry removes the avatar and list entry.

**Acceptance:** Playwright: with three clients, verify the panel lists all three and the decorative entrance board shows the online count without terminal interaction. Disconnect one client: observe its visible avatar and reconnecting nameplate during reservation, restoration on reconnect, and removal of avatar/list entry on expiry or confirmed leave.

### REQ-UI-004 — Loading, connection, error and settings UI
**Phase:** P2, P4, P5. **Sources:** TA §5.1 “Frontend UI”; ROAD Phase 5; ARCH §§4, 6–7; DEC PoC TV finding.

Provide interaction panels, a TV controller and settings UI, then polish the join flow with loading, connection-status and error states. Include server-starting/retry feedback and per-video errors. Settings contents are unspecified (OQ-012).

**Acceptance:** Playwright: show loading while assets/connection are pending, connection status during connect/disconnect/retry, and a visible error on a simulated join or video failure. Manual: inspect interaction and TV panels and the settings entry. **Conditional:** settings controls and final UI polish rubric await OQ-012/OQ-003.

## Office interaction requirements

### REQ-INT-001 — Registry, proximity and dispatch
**Phase:** P2, P4. **Sources:** SRS §§4.1–4.2; SRS §3.1 “Movement”; TA §5.1; ARCH §4.

Use an OfficeInteractable registry with id, type, position (three numbers), interactionRange and interact(employeeId). Give each zone its own interaction manager/module. Cover computer, chair, coffee machine, water dispenser, storage cabinet, main door and TV. Check a default 2.0 m interaction range within a 90-degree facing cone with nearest-target priority, tunable in balance config, show `E - Interact`, dispatch on E, update animation/UI and close interaction UI on Esc. Do not centralize all interaction logic in one file/component.

**Acceptance:** Unit: each of the seven object types resolves to its zone handler and has the declared contract; test inside/outside the default 2.0 m range and 90-degree facing cone and verify nearest-target priority. Playwright: approach an eligible object, see the E prompt, press E and observe its panel/animation; Esc closes a focused interaction panel. Distance origin and cancellation remain OQ-013; iframe focus exceptions are REQ-TV-002.

### REQ-INT-002 — Workstation sit, stand and work
**Phase:** P2, P3. **Sources:** SRS §2.2.A; ROAD Phase 2; DOD “workstation”; ARCH §4.

Give every workstation an interaction point and predetermined seat position, using seat sockets configured per furniture type. Allow sitting, standing and computer interaction with working animation, name and status display. The eight desks use first-come seating. When all desks are taken, the desk Sit action is unavailable and the UI shows that.

**Acceptance:** Unit: every interactive workstation resolves to one configured interaction point and seat position. Playwright or Manual: sit at a workstation, observe seated/working animation through computer interaction, and stand again. P3 checks show matching seated/standing state and seatId on another client. Unit: simultaneous requests cannot assign the same desk twice; first accepted request takes it. Playwright: occupy all eight desks and verify desk Sit is unavailable with visible UI feedback. Remaining positioning/recovery and computer action details are OQ-014.

### REQ-INT-003 — Pantry actions and break state
**Phase:** P2, P3. **Sources:** SRS §2.2.B, §3.1; ROAD Phase 2; DOD “at least one Pantry item”.

Require taking/preparing coffee as a core state with animation, drinking water, resting and a displayed break status. Entertainment-sofa rest/relax is mandatory and reuses sit (REQ-AVATAR-004). The DOD's minimum of one Pantry interaction does not erase the more detailed SRS actions.

**Acceptance:** Manual: trigger coffee preparation/taking, water drinking and resting; observe corresponding animation/activity and break display. DOD demonstration must include at least one Pantry object. **Conditional:** exact triggers, duration, completion and cancellation rules await OQ-015; no real drink inventory is inferred.

### REQ-INT-004 — Basic storage interaction
**Phase:** P2. **Sources:** SRS §2.2.C; ROAD Phase 2; SCOPE “Optional / Personal lockers”.

Allow opening/closing a cabinet as local-only decoration without an inventory system. Do not replicate cabinet open states: PRD and ARCH replicate a closed list of states. Personal lockers are visual assets only; assigned lockers and personal-item viewing are out of scope.

**Acceptance:** Manual: open then close a cabinet and observe its local states. Unit or two-client check: cabinet open state is absent from replicated state and opening does not change another client’s decoration. Confirm no assigned-locker or personal-item viewing flow.

### REQ-INT-005 — Entrance spawn, door and exit
**Phase:** P2, P3. **Sources:** SRS §§2.2.D, 3.2; ROAD Phase 2.

Spawn joining employees at Entrance. Main-door opening/closing is local-only decoration: open states are not replicated and do not change collision. SRS §2.2.D “move out of the office” means leaving the room through the main door and returning to the join screen. No exterior world is included.

**Acceptance:** Playwright or Manual: verify Entrance spawn and local open/close visuals without changing another client’s door decoration. Unit: open/closed decoration has identical collision. Playwright: main-door exit leaves room membership and returns to the join screen without an exterior world.

## Multiplayer requirements

### REQ-NET-001 — Office-code rooms and capacity
**Phase:** P3, P5. **Sources:** SRS header, §§1.2, 3.2–3.3; SCOPE “Must Have”; ROAD Phases 3, 5; DOD “3–10 other employees”; ARCH §5; DEC PoC multiplayer finding.

Use one OfficeRoom per normalized office code in a single Node process, with custom roomId and maxClients = 10; reject an eleventh player instead of creating a duplicate room for that code. Demonstrate three through ten concurrent employees sharing avatars/actions. Capacity is ten employees in total; DOD “3–10 other” means three through ten in the room. Full-room rejection shows a clear message; ARCH §5 overrides SRS §3.2 “find or create” for full rooms.

**Acceptance:** Unit: same normalized code resolves to the same room, distinct codes to separate rooms, and the eleventh admission is rejected with no duplicate room. Playwright: exercise a three-client room and a ten-client room and observe mutually visible avatars. Verify clear room-full feedback for the eleventh client. Three and ten include the observing employee.

### REQ-NET-002 — Authoritative replicated employee state
**Phase:** P3. **Sources:** SRS §3.3; TA §§5.1–5.2; NFR “Networking / Security”; ROAD Phase 3; DOD “WebSocket position and state”; ARCH §§2, 5.

Clients send input/movement intent; the server validates and owns important state. Synchronize position, character direction, animation, seated/standing state and presence through Colyseus Schema over WebSocket. Keep authoritative state distinct from local presentation. Use shared layout/collision data and validators; do not allow arbitrary client state replacement.

**Acceptance:** Unit: reject invalid movement, bounds/collision violations and invalid interaction/state transitions; attempts to overwrite another player's or TV state do not mutate authoritative state. Playwright: one client moves, rotates, sits, stands and changes animation while another observes the corresponding updates.

### REQ-NET-003 — Fixed network cadence
**Phase:** P3. **Sources:** SRS §3.3 “Networking requirements”; NFR “Networking”; ROAD Phase 3; ARCH §5; DEC PoC multiplayer finding.

Run authoritative simulation at 20 Hz with a 50 ms patch rate. Send movement intent plus sequence at no more than 20 messages per second per client. These are accepted engineering settings, not extra PRD product rules.

**Acceptance:** Unit: controlled-clock checks verify a 50 ms simulation interval, 50 ms configured patch interval, ordered sequence data and no more than 20 movement sends in one second. Manual: inspect a packet capture to confirm cadence is bounded and scene/asset payloads are absent.

### REQ-NET-004 — Prediction, reconciliation and interpolation
**Phase:** P3. **Sources:** SRS §3.3; NFR “Networking”; ROAD Phase 3; ARCH §§2, 5.

Predict the local avatar, reconcile it with authoritative movement and interpolate remote avatars approximately 100 ms behind. Share the collision solver to reduce prediction/server mismatch.

**Acceptance:** Unit: on a synthetic timestamped movement trace, remote presentation samples the configured approximately 100 ms delay; an authoritative correction reconciles local state using the shared solver. Manual: observe remote movement without raw snapshot jumps under the selected test network profile. Use 100 ms RTT, 1% loss and a 10 min run, tunable in balance config. Remaining quality/error thresholds are OQ-017.

### REQ-NET-005 — Leave, disconnect and reconnect
**Phase:** P3, P5. **Sources:** SRS §3.3; NFR “Networking”; ROAD Phase 3; ARCH §§1, 5; DEC PoC multiplayer finding.

Handle departure without ghost avatars. Hold a reconnecting seat for 20 s using allowReconnection; keep its token in sessionStorage, fully resynchronize on reconnect and offer explicit rejoin after expiry. Server state is ephemeral; restart clears rooms and TV state. During the 20 s reservation the avatar stays visible with a “reconnecting” nameplate marker, then is removed on expiry. This bounded marked state is not a ghost; confirmed leave removes it immediately.

**Acceptance:** Unit: exercise reconnect before the 20 s reservation expires and refusal after expiry; a confirmed leave/expired reservation removes membership and avatar state. Playwright: reconnect receives the current full employee/TV state, and expiry provides a rejoin path. Manual: restart the server and confirm the UI does not imply durable state preservation. Playwright: verify the marked visible avatar throughout the reservation and removal on expiry.

### REQ-NET-006 — Client-owned retry and rejoin path
**Phase:** P3, P5. **Sources:** NFR “Networking / reconnect handling”; ROAD Phases 3, 5; ARCH §§5–6; DEC “Proof-of-concept results (spike/poc, not committed)”.

Do not rely solely on SDK automatic reconnection: the PoC reports it requires at least 5 s room uptime. Provide the client's own retry/rejoin path, including failures during that initial interval, expired reconnection and server cold start. Keep explicit rejoin after expiry distinct from reconnect within a held seat. Use reconnect backoff of 1 s, 2 s, 4 s and 8 s, then an explicit Rejoin button; defaults are tunable in balance config.

**Acceptance:** Playwright with a controlled server: disconnect a room before 5 s uptime and verify the client reaches a working retry/rejoin path; separately test disconnect after 5 s and after 20 s reservation expiry. Observe connection/retry UI and recovery without duplicate membership. Unit with a controlled clock: verify the 1/2/4/8 s backoff sequence then explicit Rejoin button. Remaining retained-identity/cancellation/messaging details are OQ-018.

### REQ-NET-007 — Colyseus 0.18 API compatibility
**Phase:** P3. **Sources:** TA §5.1 “Multiplayer Backend”; ROAD Phase 3; DEC “Proof-of-concept results (spike/poc, not committed)”; ARCH §3.

Respect the tested API baseline: Colyseus 0.18.12, @colyseus/sdk 0.18.9 and @colyseus/schema 5.0.45. The 0.18 API uses `Room<{state}>`, `onLeave(client, code)` and `CloseCode`; do not copy incompatible older signatures. The spike validated custom roomId per office code, 20 Hz movement, shared TV state and 20 s reconnection. ARCH requires exact versions pinned at scaffold time after registry checking; any divergence from the tested baseline must be recorded and compatibility verified, not silently assumed equivalent.

**Acceptance:** Unit: typecheck and exercise room creation, movement replication, TV state replication and leave/reconnect against the selected pinned packages with the 0.18 signatures. Manual: compare manifests/lockfile to the stated tested baseline and document any difference. This specification does not install packages or treat uncommitted PoC code as delivered.

### REQ-NET-008 — Transport boundaries and minimal payloads
**Phase:** P3, P4. **Sources:** SRS §§3.3–3.4; TA §§5.1–5.2; NFR “Maintainability”; ARCH §§2, 5.

Use HTTP/REST for health, configuration, catalog, static metadata and other non-realtime requests. Use Colyseus over WebSocket for player join/leave, movement, animation, interaction and TV metadata/commands. WebSocket is required transport, not a substitute for Colyseus. Do not synchronize entire scenes/assets or transport video streams through Colyseus. Each browser fetches media directly from YouTube. The prototype is chat-free.

**Acceptance:** Unit: message contracts contain only required state/commands and have no scene/asset/video payloads. Manual: network inspection shows static/media downloads outside the room socket and the listed realtime events on WebSocket; inspect HTTP handlers for the declared non-realtime responsibilities. Use a curated catalog and pasted YouTube URL; remaining catalog/error details are OQ-021.

## Shared TV requirements

### REQ-TV-001 — CSS3D TV rendering
**Phase:** P4. **Sources:** SRS §§2.2.E, 3.4; TA §7.1; ROAD Phase 4; ARCH §4; DEC PoC TV finding.

Use WebGLRenderer for the office and CSS3DRenderer/CSS3DObject for the wall-aligned YouTube iframe. The TV group contains frame mesh, screen-border mesh and CSS3D screen display. Use a depth-only WebGL occluder and manage both renderers. The iframe is an HTML surface, not a decoded video texture or a Three.js material. Do not use CSS3D as a blanket replacement for UI. The TV PoC used Three.js 0.187.

**Acceptance:** Manual: orbit in front of/behind the TV and an intervening object, checking placement and depth/occlusion; inspect the TV structure and both renderer lifecycles. Playwright or Manual: playback appears in the screen display. Any unresolved browser-specific occlusion limits are recorded, not described as validated by the spike.

### REQ-TV-002 — TV mode, on-screen exit and focus recovery
**Phase:** P4. **Sources:** SRS §3.1 “Esc”, §3.4 “Close TV interface”; TA §7.1; ARCH §4; DEC “Proof-of-concept results (spike/poc, not committed)”.

Keep iframe pointer-events disabled outside TV mode so orbit controls work through the screen; enable iframe interaction in TV mode. Start playback muted until a user gesture. Clicking the iframe steals keyboard focus: TV mode must have an on-screen exit and restore focus for office controls when leaving. Do not assume Esc alone can escape a focused cross-origin iframe. Closing exits only the local TV view; playback continues for others. A separate Stop control stops playback for everyone under REQ-TV-005 authority.

**Acceptance:** Playwright plus Manual against a live iframe: orbit while pointer-events is disabled, enter TV mode, click inside the iframe, use the on-screen exit and then move/orbit in the office again. Verify focus recovery, disabled iframe interaction after exit and muted initial playback until a user gesture. Esc closes a TV panel when the application has keyboard focus; the on-screen exit works after iframe focus theft. With two clients, closing one local view leaves playback running for the other.

### REQ-TV-003 — Video selection and playback controls
**Phase:** P4. **Sources:** SRS §§2.2.E, 3.4 “TV Controls”; ROAD Phase 4; DOD “YouTube selection / play/pause/seek”.

Allow opening TV/selection UI, selecting from a curated catalog or pasting a YouTube URL, play, pause, seek, change video, Stop and local close. Use YouTube IFrame Player API. No live YouTube search or YouTube Data API key is used. Catalog plus pasted URL is an owner-approved documented deviation from SRS “search”. Closing only exits the local TV view; playback continues for others. Stop stops playback for everyone under existing REQ-TV-005 control authority.

**Acceptance:** Playwright with a provider test double: select a catalog item and a pasted YouTube URL, then exercise all listed controls. With multiple clients, verify local close leaves others playing and Stop stops everyone under REQ-TV-005. Manual: demonstrate embeddable YouTube play/pause/seek and video change. Source/configuration review: no live search or Data API key dependency. Remaining catalog/error details are OQ-021; controller departure and ended behavior remain OQ-022.

### REQ-TV-004 — Shared playback contract
**Phase:** P4. **Sources:** SRS §3.4 “Shared Playback State / Synchronization”; TA §5.2; ROAD Phase 4; ARCH §5.

Preserve SharedTVState: videoId (`string | null`), provider (`youtube`), status (`idle | playing | paused`), currentTime (`number`), updatedAt (`number`, server timestamp) and controllerSessionId (`string | null`). Server commands update shared state over WebSocket; each client applies it to its own player.

**Acceptance:** Unit: validate all six fields and their allowed values; play, pause, seek, change-video and Stop commands produce replicated state; Stop stops playback for all while local close does not mutate shared playback. Playwright with three clients: each receives the same selected video/status and applies the server's playback position. Timestamp units and time-calculation conventions are OQ-023.

### REQ-TV-005 — Shared control authority
**Phase:** P4. **Sources:** SRS §3.4 “TV Permission”; ARCH §5.

All employees can control TV by default. Serialize commands in room order, processing one at a time; the server determines final state. Host/admin permissions are a later possibility, not a prototype requirement.

**Acceptance:** Unit: two different employees can each issue a valid TV command; concurrent test commands are processed sequentially and every client receives the server's final ordered result. Clients cannot bypass validation by writing shared state directly. No TV-host role is required.

### REQ-TV-006 — Drift correction and visibility resync
**Phase:** P4. **Sources:** SRS §3.4 “Synchronization”; ROAD Phase 4 acceptance; ARCH §5.

Use server-timestamped playback state. Apply accepted correction bands: below 0.5 s drift, ignore; 0.5–2 s, playback-rate nudge; above 2 s, hard seek. Resynchronize on visibilitychange. Target drift under 1.0 s across clients after 5 s convergence, tunable in balance config.

**Acceptance:** Unit: test drift values below 0.5 s, at 0.5 s, within the middle band, at 2 s and above 2 s against the stated actions. Playwright: hide/restore a client and observe resync. Playwright: under 100 ms RTT and 1% loss over a 10 min run, verify drift under 1.0 s across clients after 5 s convergence; defaults are tunable in balance config. Remaining nudge/clock/timing semantics are OQ-023.

### REQ-TV-007 — Provider abstraction and video metadata
**Phase:** P4. **Sources:** SRS §3.4 “Movie Provider Architecture”; NFR “Maintainability”; TA §5.1.

Keep providers separate from the TV controller. Preserve VideoProvider methods `search(query): Promise<VideoItem[]>` (curated-catalog lookup only, not live YouTube search), `getVideo(id): Promise<VideoItem | null>` and `getEmbedUrl(id): string`. Preserve VideoItem fields id, title, thumbnail, provider, optional duration, sourceUrl and embeddable. Ship YouTube only, with youtube as the sole provider value; other sources are research notes, not provider enum members. A later provider can be added without modifying the TV controller, subject to future scope approval.

**Acceptance:** Unit: use a provider test double implementing all three methods, test found/missing video and optional duration, and run the same controller behavior with two provider implementations without controller changes. This is an extensibility check, not a requirement to ship a second provider or broaden SharedTVState beyond YouTube. Verify catalog lookup and pasted-URL resolution do not require live search or a Data API key.

### REQ-TV-008 — Permitted content, free sources and research scope
**Phase:** P4. **Sources:** SRS §3.4 “Playback / Movie Provider Architecture / Special requirements”; ARCH §1.

Use publicly accessible embeddable YouTube videos or public-domain/internal content with usage rights. Check each source's embedding permission and terms; do not assume every iframe video works. Prefer free APIs and do not use paid APIs when a suitable free option exists; accepted architecture further requires zero cost. Research candidates are YouTube Data API, Internet Archive, public-domain collections and Jellyfin for an internal library. Do not scrape/depend on pirate movie sites or bypass DRM. YouTube is the only delivered provider; other sources are research notes, not provider enum members. YouTube Data API is research only; no live search or Data API key is used.

**Acceptance:** Manual: record free-use, content-rights, embedding and terms checks for the chosen source, and a suitability finding for each of the four candidate categories. Inspect the chosen integration for zero paid API reliance, piracy scraping and DRM-bypass logic. An unembeddable item is not presented as known playable. Verify YouTube-only delivery and no added provider enum values or Data API key dependency.

### REQ-TV-009 — Embed/autoplay failure handling
**Phase:** P4, P5. **Sources:** ROAD Phase 4; SRS §3.4 “Special requirements”; ARCH §7; DEC PoC TV finding.

Handle embedding-blocked and playback restriction errors with per-video UI. The PoC's blocked-embed path was unverified because it still needed a truly blocked video ID; preserve this as an outstanding validation task. Do not count muted-autoplay success as blocked-video coverage.

**Acceptance:** Unit: inject player errors and verify visible per-video error state. Manual: use a confirmed embedding-blocked video and observe the real error path; also test the accepted muted/user-gesture behavior with an embeddable video. The live blocked-video check remains incomplete until a suitable fixture is obtained (OQ-025).

## Performance, architecture and security requirements

### REQ-PERF-001 — Desktop frame-rate target
**Phase:** P1, P5. **Sources:** NFR “Performance”; ROAD Phases 1, 5; SRS §2.1.

Target 30–60 FPS on ordinary desktop computers while preserving the stylized office experience. Do not redefine the target using unspecified hardware or an invented benchmark duration.

**Acceptance:** Manual profiling: record hardware, browser, resolution, scene/player count and measured frame-rate results for the exploratory P1 scene and final multiplayer scene, comparing them with 30–60 FPS. **Conditional:** representative hardware, measurement method/window and treatment of rates above 60 FPS await OQ-003.

### REQ-PERF-002 — Geometry, texture and draw-call budgets
**Phase:** P1, P5. **Sources:** NFR “Performance”; TA §6.2; ARCH §4.

Optimize GLB/textures, limit draw calls and unnecessary polygons, reuse geometry/materials and use InstancedMesh for repeated props. Accepted targets: at most 45 draw calls, fewer than 120,000 triangles, prop textures at most 1024 x 1024 and avatar textures at most 512 x 512.

**Acceptance:** Manual profiling: capture renderer draw-call/triangle counts for the agreed scene, compare with the stated targets and inspect all shipped prop/avatar texture dimensions. Unit or Manual: repeated prop definitions reuse geometry/materials and the repeated-prop path uses instancing. Scope of renderer counters and maximum-player measurement is OQ-003.

### REQ-PERF-003 — Asset loading policy
**Phase:** P1, P5. **Sources:** NFR “Performance”; TA §§6.1–6.2; ROAD Phase 5.

Do not eagerly load every unnecessary asset at startup. Separate asset loading and lazy-load zones/assets where appropriate, while reusing modular assets rather than duplicating geometry unnecessarily.

**Acceptance:** Manual network/source review: identify startup-required assets, confirm deferred assets are requested only when needed and document cases where a small shared asset is loaded eagerly. Record initial requests/bytes; no download-size or loading-time budget is invented (OQ-003).

### REQ-NFR-001 — Stack and module boundaries
**Phase:** P1, P2, P3, P4. **Sources:** TA §§5.1–5.3; NFR “Maintainability”; SRS §§2.2.E, 4.2; ARCH §§2–4; DEC “pnpm monorepo, TS strict, Vitest, Colyseus single process”.

Use pnpm workspaces: apps/web (Vite, React, Zustand, HTML/CSS UI, Three.js game and networking), apps/server (Node.js/Colyseus rooms, handlers and services) and packages/protocol (wire types, validators, IDs, schemas, layout and collision). The shared package imports neither React nor Three.js. Keep Three.js's per-frame rendering lifecycle outside React frame updates; separate zone, interaction, networking, provider and asset-loading modules. Do not create a monolithic SceneManager. DEC supersedes TA §5.3 apps/shared with packages/protocol; see Superseded PRD items.

**Acceptance:** Manual source/dependency review: each listed responsibility has its own module boundary, the TV logic is not embedded in Office Scene, and shared imports contain no React/Three.js. Unit: UI-store changes do not require routing each render frame through React. Verify packages/protocol replaces apps/shared and record the superseded layout without generating additional recommended docs/files as part of this specification task.

### REQ-NFR-002 — Strict tooling and automated checks
**Phase:** P1, P5. **Sources:** NFR “Maintainability / TypeScript strict mode”; TA §5.1; ROAD Phase 5; ARCH §3.

Use Node LTS and pnpm pinned through engines/packageManager, strict TypeScript project references (`tsc -b`), Vitest, ESLint with typescript-eslint/react-hooks, Prettier and GitHub Actions checks for format, lint, typecheck, test and build. Pin exact versions at scaffold time after checking the registry, with PoC compatibility handled under REQ-NET-007.

**Acceptance:** Manual: inspect pinned tooling/configuration and CI definitions. Unit/check execution: all five declared CI check categories succeed, and strict mode/type-reference builds cover client, server and protocol. This document does not assert any scaffold or check already exists.

### REQ-NFR-003 — Asset pipeline and standards
**Phase:** P1, P2, P5. **Sources:** TA §§6.1–6.3; NFR “Performance / Maintainability”; ARCH §§1, 4; DEC procedural-shell and avatar decisions.

Use a procedural room shell and CC0 Kenney furniture/office kits plus Quaternius character GLBs without requiring Blender or a powerful local modeling workstation. DEC supersedes TA §6.1’s Blender pipeline with procedural geometry and CC0 assets; see Superseded PRD items. Load GLB via GLTFLoader; use meters and Y-up, optimized meshes/textures, preferably PBR and WebP/KTX2 where appropriate. Check imported/generated asset scale, materials, lighting and performance; do not assume generated assets meet production quality.

**Acceptance:** Manual asset audit: each chosen asset has CC0 provenance, correct meter scale/Y-up orientation and a successful GLTFLoader import; inspect materials, lighting and mesh/texture optimization. Starting the procedural scene does not require Blender. Document any case where preferred PBR or WebP/KTX2 is unsuitable. Animation group coverage is REQ-AVATAR-002/003.

### REQ-NFR-004 — Input validation and prototype identity security
**Phase:** P3, P5. **Sources:** SRS §3.2; NFR “Security”; ARCH §5.

Uppercase office codes and validate 4–12 characters from `[A-Z0-9-]`. Validate names as 1–20 visible characters after trim (tunable in balance config) with no control characters/markup; render names as text. Accept only known avatar IDs. Treat office code as routing, never secure authentication, and do not add accounts/passwords or a database.

**Acceptance:** Unit: test code lengths 3/4/12/13, valid lowercase normalization and invalid symbols; trimmed name lengths 0/1/20/21, controls and markup; and unknown avatars. Playwright: valid employee names render as literal text, never executable markup. Trim before validating; remaining Unicode counting details are OQ-026.

### REQ-NFR-005 — Abuse limits and secret isolation
**Phase:** P3, P4, P5. **Sources:** SRS §§3.2–3.4; NFR “Security”; ARCH §§5–6.

Validate movement speed, bounds, collision, interaction range and state transitions. The prototype is chat-free; rate limits apply only to TV commands at 5 per 10 s per client and joins at 10 per minute per IP, tunable in balance config. Client movement sends remain capped at 20/s under REQ-NET-003, distinct from these abuse limits. Keep API secrets out of frontend code and prevent direct client replacement of authoritative state. No YouTube Data API key is used.

**Acceptance:** Unit with a controlled clock: exceed 5 TV commands per 10 s per client and 10 joins per minute per IP and verify excess requests are rejected without state mutation; reject invalid speed/range/transitions. Manual build/configuration review: frontend contains no API secrets and TV requires no Data API key. Remaining window/burst and feedback details are OQ-026.

## Deployment and completion requirements

### REQ-DEPLOY-001 — Independent, free web and realtime deployment
**Phase:** P5. **Sources:** SCOPE “Must Have / Web deployment”; TA §§8.1–8.3; ROAD Phase 5; DOD “URL / internet deployment”; ARCH §§1, 6; DEC free-hosting decision.

Deploy the static React/Vite/Three.js frontend and persistent Node/Colyseus backend independently: Cloudflare Pages with HTTPS, static assets, custom-domain capability and GitHub CI/CD; GitHub Pages is the frontend fallback and cannot host the Node server. Use Render Free for the long-lived WebSocket/room server, with Oracle Cloud Always Free VPS as fallback. Recheck free-tier terms before a demo. Fly.io and Railway are excluded by the accepted lasting-free-tier decision; TA's other hosting options are alternatives, not additional deployment targets. Workers/Durable Objects are not a drop-in Colyseus deployment and would require a separate adapter/architecture decision.

**Acceptance:** Manual: from a desktop browser outside the local network, open the HTTPS URL without installing a client, join an office and communicate with the separately deployed backend over secure WebSocket. Verify the chosen services are free and support the listed roles. Custom-domain capability does not imply purchasing a domain.

### REQ-DEPLOY-002 — Cold start and ephemeral hosting state
**Phase:** P3, P5. **Sources:** NFR “Networking”; ROAD Phase 5 “Connection status / Error handling”; ARCH §§1, 6–7; DEC free-hosting and no-database decisions.

Render Free sleeps after 15 min idle and has an approximately 1 min cold start; restarts wipe rooms and TV state. Show “starting server” and automatically retry. Oracle Always Free is the accepted fallback if cold starts are unacceptable; use the backoff and explicit Rejoin path in REQ-NET-006.

**Acceptance:** Playwright with delayed availability: observe the starting-server indicator and the 1/2/4/8 s retries followed by explicit Rejoin during a simulated approximately 1 min startup, then join successfully through Rejoin when available. Manual: check real hosting sleep/restart behavior before the demo and disclose ephemeral state in connection recovery behavior. No persistent room recovery is promised. Retry defaults are REQ-NET-006; remaining recovery details are OQ-018.

### REQ-DEPLOY-003 — Environment-based configuration
**Phase:** P3, P5. **Sources:** TA §8.3 “Environment configuration”; NFR “Security”; ROAD Phase 5 “Production configuration”; ARCH §6.

Do not hardcode server URLs. Use a single public VITE_SERVER_URL and derive both HTTP and WebSocket endpoints from it (ARCH §6 over TA §8.3’s VITE_API_URL/VITE_WS_URL). Keep server PORT/ALLOWED_ORIGINS configurable and secrets server-side.

**Acceptance:** Manual configuration/build review: frontend uses one VITE_SERVER_URL, derives HTTP/WS endpoints from it and requires no API secret. Unit: verify endpoint derivation from the base URL and rejection of disallowed origins. Production allowed-origin values remain OQ-027.

### REQ-DEPLOY-004 — Prototype release evidence
**Phase:** P5. **Sources:** ROAD Phase 5; DOD entire “Final Definition of Done” and “Final Product Goal”; SRS §1.2.

Run profiling, multiplayer stress testing, error checks and an internet-accessible end-to-end demonstration of the unified office experience: URL entry, name/code/avatar, WASD, sitting/working, at least one Pantry object, shared presence/movement/activity, embeddable YouTube selection and synchronized play/pause/seek. Core features must work in a desktop browser without a client installation.

**Acceptance:** Playwright plus Manual: run the complete journey with three and ten clients and retain observed outcomes, connection errors and profiling results. Each underlying requirement remains subject to its own acceptance criteria; this journey does not waive detailed SRS actions. Use three and ten total employees, 100 ms RTT, 1% loss and a 10 min run, with TV drift under 1.0 s after 5 s convergence; defaults are tunable in balance config. Remaining sign-off gaps are the OQ-003 performance rubric, OQ-017 quality thresholds and OQ-023 timing semantics.

## Non-goals and optional scope

`PRD/NonFeature.md` actually contains **Non-Functional Requirements**, not an exclusion list. Its Performance, Networking, Maintainability and Security requirements are implemented above and fully traced below. The explicit non-goals come from `PRD/Scope.md` “Out of Scope” and SRS §1.2/§3.1; the earlier brief incorrectly treated the NFR file as a non-goals source; no filename clarification is pending.

### REQ-SCOPE-001 — Prototype non-goals
**Phase:** P1, P2, P3, P4, P5. **Sources:** SCOPE “Out of Scope”; SRS §§1.2, 3.1, 2.2.C; NFR file-content clarification above.

Exclude a full metaverse platform, voice chat, video calls, complex employee permissions, custom avatar creator, economy/inventory system, mobile-first controls, VR and a full movie-streaming platform. Do not expand into unnecessary social features. Basic cabinet decoration does not establish inventory mechanics. Assigned lockers, personal-item viewing, Space/jump and an exterior world are excluded by the resolved decisions. Accepted architecture additionally excludes accounts, database persistence, paid tooling/hosting/assets and required Blender tooling.

**Acceptance:** Manual scope/source review at each phase gate: no delivery dependency or implemented product flow requires any of the nine named SCOPE exclusions; verify the basic join/office/TV journey works without them. If an excluded feature is proposed, obtain scope approval before implementation.

### REQ-SCOPE-002 — Optional and future items are not completion gates
**Phase:** P1, P2, P3, P4, P5. **Sources:** SCOPE “Optional”; SRS §§2.2.D–E, 3.1 “Movement / Character States”, 3.4 “TV Permission”; TA §5.1.

Emotes other than mandatory wave, running, TV voting, employee activity history and multiple office layouts remain optional. Reception desk and TV stand are optional; TV host/admin permissions may be added later. The prototype is chat-free. Personal lockers are required visual assets only; assigned lockers and personal-item viewing are out of scope. Space/jump is dropped. Optional implementation is not authorized by this specification.

**Acceptance:** Manual: the release checklist can pass with zero optional features; verify the chat-free prototype, dropped Space/jump, and absence of any mandatory second layout or TV-host role. Verify mandatory wave, coffee core state, sofa rest using sit, and visual-only lockers remain required.

## Resolved decisions (2026-11-09)

| Decision | Source | Affected requirements |
|---|---|---|
| Keep Quaternius Modular Suit models; documented deviation from SRS §2.1 “stylized, slightly larger head”. | owner | REQ-ROOM-001, REQ-AVATAR-001, REQ-AVATAR-003 |
| Keep eight photo-faithful desks, first-come seating; desk Sit is unavailable with UI feedback when all desks are taken. | owner | REQ-ROOM-002, REQ-ROOM-004, REQ-INT-002 |
| Wave and Entertainment-sofa rest/relax are mandatory; rest reuses sit. Personal lockers are visual-only; assigned lockers and personal-item viewing are out of scope. | owner | REQ-AVATAR-002, REQ-AVATAR-004, REQ-ROOM-006, REQ-INT-004, REQ-SCOPE-001, REQ-SCOPE-002 |
| Curated catalog plus pasted YouTube URL replaces SRS search; no live search or YouTube Data API key. | owner | REQ-TV-003, REQ-TV-007, REQ-TV-008, REQ-NET-008 |
| Maximum ten employees total; read DOD “3–10 other” as 3–10 in the room (OQ-002 resolved). | lead | REQ-NET-001, REQ-DEPLOY-004 |
| Reject the eleventh join with a clear message and no overflow room; ARCH §5 over SRS §3.2 “find or create”. | lead | REQ-UI-002, REQ-NET-001 |
| Coffee interaction is a mandatory core state under SRS §3.1. | lead | REQ-AVATAR-002, REQ-AVATAR-004, REQ-INT-003 |
| Main-door exit leaves the room and returns to join screen; no exterior world. | lead | REQ-MOVE-002, REQ-INT-005, REQ-SCOPE-001 |
| Keep disconnected avatar visible with reconnecting nameplate during the 20 s reservation, then remove it; bounded marked state is not a ghost. | lead | REQ-NET-005, REQ-UI-003 |
| Door/cabinet open states are local-only decoration, absent from PRD/ARCH’s closed replicated-state list; open doors do not change collision. | lead | REQ-INT-004, REQ-INT-005, REQ-MOVE-002, REQ-NET-002 |
| YouTube only; other sources are research notes, not provider enum values (OQ-024 resolved). | lead | REQ-TV-004, REQ-TV-007, REQ-TV-008 |
| NonFeature.md is the NFR file; non-goals come from Scope.md. The earlier non-goals source attribution was a brief error; no question remains. | lead | REQ-SCOPE-001, REQ-PERF-001, REQ-PERF-002, REQ-PERF-003, REQ-NFR-001, REQ-NFR-004, REQ-NFR-005 |
| Drop optional Space/jump because it is incompatible with DEC’s 2.5D collision. | lead | REQ-MOVE-001, REQ-MOVE-002, REQ-SCOPE-001, REQ-SCOPE-002 |
| DEC supersedes Blender pipeline, Fly.io/Railway hosting and apps/shared; see Superseded PRD items. | lead | REQ-NFR-001, REQ-NFR-003, REQ-DEPLOY-001 |
| Presence list is a 2D UI panel plus decorative entrance online-count board; no terminal interaction. | lead | REQ-UI-003 |
| Close exits local TV view only; playback continues for others. Stop stops playback for everyone under existing authority. | lead | REQ-TV-002, REQ-TV-003, REQ-TV-004, REQ-TV-005 |
| Retarget acceptance: unit test for clips playing without NaN transforms, plus manual screenshot check of seated pose at a 0.45 m seat; no invented error formulas. | lead | REQ-AVATAR-003 |
| Defaults, all tunable in balance config: walk 2.0 m/s, optional run 4.0 m/s, camera-relative WASD with normalized diagonals, capsule radius 0.3 m; interaction 2.0 m in a 90-degree facing cone, nearest target first; tests at 100 ms RTT, 1% loss, 10 min; reconnect backoff 1/2/4/8 s then explicit Rejoin; TV drift under 1.0 s after 5 s convergence; trimmed names 1–20 visible characters; chat-free, rate limits only TV 5 per 10 s per client and joins 10 per minute per IP. | lead | REQ-MOVE-001, REQ-MOVE-002, REQ-INT-001, REQ-NET-004, REQ-NET-006, REQ-TV-006, REQ-NFR-004, REQ-NFR-005, REQ-DEPLOY-004 |
| Single VITE_SERVER_URL derives HTTP/WS endpoints; ARCH over TA. | lead | REQ-DEPLOY-003 |

## Superseded PRD items

| PRD item | Accepted replacement | Requirements |
|---|---|---|
| TA §6.1 Blender pipeline | DEC procedural room shell + CC0 assets; no required Blender pipeline. | REQ-ROOM-002, REQ-NFR-003 |
| TA §8.2 Fly.io/Railway hosting | DEC Cloudflare Pages frontend + Render backend; accepted fallback details remain in REQ-DEPLOY-001. | REQ-DEPLOY-001 |
| TA §5.3 apps/shared | DEC packages/protocol. | REQ-NFR-001 |

## Traceability

Every PRD item is represented below, including alternatives, preferences, optional items and exclusions. A grouped row explicitly names its constituent items; mapping a whole section is not intended to erase its individual clauses. ARCH/DEC refinements are cited at their requirements, especially all three PoC findings. Phase tasks, deliverables and acceptance criteria are traced separately from the SRS to make roadmap coverage visible.

| PRD item / section | REQ IDs |
|---|---|
| SRS header: web, TypeScript, stylized 3D, third-person, 3–10 per room | REQ-NFR-001, REQ-ROOM-001, REQ-CAM-001, REQ-NET-001, REQ-DEPLOY-001 |
| SRS §1.1: name/code entry and preset selection | REQ-UI-002, REQ-AVATAR-001 |
| SRS §1.1: free movement, workstation sitting/working, furniture interaction | REQ-MOVE-001, REQ-MOVE-002, REQ-INT-001, REQ-INT-002, REQ-INT-003, REQ-INT-004, REQ-INT-005 |
| SRS §1.1: real-time employees, shared office YouTube | REQ-NET-001, REQ-NET-002, REQ-TV-001, REQ-TV-003, REQ-TV-004 |
| SRS §§1.1–1.2: independently interactive areas; four core experiences; avoid scope expansion | REQ-ROOM-003, REQ-NFR-001, REQ-DEPLOY-004, REQ-SCOPE-001 |
| SRS §2.1: modern/tidy office, desks/monitors/chairs, windows/natural light, materials, warm/bright palette, no photorealism; owner deviation retains Modular Suit proportions instead of slightly larger heads | REQ-ROOM-001, REQ-ROOM-003, REQ-ROOM-004, REQ-AVATAR-001, REQ-PERF-001 |
| SRS §2.2: five functional areas | REQ-ROOM-003 |
| SRS §2.2.A: eight photo-faithful desks, chairs, monitors, keyboards, mice, lamps, stationery, decoration; first-come seating under REQ-INT-002 | REQ-ROOM-004 |
| SRS §2.2.A: sit, stand, work animation, computer interaction, name/status, interaction point and seat | REQ-INT-002, REQ-AVATAR-002, REQ-UI-001 |
| SRS §2.2.B: coffee machine, dispenser, cups, refrigerator, counter, cabinets | REQ-ROOM-005 |
| SRS §2.2.B: take/make coffee with animation, drink water, rest, break status | REQ-INT-003, REQ-AVATAR-002, REQ-AVATAR-004, REQ-UI-001 |
| SRS §2.2.C: cabinets, personal lockers, shelves, boxes, personal decoration | REQ-ROOM-006 |
| SRS §2.2.C: local-only cabinet open/close; owner excludes personal-item viewing/assigned lockers; visual lockers remain under REQ-ROOM-006 | REQ-ROOM-006, REQ-INT-004, REQ-SCOPE-001, REQ-SCOPE-002 |
| SRS §2.2.D: main door/frame, optional reception, plants, signage | REQ-ROOM-007, REQ-SCOPE-002 |
| SRS §2.2.D: Entrance spawn, local-only door decoration, leave to join screen, 2D presence list plus decorative online-count board | REQ-INT-005, REQ-UI-002, REQ-UI-003 |
| SRS §2.2.E: wall TV, optional stand, sofa, table, speakers, decorative light | REQ-ROOM-008, REQ-SCOPE-002 |
| SRS §2.2.E: TV open/select/play/pause/time adjustment/shared state; independent system | REQ-TV-003, REQ-TV-004, REQ-NFR-001 |
| SRS §3.1 Avatar Selection: preset set, pre-entry choice, model/animations each, no custom creator | REQ-AVATAR-001, REQ-AVATAR-002, REQ-AVATAR-003, REQ-SCOPE-001 |
| SRS §3.1 Movement: camera-relative normalized W/A/S/D, mouse, E, Esc; optional Space dropped by lead | REQ-MOVE-001, REQ-CAM-001, REQ-INT-001, REQ-TV-002, REQ-SCOPE-002 |
| SRS §3.1 Movement: third-person, facing travel, follow, collision, walls/furniture, office bounds | REQ-MOVE-001, REQ-MOVE-002, REQ-CAM-001 |
| SRS §3.1 Character States: idle, walking, sitting, working, drinking | REQ-AVATAR-002 |
| SRS §3.1 Character States: coffee interaction, waving, relaxing, optional running | REQ-AVATAR-004, REQ-INT-003, REQ-SCOPE-002 |
| SRS §3.1 Identity Display: employee name, online status, current activity | REQ-UI-001 |
| SRS §3.2: no account/password; open site/name/code/avatar/Join/find-or-create/Entrance sequence | REQ-UI-002, REQ-NET-001, REQ-INT-005 |
| SRS §3.2 EmployeeIdentity: sessionId, employeeName, officeCode, avatarId, online/working/away | REQ-UI-002 |
| SRS §3.2: room routing, not secure authentication; bounded name, code validation, basic anti-spam | REQ-NFR-004, REQ-NFR-005 |
| SRS §3.3 Functional: 3–10 same-room users, mutual avatars, position, direction, animation, sit/stand, online list | REQ-NET-001, REQ-NET-002, REQ-UI-003 |
| SRS §3.3 Functional: disconnect handling, remove avatar on leave | REQ-NET-005, REQ-NET-006 |
| SRS §3.3 Networking: WebSocket, authoritative important state, intent, server validation/state sync | REQ-NET-002, REQ-NET-003, REQ-NET-008, REQ-NFR-005 |
| SRS §3.3 Networking: interpolation, no full scenes/assets, only needed data | REQ-NET-004, REQ-NET-008 |
| SRS §3.4 Placement/Playback: Entertainment wall TV, IFrame API, public embeddable/public-domain/authorized internal content | REQ-ROOM-008, REQ-TV-001, REQ-TV-003, REQ-TV-008 |
| SRS §3.4 Controls: open, select, play, pause, seek, change, local close, shared Stop; owner replaces search with curated catalog plus pasted YouTube URL | REQ-TV-002, REQ-TV-003 |
| SRS §3.4 SharedTVState: all six fields, nullable video/controller, YouTube-only provider/status enums | REQ-TV-004 |
| SRS §3.4 Sync: server command/state/update; clients apply; direct YouTube fetch, no Colyseus stream | REQ-TV-004, REQ-TV-006, REQ-NET-008 |
| SRS §3.4 Permission: everyone controls, one command at a time, server final; later host/admin | REQ-TV-005, REQ-SCOPE-002 |
| SRS §3.4 Provider: catalog-only search/getVideo/getEmbedUrl; VideoItem fields retained; YouTube-only provider enum | REQ-TV-007 |
| SRS §3.4 Research: YouTube Data API, Internet Archive, public-domain collections, Jellyfin | REQ-TV-008 |
| SRS §3.4 Special: free APIs, avoid paid if suitable free, no pirate scraping/dependency, no DRM bypass, terms/embedding checks, not all iframe-playable, new provider without controller edits | REQ-TV-007, REQ-TV-008, REQ-TV-009 |
| SRS §4: separate manager per area; OfficeInteractable id/type/position/range/interact | REQ-INT-001, REQ-NFR-001 |
| SRS §4.1 objects: computer, chair, coffee machine, dispenser, cabinet, door, TV | REQ-INT-001, REQ-INT-002, REQ-INT-003, REQ-INT-004, REQ-INT-005, REQ-TV-003 |
| SRS §4.2: approach/check range/E prompt/E press/type dispatch/logic/animation+UI; no single-file interaction logic | REQ-INT-001, REQ-NFR-001 |
| SCOPE Must Have: 3D office, third-person movement, five zones | REQ-ROOM-001, REQ-ROOM-003, REQ-MOVE-001, REQ-MOVE-002, REQ-CAM-001 |
| SCOPE Must Have: selection, basic animation, workstation, Pantry | REQ-AVATAR-001, REQ-AVATAR-002, REQ-INT-002, REQ-INT-003 |
| SCOPE Must Have: name/code, 3–10 multiplayer, shared TV, YouTube sync, web deployment | REQ-UI-002, REQ-NET-001, REQ-TV-003, REQ-TV-004, REQ-TV-006, REQ-DEPLOY-001 |
| SCOPE Optional: running, other emotes, TV voting, activity history, layouts; owner makes wave mandatory and lockers visual-only; prototype is chat-free | REQ-SCOPE-002, REQ-AVATAR-004, REQ-INT-004 |
| SCOPE Out of Scope: metaverse, voice, calls, complex permissions, avatar creator, economy/inventory, mobile-first, VR, streaming platform | REQ-SCOPE-001 |
| NFR Performance: 30–60 FPS on ordinary desktops | REQ-PERF-001 |
| NFR Performance: avoid unnecessary startup assets, GLB/texture optimization, bounded draw calls, geometry/material reuse, appropriate lazy loading | REQ-PERF-002, REQ-PERF-003, REQ-NFR-003 |
| NFR Networking: stable WebSocket, bounded position frequency, interpolation, reconnect, authoritative/presentation separation | REQ-NET-002, REQ-NET-003, REQ-NET-004, REQ-NET-005, REQ-NET-006, REQ-DEPLOY-004 |
| NFR Maintainability: TS strict, separate zones/interactions/network/providers/asset loading, no monolithic SceneManager | REQ-NFR-001, REQ-NFR-002, REQ-PERF-003, REQ-TV-007 |
| NFR Security: code/name validation, critical interaction limits, no frontend API secrets, no client authoritative overwrite, code is not authentication | REQ-NFR-004, REQ-NFR-005, REQ-NET-002, REQ-DEPLOY-003 |
| TA §5.1 3D client: Three.js/TS/Vite/GLTFLoader/AnimationMixer/CSS3DRenderer; optional Rapier; environment/light/camera/avatar/animation/collision/interaction/TV responsibilities | REQ-NFR-001, REQ-NFR-003, REQ-ROOM-001, REQ-CAM-001, REQ-AVATAR-002, REQ-MOVE-002, REQ-INT-001, REQ-TV-001 |
| TA §5.1 Frontend: React/TS/HTML/CSS/Zustand, join/selection/list/optional chat/TV/settings/panels, separate Three.js render loop | REQ-NFR-001, REQ-UI-002, REQ-AVATAR-001, REQ-UI-003, REQ-UI-004, REQ-SCOPE-002 |
| TA §5.1 Backend: Node/TS/Colyseus/WebSocket/Schema, rooms/matchmaking/connections/movement/animation/TV/disconnect | REQ-NFR-001, REQ-NET-001, REQ-NET-002, REQ-NET-005, REQ-NET-007, REQ-TV-004 |
| TA §5.1 HTTP: health/config/catalog/static metadata/non-realtime; WebSocket: movement/join-leave/animation/interactions/TV/optional chat; transport relationship | REQ-NET-008, REQ-SCOPE-002 |
| TA §5.2: browser UI + 3D + CSS TV + Colyseus client + WebSocket + Node room/employee/TV state + 3–10 players | REQ-NFR-001, REQ-TV-001, REQ-NET-001, REQ-NET-002, REQ-TV-004 |
| TA §5.3 apps/shared superseded by DEC packages/protocol (see Superseded PRD items) | REQ-NFR-001, REQ-NFR-003 |
| TA §6.1: no powerful local machine required; Blender pipeline superseded by DEC procedural + CC0 (see Superseded PRD items); GLB import and quality checks retained | REQ-ROOM-002, REQ-NFR-003 |
| TA §6.2: GLB, Y-up, meters, optimized textures/polygons, preferred PBR/WebP/KTX2, modular reuse/no unnecessary geometry duplication | REQ-NFR-003, REQ-PERF-002, REQ-PERF-003 |
| TA §6.3 Environment: floor/walls/ceiling/windows/doors/lighting | REQ-ROOM-003 |
| TA §6.3 Furniture: desk/chair/sofa/cabinets/shelves | REQ-ROOM-004, REQ-ROOM-005, REQ-ROOM-006, REQ-ROOM-008 |
| TA §6.3 Equipment: computer/monitor/keyboard/mouse/TV/coffee machine/dispenser | REQ-ROOM-004, REQ-ROOM-005, REQ-ROOM-008 |
| TA §6.3 Characters: avatar/idle/walk/sit/work/drink | REQ-AVATAR-001, REQ-AVATAR-002, REQ-AVATAR-003 |
| TA §7.1: WebGL environment + CSS3D HTML + CSS3DObject iframe, TV frame/border/display, placement/rotation, no decoded video texture | REQ-TV-001 |
| TA §7.1 trade-offs: two renderers, no Three.js material/video texture, depth/occlusion checks, not all UI in CSS3D | REQ-TV-001, REQ-TV-002 |
| TA §8.1: Pages frontend/static/HTTPS/domain/GitHub CI/CD; GitHub Pages demo fallback, no Node hosting | REQ-DEPLOY-001, REQ-NFR-002 |
| TA §8.2: persistent Node/WebSocket/state; Fly.io/Railway superseded by DEC Cloudflare Pages + Render (see Superseded PRD items); Workers/DO require adapter | REQ-DEPLOY-001 |
| TA §8.3: independent frontend/backend, CI/build, room 3–10 total; ARCH single VITE_SERVER_URL derives HTTP/WS, no hardcoded URLs | REQ-DEPLOY-001, REQ-NFR-002, REQ-NET-001, REQ-DEPLOY-003 |
| ROAD P1 tasks: setup scene/renderer/TS/Vite, third-person, office, GLB, light, five zones, collision, controller | REQ-NFR-001, REQ-NFR-002, REQ-NFR-003, REQ-CAM-001, REQ-ROOM-001, REQ-ROOM-002, REQ-ROOM-003, REQ-MOVE-001, REQ-MOVE-002 |
| ROAD P1 deliverable/acceptance: one-player exploration, load, stable camera, walls, recognizable zones, desktop performance | REQ-ROOM-003, REQ-CAM-001, REQ-MOVE-001, REQ-MOVE-002, REQ-PERF-001 |
| ROAD P2 tasks: selection, animation idle/walk/sit/work, manager, Workstation/Pantry/Storage/Entrance, nameplate/activity | REQ-AVATAR-001, REQ-AVATAR-002, REQ-AVATAR-003, REQ-INT-001, REQ-INT-002, REQ-INT-003, REQ-INT-004, REQ-INT-005, REQ-UI-001 |
| ROAD P2 deliverable/acceptance: work/rest/furniture, sit/stand, correct transitions, computer/coffee, correct name/status | REQ-INT-002, REQ-INT-003, REQ-AVATAR-002, REQ-AVATAR-004, REQ-UI-001 |
| ROAD P3 tasks: Colyseus, room/employee schema, join/leave, movement/animation sync, disconnect, interpolation, list | REQ-NET-001, REQ-NET-002, REQ-NET-003, REQ-NET-004, REQ-NET-005, REQ-NET-006, REQ-NET-007, REQ-UI-002, REQ-UI-003 |
| ROAD P3 deliverable/acceptance: 3–10 mutual avatars, position/direction/animation, correct disconnect/no ghosts | REQ-NET-001, REQ-NET-002, REQ-NET-005 |
| ROAD P4 tasks: TV model/CSS3D/Object/IFrame API, curated catalog plus pasted YouTube URL (owner search deviation), controls, shared state/socket, embed errors | REQ-ROOM-008, REQ-TV-001, REQ-TV-002, REQ-TV-003, REQ-TV-004, REQ-TV-005, REQ-TV-007, REQ-TV-009, REQ-NET-008 |
| ROAD P4 deliverable/acceptance: one chooses/all watch, wall/screen placement, play/pause sync, allowed time drift, blocked embedding | REQ-TV-001, REQ-TV-003, REQ-TV-004, REQ-TV-006, REQ-TV-009 |
| ROAD P5 tasks: UI polish/loading/join/status/errors, asset optimization/profile/stress, frontend/backend deploy/production config | REQ-UI-004, REQ-UI-002, REQ-PERF-001, REQ-PERF-002, REQ-PERF-003, REQ-DEPLOY-001, REQ-DEPLOY-002, REQ-DEPLOY-003, REQ-DEPLOY-004 |
| ROAD P5 deliverable/acceptance: URL, office-code entry, 3–10, working core, no install, desktop | REQ-DEPLOY-001, REQ-DEPLOY-004, REQ-UI-002, REQ-NET-001 |
| DOD: URL access; name/code/avatar | REQ-DEPLOY-001, REQ-UI-002, REQ-AVATAR-001 |
| DOD: WASD; sit/work; at least one Pantry item | REQ-MOVE-001, REQ-INT-002, REQ-INT-003 |
| DOD: 3–10 total employees in room (lead interpretation of “other”); position/state over WebSocket | REQ-NET-001, REQ-NET-002, REQ-NET-008 |
| DOD: open TV/select embeddable YouTube; shared play/pause/seek | REQ-TV-003, REQ-TV-004, REQ-TV-006, REQ-TV-008 |
| DOD: frontend/backend internet deployment; unified enter/see/work/rest/entertain goal | REQ-DEPLOY-001, REQ-DEPLOY-004 |

## Open questions

These items require confirmation or implementation-time evidence. They are intentionally unresolved. Proposed owners: **Product owner** for experience/scope, **Technical lead** for implementation contracts/thresholds, with asset provenance, fixtures and test profiles routed to the **Technical lead**. References identify the affected requirements and the work or acceptance blocked; unrelated requirements can proceed.

| ID | Gap, ambiguity or conflict; decision/evidence needed | Affected requirements | Proposed owner |
|---|---|---|---|
| OQ-001 | DEC chooses approximately 10 x 8 m; ARCH says approximately 10 x 7 x 2.8 m. Confirm final floor dimensions and whether 2.8 m height still applies. Exact layout acceptance is pending; do not treat the photo's original approximately 6 x 8 m as the selected footprint. | REQ-ROOM-002 | Product owner / Technical lead |
| OQ-003 | “Good visual quality,” “ordinary desktop,” stable camera and UI polish lack an approval rubric/browser matrix. Specify hardware, browser/version, resolution, FPS sample method/window, whether >60 FPS is acceptable, loading budget if any, and whether render counters include CSS3D/avatars at ten players. | REQ-ROOM-001, REQ-UI-004, REQ-PERF-001, REQ-PERF-002, REQ-PERF-003, REQ-DEPLOY-004 | Product owner / Technical lead |
| OQ-007 | Camera spring constants, distance limits and clamp-versus-occlusion precedence remain unspecified. Supply camera tuning and deterministic expectations; movement speeds/reference frame/diagonals and capsule radius are resolved. | REQ-CAM-001 | Technical lead / Product owner |
| OQ-008 | How many preset avatars, which variants and which model/clip combinations ship? Selection must remain a preset set, but no exact count is sourced. | REQ-AVATAR-001 | Product owner / Technical lead |
| OQ-009 | Confirm UAL clip naming between Sitting_Enter/Idle/Exit and Sitting_Idle_Loop. Retarget acceptance is no-NaN clip playback plus manual screenshot alignment with a 0.45 m seat; no numeric error formulas or tolerances are pending. Fallback policy remains OQ-029. | REQ-AVATAR-002, REQ-AVATAR-003 | Technical lead |
| OQ-010 | EmployeeIdentity has online/working/away while activity includes many more states; away trigger/timer and activity-to-status mapping are absent. Define display and replicated representation without adding employee tracking/history. | REQ-UI-001, REQ-UI-002, REQ-NET-002 | Product owner / Technical lead |
| OQ-012 | TA assigns Settings UI without specifying settings. Confirm controls and error recovery copy; do not invent audio, graphics or privacy preferences as approved features. | REQ-UI-004 | Product owner |
| OQ-013 | Define interaction distance origin and cancellation behavior. Range 2.0 m, 90-degree facing cone and nearest-target priority are resolved defaults. | REQ-INT-001, REQ-NFR-005 | Technical lead / Product owner |
| OQ-014 | Define stand destination, invalid-seat recovery, computer interaction effect and remaining furniture-positioning tolerances. Eight desks, first-come exclusive seating and unavailable Sit with UI feedback when all desks are taken are resolved. | REQ-INT-002, REQ-NET-002 | Product owner / Technical lead |
| OQ-015 | Define Pantry action triggers, durations, completion/cancellation and cup representation without inferring consumables or inventory. Coffee core state and Entertainment-sofa rest using sit are mandatory and resolved. | REQ-INT-003, REQ-AVATAR-004 | Product owner |
| OQ-017 | Define movement/interpolation quality thresholds and network error budget. The reproducible test profile is resolved: 100 ms RTT, 1% loss, 10 min run, tunable in balance config. | REQ-NET-004, REQ-DEPLOY-004 | Technical lead |
| OQ-018 | Define retry cancellation, retained identity and detailed failure messaging through cold starts/restarts/expired tokens. Backoff 1/2/4/8 s then explicit Rejoin is resolved; reconnect remains bounded by the 20 s reservation. | REQ-NET-006, REQ-DEPLOY-002, REQ-UI-004 | Technical lead / Product owner |
| OQ-019 | localStorage/sessionStorage use is accepted, but behavior if storage is denied/unavailable or stale is unspecified. Confirm fallback and recovery without adding server persistence. | REQ-AVATAR-001, REQ-NET-005 | Technical lead / Product owner |
| OQ-020 | DEC references an agy floor-plan JSON and uncommitted spike retarget source. Confirm their exact availability/location and the handoff needed to port/extend them. The specification records these tasks but does not assume those artifacts are committed. | REQ-ROOM-002, REQ-AVATAR-003 | Technical lead |
| OQ-021 | Define catalog/config/static-metadata shape and empty/error outcomes. Curated catalog plus pasted YouTube URL, no live search and no Data API key are resolved. | REQ-TV-003, REQ-TV-007, REQ-TV-008, REQ-NET-008 | Technical lead / Product owner |
| OQ-022 | Define controllerSessionId handling when its employee leaves and video-ended behavior. Local-only close and shared Stop under existing authority are resolved; do not add a provider status enum value without approval. | REQ-TV-003, REQ-TV-004 | Product owner / Technical lead |
| OQ-023 | Define nudge rate/duration, clock synchronization, timestamp/currentTime units and late-join/paused/hidden-tab timing semantics. Drift under 1.0 s across clients after 5 s convergence is the resolved target, tunable in balance config. | REQ-TV-004, REQ-TV-006, REQ-DEPLOY-004 | Technical lead / Product owner |
| OQ-025 | DEC says embed-blocked handling was not validated; obtain a truly blocked, reproducible video fixture and define intended user recovery. Simulated error coverage cannot substitute for the outstanding real-player check. | REQ-TV-009 | Technical lead |
| OQ-026 | Define Unicode visible-character counting, rate-window/burst semantics and rejection feedback. Trimmed names of 1–20 visible characters, TV commands 5 per 10 s per client and joins 10 per minute per IP are resolved defaults, tunable in balance config. No chat rate limit is required. | REQ-NFR-004, REQ-NFR-005 | Technical lead |
| OQ-027 | Define production allowed-origin values. A single VITE_SERVER_URL deriving HTTP/WS endpoints is resolved (ARCH over TA). | REQ-DEPLOY-003 | Technical lead |
| OQ-029 | ARCH §7 suggests a Kenney/Mixamo-free alternative or procedural-pose fallback for missing sit/typing clips. DEC later requires Quaternius/UAL retargeting, composed typing/drinking, notes Mixamo is not CC0 and retains Kenney Mini Characters as fallback. Confirm the permitted fallback list under the CC0-only constraint before changing the selected asset approach. | REQ-AVATAR-001, REQ-AVATAR-002, REQ-AVATAR-003, REQ-NFR-003 | Product owner / Technical lead |

## Readiness and verification limits

This specification supplies implementation checks and source coverage, not implementation or PoC delivery evidence. Work can begin on the accepted stack, modular structure, five-zone asset inventory, core movement/collision, identity contract, room authority and CSS3D TV integration. Disputed layout dimensions, remaining interaction details and unresolved release rubrics remain conditional as identified above. The recorded owner and lead decisions resolve the covered scope and tuning questions. Final completion requires resolving the affected questions and recording the actual unit, Playwright and manual outcomes; uncovered PRD conflicts still require confirmation.
