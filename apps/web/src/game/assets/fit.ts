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
