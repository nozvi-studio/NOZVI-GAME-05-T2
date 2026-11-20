import raw from './office-decor.json';
import { officeLayout, type LayoutBox, type OfficeLayout, type Vec3 } from './layout';

/** T-1158: one decorative model; `model` is relative to the web app's `/assets/`. */
export type DecorItem = {
  id: string;
  model: string;
  position: Vec3;
  size: Vec3;
  rotY: number;
  /** Layout item whose palette box this decor replaces (the pantry counter). */
  replaces?: string;
};
export type WallClock = { id: string; position: Vec3; radius: number; depth: number; wall: string };
export type OfficeDecor = { items: DecorItem[]; clock: WallClock };

/** A decor entry as written in `office-decor.json`: its own box, or `at` a layout component. */
type RawDecorItem = {
  id: string;
  model: string;
  replaces?: string;
} & ({ at: string } | { position: number[]; size: number[]; rotY: number });

/** Every layout item and component box, by id. */
function layoutBoxes(layout: OfficeLayout): Map<string, LayoutBox> {
  const boxes = new Map<string, LayoutBox>();
  for (const item of layout.items) {
    boxes.set(item.id, item);
    for (const c of item.components ?? []) boxes.set(c.id, c);
  }
  return boxes;
}

/**
 * Resolves decor entries. T-1158 review 2026-11-20: an entry with `at` takes the box of that
 * layout component, so the drawn coffee machine and cabinets move with the layout data the
 * interaction point uses (one source of truth). An unknown `at` id throws.
 */
export function resolveDecor(items: readonly RawDecorItem[], layout: OfficeLayout): DecorItem[] {
  const boxes = layoutBoxes(layout);
  return items.map((i) => {
    const { id, model, replaces } = i;
    const base = { id, model, ...(replaces ? { replaces } : {}) };
    if ('at' in i) {
      const box = boxes.get(i.at);
      if (!box) throw new Error(`office-decor: ${id} is at unknown layout id ${i.at}`);
      return { ...base, position: box.position, size: box.size, rotY: box.rotY ?? 0 };
    }
    return { ...base, position: i.position as Vec3, size: i.size as Vec3, rotY: i.rotY };
  });
}

/** Decoration only: no colliders, no interactables (plan §3.2, T-1158). */
export const officeDecor: OfficeDecor = {
  items: resolveDecor(raw.items as RawDecorItem[], officeLayout),
  clock: { ...raw.clock, position: raw.clock.position as Vec3 },
};
