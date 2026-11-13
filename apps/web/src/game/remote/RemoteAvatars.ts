import * as THREE from 'three';
import { BALANCE, isAvatarId, type Activity, type AvatarId } from '@office/protocol';
import {
  InterpolationBuffer,
  renderTime,
  type EmployeeSource,
  type ReplicatedEmployee,
} from '../../net';
import { AvatarView, CLIP_FOR } from '../avatar/AvatarView';
import { seatPose, seatSocket } from '../interaction/seats';
import { Nameplate } from '../hud/Nameplate';
import { presenceLabel } from '../hud/activityLabel';

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
  set(name: string, status: string, reconnecting?: boolean): void;
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
  seatId: string;
  model: 'avatar' | 'capsule';
  /** False while the server holds this employee's reconnect reservation. */
  connected: boolean;
  /** The nameplate status text as drawn. */
  status: string;
};

type Remote = {
  readonly employee: ReplicatedEmployee;
  readonly buffer: InterpolationBuffer;
  readonly group: THREE.Group;
  readonly capsule: THREE.Mesh[];
  readonly nameplate: RemoteNameplate;
  readonly unsubscribe: () => void;
  activity: Activity;
  status: string;
  /** The seat seen in the last snapshot; a change restarts interpolation. */
  seatId: string;
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
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly parent: THREE.Object3D,
    private source: EmployeeSource,
    private readonly localSessionId: string,
    deps: Partial<RemoteAvatarsDeps> = {},
  ) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
    this.bind(source);
  }

  /**
   * REQ-NET-005: after a reconnect the room handle is new. Every remote avatar is rebuilt
   * from its full state, so nobody who left during the drop stays behind.
   */
  rebind(source: EmployeeSource): void {
    this.unbind();
    this.source = source;
    this.bind(source);
  }

  private bind(source: EmployeeSource): void {
    this.unsubscribe = [
      source.onAdd((id, employee) => this.add(id, employee)),
      source.onRemove((id) => this.remove(id)),
    ];
  }

  private unbind(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
    for (const id of [...this.remotes.keys()]) this.remove(id);
  }

  get count(): number {
    return this.remotes.size;
  }

  private add(id: string, employee: ReplicatedEmployee): void {
    if (id === this.localSessionId) return;
    this.remove(id);
    const buffer = new InterpolationBuffer();
    let seatId = employee.seatId;
    const snapshot = () => {
      const s = { t: this.deps.now(), x: employee.x, z: employee.z, heading: employee.heading };
      // Sitting down or standing up is a jump on the server: never blend through furniture.
      if (employee.seatId !== seatId) buffer.reset(s);
      else buffer.push(s);
      seatId = employee.seatId;
      remote.seatId = seatId;
    };
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
      status: '',
      seatId,
      view: null,
      disposed: false,
    };
    snapshot();
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
    // REQ-INT-002: a seated employee sits on the socket with the seated animation; the
    // interpolated position (100 ms behind) would still be walking toward the chair.
    const socket = seatSocket(remote.employee.seatId);
    const pose = socket ? seatPose(socket) : remote.buffer.sample(renderTime(this.deps.now()));
    if (pose) {
      remote.group.position.set(pose.x, 0, pose.z);
      remote.group.rotation.y = pose.heading;
    }
    remote.activity = toActivity(remote.employee.activity);
    remote.view?.setActivity(remote.activity);
    remote.view?.update(dt);
    const reconnecting = remote.employee.connected === false;
    remote.status = presenceLabel(remote.activity, remote.employee.connected);
    remote.nameplate.set(remote.employee.name, remote.status, reconnecting);
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
      seatId: r.seatId,
      model: r.view ? 'avatar' : 'capsule',
      connected: r.employee.connected !== false,
      status: r.status,
    }));
  }

  dispose(): void {
    this.unbind();
  }
}
