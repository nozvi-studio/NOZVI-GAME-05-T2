import { describe, expect, it } from 'vitest';
import { officeLayout, parseLayout } from '../src/layout/layout';

describe('officeLayout', () => {
  it('has the 10 x 8 x 2.7 m room', () => {
    expect(officeLayout.room).toEqual({ width: 10, depth: 8, height: 2.7 });
  });
  it('has eight workstations with seat sockets', () => {
    expect(officeLayout.workstations).toHaveLength(8);
    for (const ws of officeLayout.workstations) expect(ws.seat.position).toHaveLength(3);
  });
  it('exposes collider footprints including walls', () => {
    expect(officeLayout.colliders.some((c) => c.kind === 'wall')).toBe(true);
    expect(officeLayout.colliders.every((c) => c.w > 0 && c.d > 0)).toBe(true);
  });
  it('places spawn in the Entrance zone', () => {
    expect(officeLayout.spawn.zone).toBe('Entrance');
  });
  it('rejects malformed data', () => {
    expect(() => parseLayout({})).toThrow(/layout/i);
  });
});
