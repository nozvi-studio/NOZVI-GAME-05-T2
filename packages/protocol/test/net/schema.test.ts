import { describe, expect, it } from 'vitest';
import { Decoder, Encoder } from '@colyseus/schema';
import { EmployeeState, OfficeState } from '../../src/net/schema';

describe('net schema', () => {
  it('has the documented defaults', () => {
    const e = new EmployeeState();
    expect(e.activity).toBe('idle');
    expect(e.seatId).toBe('');
    expect(e.connected).toBe(true);
    expect(e.lastSeq).toBe(0);
  });
  it('round-trips an employee through the encoder with exact float64 positions', () => {
    const state = new OfficeState();
    const e = new EmployeeState();
    Object.assign(e, {
      name: 'An',
      avatarId: 'men_suit',
      x: 0.1 + 0.2,
      z: -3.3333333333333335,
      heading: Math.PI / 3,
      lastSeq: 42,
    });
    state.employees.set('s1', e);
    const encoder = new Encoder(state);
    const decoded = new OfficeState();
    new Decoder(decoded).decode(encoder.encodeAll());
    const d = decoded.employees.get('s1')!;
    expect(d.name).toBe('An');
    expect(Object.is(d.x, 0.1 + 0.2)).toBe(true);
    expect(Object.is(d.z, -3.3333333333333335)).toBe(true);
    expect(d.heading).toBe(Math.PI / 3);
    expect(d.lastSeq).toBe(42);
    expect(d.connected).toBe(true);
  });
});
