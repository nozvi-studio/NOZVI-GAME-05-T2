import { expect, it } from 'vitest';
import { SeatRegistry } from '../src/seats';

it('claims first-come and releases', () => {
  const seats = new SeatRegistry();
  expect(seats.claim('ws_1_seat', 'a')).toBe(true);
  expect(seats.claim('ws_1_seat', 'b')).toBe(false);
  expect(seats.occupant('ws_1_seat')).toBe('a');
  expect(seats.claim('ws_2_seat', 'a')).toBe(false); // one seat per owner
  expect(seats.release('a')).toBe('ws_1_seat');
  expect(seats.claim('ws_1_seat', 'b')).toBe(true);
  expect(seats.seatOf('b')).toBe('ws_1_seat');
});
