import { describe, expect, it } from 'vitest';
import { officeLayout } from '@office/protocol';
import type { EmployeeSource, ReplicatedEmployee } from '../src/net';
import { EmployeeRoster, type RosterEntry } from '../src/ui/employeeRoster';
import { entranceBoardPose, onlineBoardText } from '../src/game/hud/EntranceBoard';

type Employee = { -readonly [K in keyof ReplicatedEmployee]: ReplicatedEmployee[K] } & {
  connected?: boolean;
};

/** In-memory stand-in for the room's employee callbacks (supports several subscribers). */
class FakeSource implements EmployeeSource {
  private readonly employees = new Map<string, Employee>();
  private readonly adds = new Set<(id: string, e: ReplicatedEmployee) => void>();
  private readonly removes = new Set<(id: string) => void>();
  private readonly changes = new Map<ReplicatedEmployee, Set<() => void>>();
  onAdd(h: (id: string, e: ReplicatedEmployee) => void) {
    this.adds.add(h);
    for (const [id, e] of this.employees) h(id, e);
    return () => void this.adds.delete(h);
  }
  onRemove(h: (id: string) => void) {
    this.removes.add(h);
    return () => void this.removes.delete(h);
  }
  onChange(e: ReplicatedEmployee, h: () => void) {
    const set = this.changes.get(e) ?? new Set();
    set.add(h);
    this.changes.set(e, set);
    return () => void set.delete(h);
  }
  join(id: string, name: string, activity = 'idle'): Employee {
    const e: Employee = {
      name,
      avatarId: 'men_suit',
      x: 0,
      z: 0,
      heading: 0,
      activity,
      seatId: '',
    };
    this.employees.set(id, e);
    for (const h of this.adds) h(id, e);
    return e;
  }
  leave(id: string) {
    this.employees.delete(id);
    for (const h of this.removes) h(id);
  }
  /** One received patch that changed `e`. */
  patch(e: Employee, fields: Partial<Employee>) {
    Object.assign(e, fields);
    for (const h of this.changes.get(e) ?? []) h();
  }
  listenerCount() {
    return [...this.changes.values()].reduce((n, s) => n + s.size, 0);
  }
}

/**
 * Mirrors how `useSyncExternalStore` drives the panel: on every store notification React
 * reads the snapshot and re-renders only when its identity changed (Object.is).
 */
function renderCounter(roster: EmployeeRoster) {
  let last = roster.getSnapshot();
  const counter = { renders: 1, rows: last };
  roster.subscribe(() => {
    const next = roster.getSnapshot();
    if (Object.is(next, last)) return;
    last = next;
    counter.renders += 1;
    counter.rows = next;
  });
  return counter;
}

const rows = (entries: readonly RosterEntry[]) =>
  entries.map((e) => `${e.name}|${e.label}${e.isLocal ? '|you' : ''}`);

describe('EmployeeRoster', () => {
  it('lists every employee with the shared activity label, local player first and marked', () => {
    const source = new FakeSource();
    source.join('b', 'Bob', 'working');
    source.join('me', 'Zed');
    const roster = new EmployeeRoster(source, 'me');
    source.join('a', 'Alice', 'drinking');
    expect(rows(roster.getSnapshot())).toEqual(['Zed|Online|you', 'Alice|Break', 'Bob|Working']);
    expect(roster.count).toBe(3);
  });

  it('removes a leaving employee and lowers the count', () => {
    const source = new FakeSource();
    const roster = new EmployeeRoster(source, 'me');
    source.join('me', 'Me');
    source.join('a', 'Alice');
    source.leave('a');
    expect(rows(roster.getSnapshot())).toEqual(['Me|Online|you']);
    expect(roster.count).toBe(1);
    expect(source.listenerCount()).toBe(1);
  });

  it('keeps a markup-like name as the literal string', () => {
    const source = new FakeSource();
    const roster = new EmployeeRoster(source, 'me');
    source.join('a', '&lt;b&gt;Eve "x"');
    expect(roster.getSnapshot()[0]!.name).toBe('&lt;b&gt;Eve "x"');
  });

  it('does not re-render on frames where nothing in the list changed', () => {
    const source = new FakeSource();
    const roster = new EmployeeRoster(source, 'me');
    const counter = renderCounter(roster);
    const me = source.join('me', 'Me');
    const alice = source.join('a', 'Alice');
    expect(counter.renders).toBe(3);
    // 120 movement patches: position, heading, and activity changes with the same label.
    for (let frame = 0; frame < 120; frame++) {
      source.patch(alice, { x: frame * 0.05, heading: frame * 0.01 });
      source.patch(me, { z: -frame * 0.05, activity: frame % 2 ? 'walking' : 'idle' });
    }
    expect(counter.renders).toBe(3);
    // A label change, a join and a leave each re-render exactly once.
    source.patch(alice, { activity: 'working' });
    expect(counter.renders).toBe(4);
    expect(rows(counter.rows)).toContain('Alice|Working');
    source.patch(alice, { activity: 'working', x: 9 });
    expect(counter.renders).toBe(4);
    source.join('b', 'Bob');
    source.leave('b');
    expect(counter.renders).toBe(6);
    // A connection change re-renders too (reconnect reservation).
    source.patch(alice, { connected: false });
    expect(counter.renders).toBe(7);
    expect(counter.rows.find((e) => e.name === 'Alice')!.connected).toBe(false);
  });

  it('stops listening on dispose', () => {
    const source = new FakeSource();
    const roster = new EmployeeRoster(source, 'me');
    source.join('a', 'Alice');
    roster.dispose();
    source.join('b', 'Bob');
    expect(roster.count).toBe(1);
    expect(source.listenerCount()).toBe(0);
  });
});

describe('entrance board', () => {
  it('shows the online count', () => {
    expect(onlineBoardText(3)).toBe('Online: 3');
  });

  it('sits on the inner face of the entrance wall, inside the zone and clear of the door', () => {
    const pose = entranceBoardPose(officeLayout);
    const zone = officeLayout.zones.find((z) => z.id === 'Entrance')!.bounds;
    expect(pose.x).toBeGreaterThan(zone.minX);
    expect(pose.x).toBeLessThan(zone.maxX);
    const wall = officeLayout.walls.find((w) => w.id === 'wall_north_west')!;
    expect(pose.z).toBeCloseTo(wall.position[2] + wall.size[2] / 2 + 0.01, 6);
    expect(pose.y).toBeLessThan(officeLayout.room.height);
    const door = officeLayout.items.find((i) => i.id === 'main_door')!;
    expect(Math.abs(pose.x - door.position[0])).toBeGreaterThan(0.45 + door.size[0] / 2);
  });
});
