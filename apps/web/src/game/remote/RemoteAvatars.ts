import * as THREE from 'three';
import { BALANCE, isAvatarId, type Activity, type AvatarId } from '@office/protocol';
import {
  InterpolationBuffer,
  renderTime,
  type EmployeeSource,
  type ReplicatedEmployee,
} from '../../net';
import { AvatarView, CLIP_FOR } from '../avatar/AvatarView';
import { Nameplate } from '../hud/Nameplate';
import { activityLabel } from '../hud/activityLabel';

/** The parts of `AvatarView` a remote avatar uses. */
export type RemoteView = {
  readonly root: THREE.Object3D;
  setActivity(activity: Activity): void;
  update(dt: number): void;
  dispose(): void;
};
/** The parts of `Nameplate` a remote avatar uses. */
export type RemoteNameplate = {
  readonly object: THREE.Object3D;
  set(name: string, status: string): void;
  dispose(): void;
};
export type RemoteAvatarsDeps = {
  /** Local clock in milliseconds; also stamps received snapshots. */
  now: () => number;
  loadView: (avatarId: AvatarId) => Promise<RemoteView>;
  createNameplate: () => RemoteNameplate;
};
/** Dev / e2e view of one remote avatar as currently drawn. */
export type RemoteInfo = {
  sessionId: string;
  name: string;
  avatarId: string;
  x: number;
  z: number;
  heading: number;
  activity: Activity;
  model: 'avatar' | 'capsule';
};

type Remote = {
  readonly employee: ReplicatedEmployee;
  readonly buffer: InterpolationBuffer;
  readonly group: THREE.Group;
  readonly capsule: THREE.Mesh[];
  readonly nameplate: RemoteNameplate;
  readonly unsubscribe: () => void;
  activity: Activity;
  view: RemoteView | null;
  disposed: boolean;
};

const DEFAULT_DEPS: RemoteAvatarsDeps = {
  now: () => performance.now(),
  loadView: (avatarId) => AvatarView.load(avatarId),
  createNameplate: () => new Nameplate(),
};

function toActivity(value: string): Activity {
  return Object.hasOwn(CLIP_FOR, value) ? (value as Activity) : 'idle';
}

/** Capsule shown until the avatar model loads, and kept if loading fails. */
function createCapsule(): THREE.Mesh[] {
  const r = BALANCE.movement.capsuleRadius;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(r, 1.7 - 2 * r, 4, 12),
    new THREE.MeshStandardMaterial({ color: '#3B9AE2' }),
  );
  body.position.y = 0.85;
  body.castShadow = true;
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.2),
    new THREE.MeshStandardMaterial({ color: '#222426' }),
  );
  nose.position.set(0, 1.5, r);
  return [body, nose];
}

function disposeMeshes(meshes: THREE.Mesh[]): void {
  for (const mesh of meshes) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
}

/**
 * REQ-NET-004, REQ-UI-001: one avatar plus nameplate per remote employee in the joined room.
 * Poses are sampled from a per-employee interpolation buffer 100 ms in the past
 * (`BALANCE.net.interpolationDelayMs`); the animation follows the replicated `activity`.
 * The local session is skipped (the local `Player` draws it).
 */
export class RemoteAvatars {
  private readonly remotes = new Map<string, Remote>();
  private readonly deps: RemoteAvatarsDeps;
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly parent: THREE.Object3D,
    private readonly source: EmployeeSource,
    private readonly localSessionId: string,
    deps: Partial<RemoteAvatarsDeps> = {},
  ) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
    this.unsubscribe = [
      source.onAdd((id, employee) => this.add(id, employee)),
      source.onRemove((id) => this.remove(id)),
    ];
  }

  get count(): number {
    return this.remotes.size;
  }

  private add(id: string, employee: ReplicatedEmployee): void {
    if (id === this.localSessionId) return;
    this.remove(id);
    const buffer = new InterpolationBuffer();
    const snapshot = () =>
      buffer.push({ t: this.deps.now(), x: employee.x, z: employee.z, heading: employee.heading });
    snapshot();
    const group = new THREE.Group();
    group.name = `remote:${id}`;
    const capsule = createCapsule();
    group.add(...capsule);
    const nameplate = this.deps.createNameplate();
    group.add(nameplate.object);
    const remote: Remote = {
      employee,
      buffer,
      group,
      capsule,
      nameplate,
      unsubscribe: this.source.onChange(employee, snapshot),
      activity: toActivity(employee.activity),
      view: null,
      disposed: false,
    };
    this.remotes.set(id, remote);
    this.place(remote, 0);
    this.parent.add(group);
    if (!isAvatarId(employee.avatarId)) return;
    this.deps
      .loadView(employee.avatarId)
      .then((view) => {
        if (remote.disposed) return view.dispose();
        disposeMeshes(remote.capsule);
        remote.capsule.length = 0;
        remote.view = view;
        group.add(view.root);
        view.setActivity(remote.activity);
      })
      .catch((error: unknown) =>
        console.warn(`Remote avatar ${employee.avatarId} failed; keeping capsule.`, error),
      );
  }

  private remove(id: string): void {
    const remote = this.remotes.get(id);
    if (!remote) return;
    this.remotes.delete(id);
    remote.disposed = true;
    remote.unsubscribe();
    remote.view?.dispose();
    remote.view = null;
    disposeMeshes(remote.capsule);
    remote.nameplate.dispose();
    remote.group.removeFromParent();
  }

  private place(remote: Remote, dt: number): void {
    const pose = remote.buffer.sample(renderTime(this.deps.now()));
    if (pose) {
      remote.group.position.set(pose.x, 0, pose.z);
      remote.group.rotation.y = pose.heading;
    }
    remote.activity = toActivity(remote.employee.activity);
    remote.view?.setActivity(remote.activity);
    remote.view?.update(dt);
    remote.nameplate.set(remote.employee.name, activityLabel(remote.activity));
  }

  /** Called once per rendered frame with the frame time in seconds. */
  update(dt: number): void {
    for (const remote of this.remotes.values()) this.place(remote, dt);
  }

  list(): RemoteInfo[] {
    return [...this.remotes].map(([sessionId, r]) => ({
      sessionId,
      name: r.employee.name,
      avatarId: r.employee.avatarId,
      x: r.group.position.x,
      z: r.group.position.z,
      heading: r.group.rotation.y,
      activity: r.activity,
      model: r.view ? 'avatar' : 'capsule',
    }));
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
    for (const id of [...this.remotes.keys()]) this.remove(id);
  }
}
