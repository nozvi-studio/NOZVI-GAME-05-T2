# Procedural office layout

`packages/protocol/src/layout/office-layout.json` is the authoritative placement data for this room. Run
`node docs/layout/validate-layout.mjs` from the repository root (Node only, no
dependencies). An optional first argument selects another JSON file for validation.

Coordinates are meters, with origin at floor center, +X east, +Z south and +Y up.
Positions and sizes use `[X, Y, Z]`; transforms use center positions. Sizes are
**world-axis extents**, already accounting for orientation. `rotY` is degrees:
0 faces south (+Z), 90 east, 180 north and 270 west. AABBs use center `x, z` and
full width `w` / depth `d`. Rectangles may share edges, but not interior area.

The supplied `layout-6x8.md` photo reconstruction was widened from 6 to 10 m
along X; depth remains 8 m and height remains 2.7 m, as explicitly requested
for this task. Furniture was translated and repacked rather than stretched.
The window span grows from 5.6 to 9.6 m. The photo's overlapping zone estimates
become five distinct rectangles: Entertainment at the north-west wall, Entrance
and Pantry across the north, Storage at the north-east, and Workstation across
the south half. Both pods move south and apart to use the available floor area.
The east refreshment counter moves into the north Pantry to keep that zone a
single rectangle. Desk spacing and chair offsets are corrected to avoid the
source plan's overlapping footprints. Two west/east four-desk pods retain
their north/south pairs and opposing east/west seat directions. Their desk rows
have a 0.9 m gap; the central gap between facing pod chairs is 1.5 m. The sofa
and coffee table have a 0.75 m gap. Storage moves north of the eastern pod;
the utility door and AC move farther south along the east wall. The entrance
door shifts 0.1 m east; the spawn position stays unchanged.

- Kept: exactly eight desks and green chairs, north main entrance and original
  spawn, south window/blinds wall, west wall TV, north pantry/fridge/cabinets,
  east utility door and AC, shoe rack, intercom, breaker box, and every palette hex.
- Added or made explicit: sofa with two rest/relax seat sockets (replacing the
  extra TV-viewing office chair), coffee table, two speakers, decorative light,
  coffee machine, cups, Storage cabinets, visual-only lockers, shelves, boxes,
  personal decorations, Entrance plants/frame/signage, workstation equipment
  and decorations, shell lighting, interaction approaches and collision data.

Each `items` entry is a furniture assembly with one collider covering its full
2D projection. Mounted equipment and decorations in `components` share that
collider: monitors share their desk, coffee machine/cups/cabinets share their
counter assembly, and door/frame/sign/intercom/breaker share one entrance
assembly. Speakers mount beside the TV in its wall assembly; boxes and personal
decorations sit on the shelves. This avoids
duplicate overlapping collision shapes for stacked assets. All components have
explicit world transforms and remain within the assembly footprint and zone.
Shell floor, ceiling, windows, lights and walls are shared room elements rather
than zoned furniture; windows share their containing wall collider.

Workstation desk transforms and seat references mirror their item definitions;
the validator rejects disagreement. Seat sockets lie on their furniture at
0.45 m height and are alignment destinations for seated animation. Their floor
interaction points are separate, collision-free standing approaches. Door
opening and cabinet opening are local decoration; collision stays fixed, and
main-door interaction returns to the join screen. Lockers have no interactions.

Validation covers dimensions, palette, required assets, five disjoint zones,
room/zone extents, references, seats, eight workstations in two pods, every
furniture/wall collider, overlap and clearance. Spawn has at least 0.6 m from
all footprints; approaches have at least 0.3 m. A 0.1 m four-neighbor flood
search from spawn checks every approach using conservatively inflated AABBs
and continuous segment checks, including connections to off-grid endpoints.
This proves a route for a 0.3 m capsule in the static layout; it does not test
the future movement solver, rendering, animation, or multiplayer occupancy.

Circulation gaps between exposed furniture assemblies must be at least 0.9 m,
including diagonal corner gaps. A workstation's own desk/chair pair is exempt;
sofa/coffee-table clearance must be at least 0.6 m (`coffeeTableId` names the
sofa's associated table). Touching back-to-back desks
in one pod form a solid seam, not an aisle. For other pairs the validator samples
nearest cross-sections, split at intervening furniture edges. A cross-section
blocked by a third assembly does not describe a circulation gap between that
pair. Recesses inside the walls' 0.3 m avatar exclusion strip also are not paths.
These classifications are geometric, with no manually excluded furniture IDs.
All furniture still participates in overlap and grid reachability checks.
Every interactable, workstation and seat socket approach must connect to spawn;
the 0.1 m grid spacing is enforced. Sofa seats must face the TV and have a clear
3D sightline from a seated eye 0.8 m above the seat to the screen center.
