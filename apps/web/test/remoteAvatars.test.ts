import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Activity } from '@office/protocol';
import type { EmployeeSource, ReplicatedEmployee } from '../src/net';
import { RemoteAvatars, type RemoteView } from '../src/game/remote/RemoteAvatars';
import { activityLabel } from '../src/game/hud/activityLabel';
import { cupRestSpot } from '../src/game/interaction/seats';

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
    reconnecting: false,
    disposed: false,
    bubble: null as string | null,
    set: (name: string, status: string, reconnecting = false) => {
      plate.text = [name, status];
      plate.reconnecting = reconnecting;
    },
    setBubble: (text: string | null) => {
      plate.bubble = text;
    },
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
    seatId: '',
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

  it('T-1698: draws each sender bubble on that remote nameplate and clears it', () => {
    const t = setup();
    t.source.add!('a', t.employee('Ann'));
    t.source.add!('b', t.employee('Bob'));
    t.remotes.update(0.016, new Map([['a', 'hello']]));
    expect(t.plates.map((p) => p.bubble)).toEqual(['hello', null]);
    expect(t.remotes.list().map((r) => r.bubble)).toEqual(['hello', null]);
    t.remotes.update(0.016);
    expect(t.plates.map((p) => p.bubble)).toEqual([null, null]);
  });

  it('T-1161: remote avatars cast no real shadow and draw one shared blob shadow', async () => {
    const t = setup();
    t.source.add!('a', t.employee('Ann'));
    t.source.add!('b', t.employee('Bo', 2));
    // The capsule shown while the model loads does not cast a shadow either.
    const casters = (root: THREE.Object3D) => {
      let n = 0;
      root.traverse((o) => (n += o.castShadow ? 1 : 0));
      return n;
    };
    expect(casters(t.scene)).toBe(0);
    const part = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    part.castShadow = true;
    t.loadView.mockImplementationOnce(async () => {
      const v = fakeView();
      v.root.add(part);
      t.views.push(v);
      return v;
    });
    t.source.add!('c', t.employee('Cy', 4));
    await Promise.resolve();
    await Promise.resolve();
    expect(part.castShadow).toBe(false);
    expect(casters(t.scene)).toBe(0);
    const blobs: THREE.Mesh[] = [];
    t.scene.traverse((o) => o.name === 'blob-shadow' && blobs.push(o as THREE.Mesh));
    expect(blobs).toHaveLength(3);
    expect(new Set(blobs.map((b) => b.geometry)).size).toBe(1);
    expect(new Set(blobs.map((b) => b.material)).size).toBe(1);
    t.source.removeHandler!('a');
    expect(t.scene.getObjectByName('remote:a')).toBeUndefined();
    // The shared blob geometry survives a remote leaving.
    expect(blobs[1]!.geometry.getAttribute('position')).toBeDefined();
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
    // The pose reports the render time it was sampled at (debug hook time base).
    expect(info!.sampledAt).toBe(200);
    expect(info!.activity).toBe('walking');
    expect(t.views[0]!.activities.at(-1)).toBe('walking');
    t.source.change(e, { activity: 'working' });
    t.remotes.update(0.016);
    expect(t.plates[0]!.text[1]).toBe(activityLabel('working'));
    t.source.change(e, { activity: 'bogus' });
    t.remotes.update(0.016);
    expect(t.remotes.list()[0]!.activity).toBe('idle');
  });

  it('draws a seated employee on the seat socket and never blends through furniture', async () => {
    const t = setup();
    const e = t.employee('Sam', 0.66);
    e.z = 2.3;
    t.source.add!('s', e);
    await Promise.resolve();
    await Promise.resolve();
    t.tick(50);
    t.source.change(e, { z: 2.4, activity: 'walking' });
    // The server seats Sam on ws_5 (socket 0.66, 1.2, rotY 90).
    t.tick(50);
    t.source.change(e, {
      x: 0.66,
      z: 1.2,
      heading: Math.PI / 2,
      activity: 'sitting',
      seatId: 'ws_5_seat',
    });
    t.remotes.update(0.016);
    let info = t.remotes.list()[0]!;
    // Placed on the socket at once, although render time is still 100 ms in the past.
    expect([info.x, info.z, info.heading]).toEqual([0.66, 1.2, Math.PI / 2]);
    expect(info).toMatchObject({ activity: 'sitting', seatId: 'ws_5_seat', sampledAt: null });
    expect(t.views[0]!.activities.at(-1)).toBe('sitting');
    t.source.change(e, { activity: 'working' });
    t.remotes.update(0.016);
    expect(t.views[0]!.activities.at(-1)).toBe('working');
    expect(t.plates[0]!.text[1]).toBe('Working');
    // Standing up: the server moves Sam to the stand point; the avatar jumps there.
    t.tick(50);
    t.source.change(e, { z: 2.46, activity: 'idle', seatId: '' });
    for (let i = 0; i < 4; i++) {
      t.remotes.update(0.016);
      info = t.remotes.list()[0]!;
      expect([info.x, info.z]).toEqual([0.66, 2.46]);
      t.tick(30);
    }
    expect(info).toMatchObject({ activity: 'idle', seatId: '' });
  });

  it('removes the avatar, nameplate and capsule resources when the employee leaves', async () => {
    const t = setup();
    const e = t.employee('Cy');
    t.source.add!('c', e);
    const group = t.scene.getObjectByName('remote:c')!;
    const capsule = group.children.filter(
      (o): o is THREE.Mesh => o instanceof THREE.Mesh && o.name !== 'blob-shadow',
    );
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

  it('shows a reconnecting marker while the employee is held (T-1051)', () => {
    const t = setup();
    const e = t.employee('Ann');
    e.activity = 'working';
    t.source.add!('a', e);
    t.remotes.update(0.016);
    expect(t.plates[0]!.text).toEqual(['Ann', 'Working']);
    t.source.change(e, { connected: false });
    t.remotes.update(0.016);
    expect(t.plates[0]!.text).toEqual(['Ann', 'Reconnecting…']);
    expect(t.plates[0]!.reconnecting).toBe(true);
    expect(t.remotes.list()[0]).toMatchObject({ connected: false, status: 'Reconnecting…' });
    t.source.change(e, { connected: true });
    t.remotes.update(0.016);
    expect(t.plates[0]!.text).toEqual(['Ann', 'Working']);
    expect(t.plates[0]!.reconnecting).toBe(false);
  });

  it('rebuilds every remote avatar from a resumed room (T-1051)', () => {
    const t = setup();
    t.source.add!('a', t.employee('Ann'));
    t.source.add!('b', t.employee('Bob'));
    expect(t.remotes.count).toBe(2);
    const next = new FakeSource();
    t.remotes.rebind(next);
    // The old source is unsubscribed and its avatars are gone until the new state arrives.
    expect(t.source.add).toBeUndefined();
    expect(t.remotes.count).toBe(0);
    expect(t.plates.every((p) => p.disposed)).toBe(true);
    next.add!('a', t.employee('Ann', 3));
    expect(t.remotes.count).toBe(1);
    expect(t.remotes.list()[0]).toMatchObject({ sessionId: 'a', x: 3 });
    expect(t.scene.getObjectByName('remote:b')).toBeUndefined();
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

describe('RemoteAvatars coffee (REQ-INT-003, T-1154)', () => {
  it('passes the held item with the seat rest spot to the view and lists item and sips', async () => {
    const t = setup();
    const held: [string, unknown][] = [];
    const seatedFlags: (boolean | undefined)[] = [];
    t.loadView.mockImplementationOnce(async () => {
      const v = fakeView();
      v.setActivity = (a, seated) => {
        v.activities.push(a);
        seatedFlags.push(seated);
      };
      Object.assign(v, {
        setHeld: (item: string, rest: unknown) => held.push([item, rest]),
        heldProp: { kind: 'cup', place: 'hand' },
      });
      t.views.push(v);
      return v;
    });
    const ann: Employee = { ...t.employee('Ann'), item: 'coffee', sips: 3 };
    t.source.add!('a', ann);
    await Promise.resolve();
    await Promise.resolve();
    t.remotes.update(0.016);
    expect(held.at(-1)).toEqual(['coffee', null]);
    expect(seatedFlags.at(-1)).toBe(false);
    expect(t.remotes.list()[0]).toMatchObject({
      item: 'coffee',
      sips: 3,
      prop: { kind: 'cup', place: 'hand' },
    });

    // Seated (also during a seated sip): the cup's rest spot comes from the seat.
    t.source.change(ann, { seatId: 'ws_7_seat', activity: 'drinking', sips: 2 });
    t.remotes.update(0.016);
    expect(seatedFlags.at(-1)).toBe(true);
    expect(held.at(-1)![1]).toEqual(cupRestSpot('ws_7_seat'));
    expect(t.remotes.list()[0]).toMatchObject({ activity: 'drinking', sips: 2 });

    t.source.change(ann, { item: '', sips: 0, activity: 'sitting' });
    t.remotes.update(0.016);
    expect(held.at(-1)![0]).toBe('');
    expect(t.remotes.list()[0]).toMatchObject({ item: '', sips: 0 });
  });

  it('reports a remote employee brewing (steam at the machine)', async () => {
    const t = setup();
    const ann = t.employee('Ann');
    t.source.add!('a', ann);
    t.remotes.update(0.016);
    expect(t.remotes.someoneBrewing()).toBe(false);
    t.source.change(ann, { activity: 'brewing' });
    t.remotes.update(0.016);
    expect(t.remotes.someoneBrewing()).toBe(true);
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
