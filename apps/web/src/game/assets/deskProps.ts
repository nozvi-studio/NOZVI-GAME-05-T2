import type { LayoutBox, OfficeLayout } from '@office/protocol';
import { DESK_SCREEN, FURNITURE_PROPS } from './furnitureManifest';
import type { FurniturePlacement } from './loadFurniture';

/** The six desk prop types every workstation desk lists in the layout (plan §3.3, T-1152). */
export const DESK_PROP_TYPES = [
  'computer',
  'keyboard',
  'mouse',
  'desk_lamp',
  'stationery',
  'decorative_object',
] as const;
export type DeskPropType = (typeof DESK_PROP_TYPES)[number];

/** Lamps alternate by desk index. */
const LAMPS = [FURNITURE_PROPS.lampSquareTable, FURNITURE_PROPS.lampRoundTable];
/** Decorative objects cycle by desk index (owner-approved Kenney list, DECISIONS 2026-11-17). */
const DECOR = [
  FURNITURE_PROPS.plantSmall1,
  FURNITURE_PROPS.bear,
  FURNITURE_PROPS.plantSmall2,
  FURNITURE_PROPS.radio,
  FURNITURE_PROPS.plantSmall3,
  FURNITURE_PROPS.speakerSmall,
];

/** One desk prop: the layout component, the model drawn for it and the desk it sits on. */
export type DeskProp = {
  deskId: string;
  /** 0-based position of the desk in layout order. */
  deskIndex: number;
  type: DeskPropType;
  placement: FurniturePlacement;
};

function isPropType(type: string): type is DeskPropType {
  return (DESK_PROP_TYPES as readonly string[]).includes(type);
}

/** The model file and rotation for one prop; stationery and decor vary by desk index. */
function modelFor(type: DeskPropType, index: number, rotY: number): { file: string; rotY: number } {
  switch (type) {
    case 'computer':
      return { file: DESK_SCREEN, rotY };
    case 'keyboard':
      return { file: FURNITURE_PROPS.keyboard, rotY };
    case 'mouse':
      return { file: FURNITURE_PROPS.mouse, rotY };
    case 'desk_lamp':
      return { file: LAMPS[index % LAMPS.length]!, rotY };
    case 'stationery':
      // One book stack per desk, turned by a quarter per desk so neighbours differ.
      return { file: FURNITURE_PROPS.books, rotY: rotY + (index % 4) * 90 };
    case 'decorative_object':
      return { file: DECOR[index % DECOR.length]!, rotY };
  }
}

/**
 * Owner report 2026-11-18: the screen faced away from the chair. Kenney models face +Z at
 * rotY 0 (the chairs prove it: seat rotY 90 faces +X, toward the desk), but the layout's
 * component rotY for the screen equals the seat's. Screen, keyboard and mouse therefore face
 * the seat: seat rotY + 180°.
 */
const FACES_SEAT: ReadonlySet<DeskPropType> = new Set(['computer', 'keyboard', 'mouse']);

/** Office improvement 2026-11-20 (T-1152 review): props whose model must not be stretched. */
const CONTAIN: ReadonlySet<DeskPropType> = new Set(['mouse', 'stationery']);

/**
 * T-1152: every desk prop listed under a desk's `components` in the layout, resolved to a
 * model and a fitted box. Deterministic: the same layout always gives the same props. Props
 * have no palette box in the room, so their placements are `standalone`.
 */
export function deskProps(layout: OfficeLayout): DeskProp[] {
  const desks = layout.items.filter((item) => item.type === 'desk');
  const seatRotY = new Map(layout.workstations.map((ws) => [`${ws.id}_desk`, ws.seat.rotY]));
  return desks.flatMap((desk, deskIndex) =>
    (desk.components ?? []).flatMap((component: LayoutBox) => {
      if (!isPropType(component.type)) return [];
      const seat = seatRotY.get(desk.id);
      const rotY =
        FACES_SEAT.has(component.type) && seat !== undefined
          ? (seat + 180) % 360
          : (component.rotY ?? 0);
      const model = modelFor(component.type, deskIndex, rotY);
      return [
        {
          deskId: desk.id,
          deskIndex,
          type: component.type,
          placement: {
            box: component,
            file: model.file,
            rotY: model.rotY,
            standalone: true,
            // The mouse and the books keep their proportions inside their layout box.
            ...(CONTAIN.has(component.type) ? { contain: true } : {}),
          },
        },
      ];
    }),
  );
}
