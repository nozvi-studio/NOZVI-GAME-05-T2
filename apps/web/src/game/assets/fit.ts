/**
 * Office improvement 2026-11-20 (T-1152 review): one scale on all axes, the largest that keeps
 * the model inside the box, so small props keep their proportions (the mouse was stretched
 * to the layout box's footprint).
 */
export function containScale(
  model: [number, number, number],
  target: [number, number, number],
): [number, number, number] {
  const ratios = [0, 1, 2].filter((i) => model[i]! > 1e-6).map((i) => target[i]! / model[i]!);
  const s = ratios.length > 0 ? Math.min(...ratios) : 1;
  return [s, s, s];
}

export function fitScale(
  model: [number, number, number],
  target: [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map((i) => (model[i]! > 1e-6 ? target[i]! / model[i]! : 1)) as [
    number,
    number,
    number,
  ];
}
