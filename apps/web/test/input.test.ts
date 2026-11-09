import { expect, it } from 'vitest';
import { toMoveInput } from '../src/game/input';

it('maps WASD and shift', () => {
  expect(toMoveInput(new Set(['KeyW']))).toEqual({ forward: 1, right: 0, run: false });
  expect(toMoveInput(new Set(['KeyS', 'KeyD', 'ShiftLeft']))).toEqual({
    forward: -1,
    right: 1,
    run: true,
  });
  expect(toMoveInput(new Set(['KeyA', 'KeyD']))).toEqual({ forward: 0, right: 0, run: false });
  expect(toMoveInput(new Set(['Space']))).toEqual({ forward: 0, right: 0, run: false });
});
