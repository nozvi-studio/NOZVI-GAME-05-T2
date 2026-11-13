import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Activity } from '@office/protocol';
import type { EmployeeSource, ReplicatedEmployee } from '../src/net';
import { RemoteAvatars, type RemoteView } from '../src/game/remote/RemoteAvatars';
import { activityLabel } from '../src/game/hud/activityLabel';

type Employee = { -readonly [K in keyof ReplicatedEmployee]: ReplicatedEmployee[K] };

/** In-memory stand-in for the room's employee callbacks. */
class FakeSource implements EmployeeSource {
  add: ((id: string, e: ReplicatedEmployee) => void) | undefined;
  removeHandler: ((id: string) => void) | undefined;
  changes = new Map<ReplicatedEmployee, () => void>();
  onAdd(h: (id: string, e: ReplicatedEmployee) => void) {
    this.add = h;
    return () => (this.add = undefined);
  }
  onRemove(h: (id: string) => void) {
    this.removeHandler = h;
    return () => (this.removeHandler = undefined);
  }
  onChange(e: ReplicatedEmployee, h: () => void) {
    this.changes.set(e, h);
    return () => this.changes.delete(e);
  }
  change(e: Employee, patch: Partial<Employee>) {
    Object.assign(e, patch);
    this.changes.get(e)?.();
  }
}

function fakeView() {
  const activities: Activity[] = [];
  const view: RemoteView & { activities: Activity[]; disposed: boolean } = {
    root: new THREE.Group(),
    activities,
    disposed: false,
    setActivity: (a) => activities.push(a),
    update: () => undefined,
    dispose: () => {
      view.disposed = true;
      view.root.removeFromParent();
    },
  };
  return view;
}

function fakeNameplate() {
  const plate = {
    object: new THREE.Object3D(),
    text: ['', ''] as [string, string],
    disposed: false,
    set: (name: string, status: string) => (plate.text = [name, status]),
    dispose: () => {
      plate.disposed = true;
      plate.object.removeFromParent();
    },
  };
  return plate;
}

function setup() {
  let now = 0;
  const source = new FakeSource();
  const scene = new THREE.Scene();
  const views: ReturnType<typeof fakeView>[] = [];
  const plates: ReturnType<typeof fakeNameplate>[] = [];
  const loadView = vi.fn(async () => {
    const v = fakeView();
    views.push(v);
    return v;
  });
  const remotes = new RemoteAvatars(scene, source, 'local', {
    now: () => now,
    loadView,
    createNameplate: () => {
      const p = fakeNameplate();
      plates.push(p);
      return p;
    },
  });
  const employee = (name: string, x = 0): Employee => ({
    name,
    avatarId: 'men_suit',
    x,
    z: 0,
    heading: 0,
    activity: 'idle',
  });
  return {
    source,
    scene,
    remotes,
    views,
    plates,
    loadView,
    employee,
    tick: (ms: number) => (now += ms),
  };
}

describe('RemoteAvatars (REQ-NET-004, REQ-UI-001)', () => {
  it('adds one avatar and nameplate per remote employee and skips the local session', async () => {
    const t = setup();
    t.source.add!('local', t.employee('Me'));
    t.source.add!('a', t.employee('Ann <b>x</b>', 2));
    await Promise.resolve();
    await Promise.resolve();
    expect(t.remotes.count).toBe(1);
    expect(t.loadView).toHaveBeenCalledTimes(1);
    t.remotes.update(0.016);
    expect(t.plates[0]!.text).toEqual(['Ann <b>x</b>', 'Online']);
    const [info] = t.remotes.list();
    expect(info).toMatchObject({ sessionId: 'a', name: 'Ann <b>x</b>', x: 2, model: 'avatar' });
    expect(t.scene.getObjectByName('remote:a')).toBeDefined();
  });

  it('places the avatar from the interpolation sample and animates from activity', async () => {
    const t = setup();
    const e = t.employee('Bo');
    t.source.add!('b', e);
    await Promise.resolve();
    await Promise.resolve();
    for (let i = 1; i <= 6; i++) {
      t.tick(50);
      t.source.change(e, { x: i * 0.2, heading: 0.1 * i, activity: 'walking' });
    }
    // now = 300 ms: render time 200 ms -> fourth snapshot (x = 0.8).
    t.remotes.update(0.016);
    const [info] = t.remotes.list();
    expect(info!.x).toBeCloseTo(0.8, 9);
    expect(info!.heading).toBeCloseTo(0.4, 9);
    expect(info!.activity).toBe('walking');
    expect(t.views[0]!.activities.at(-1)).toBe('walking');
    t.source.change(e, { activity: 'working' });
    t.remotes.update(0.016);
    expect(t.plates[0]!.text[1]).toBe(activityLabel('working'));
    t.source.change(e, { activity: 'bogus' });
    t.remotes.update(0.016);
    expect(t.remotes.list()[0]!.activity).toBe('idle');
  });

  it('removes the avatar, nameplate and capsule resources when the employee leaves', async () => {
    const t = setup();
    const e = t.employee('Cy');
    t.source.add!('c', e);
    const group = t.scene.getObjectByName('remote:c')!;
    const capsule = group.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    expect(capsule).toHaveLength(2);
    const geometrySpies = capsule.map((m) => vi.spyOn(m.geometry, 'dispose'));
    const materialSpies = capsule.map((m) => vi.spyOn(m.material as THREE.Material, 'dispose'));
    await Promise.resolve();
    await Promise.resolve();
    // The loaded model replaced the capsule, which is freed at once.
    for (const spy of [...geometrySpies, ...materialSpies]) expect(spy).toHaveBeenCalledTimes(1);
    t.source.removeHandler!('c');
    expect(t.remotes.count).toBe(0);
    expect(t.scene.getObjectByName('remote:c')).toBeUndefined();
    expect(t.views[0]!.disposed).toBe(true);
    expect(t.plates[0]!.disposed).toBe(true);
    expect(t.source.changes.has(e)).toBe(false);
  });

  it('disposes a model that finishes loading after its employee left', async () => {
    const t = setup();
    t.source.add!('d', t.employee('Di'));
    t.source.removeHandler!('d');
    await Promise.resolve();
    await Promise.resolve();
    expect(t.views[0]!.disposed).toBe(true);
    expect(t.scene.children.some((o) => o.name === 'remote:d')).toBe(false);
  });

  it('keeps the capsule when the model fails to load', async () => {
    const t = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    t.loadView.mockRejectedValueOnce(new Error('404'));
    t.source.add!('e', t.employee('Ed'));
    await new Promise((r) => setTimeout(r, 0));
    expect(t.remotes.list()[0]!.model).toBe('capsule');
    t.remotes.dispose();
    expect(t.remotes.count).toBe(0);
    expect(t.source.add).toBeUndefined();
  });
});

describe('activityLabel', () => {
  it('maps activities to the nameplate status the local player uses', () => {
    expect(activityLabel('working')).toBe('Working');
    expect(activityLabel('drinking')).toBe('Break');
    expect(activityLabel('resting')).toBe('Resting');
    for (const a of ['idle', 'walking', 'sitting', 'waving'] as const) {
      expect(activityLabel(a)).toBe('Online');
    }
  });
});
