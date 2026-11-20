import * as THREE from 'three';
import {
  BALANCE,
  isAvatarId,
  toEmote,
  toItem,
  type Activity,
  type AvatarId,
  type EmoteId,
  type Item,
  type Vec3,
} from '@office/protocol';
import {
  InterpolationBuffer,
  InterpolationDelay,
  renderTime,
  type EmployeeSource,
  type ReplicatedEmployee,
} from '../../net';
import { AvatarView, CLIP_FOR } from '../avatar/AvatarView';
import { createBlobShadow } from '../avatar/blobShadow';
import { cupRestSpot, seatPose, seatSocket, type SeatKind } from '../interaction/seats';
import type { PropState } from '../avatar/HeldProp';
import { Nameplate } from '../hud/Nameplate';
import { presenceLabel } from '../hud/activityLabel';

/** The parts of `AvatarView` a remote avatar uses. */
export type RemoteView = {
  readonly root: THREE.Object3D;
  /** `seated`: on a seat, also during a seated sip (T-1154). */
  setActivity(activity: Activity, seated?: boolean): void;
  /** Optional so test fakes stay small; `AvatarView` implements it (T-1614). */
  setSeat?(kind: SeatKind | null): void;
  /** Optional so test fakes stay small; `AvatarView` implements it (T-1154). */
  setHeld?(item: Item, restSpot: Vec3 | null): void;
  readonly heldProp?: PropState | null;
  /** Optional so test fakes stay small; `AvatarView` implements it (T-1222). */
  setEmote?(emote: EmoteId | ''): void;
  update(dt: number): void;
  dispose(): void;
  /** Typing overlay weight, 0 to 1 (T-1219). */
  readonly typing?: number;
  /** Make-coffee overlay weight, 0 to 1 (T-1611). */
  readonly brew?: number;
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
  /** Typing overlay weight as drawn, 0 to 1 (T-1219). */
  typing: number;
  /** Make-coffee overlay weight as drawn, 0 to 1 (T-1611). */
  brew: number;
  /** Emote as drawn ('' = none; T-1222). */
  emote: EmoteId | '';
  /** Replicated held item and sips (REQ-INT-003, T-1154). */
  item: Item;
  sips: number;
  /** The cup or glass as drawn and where (hand, or desk / table), null when none. */
  prop: PropState | null;
  /**
   * The interpolation time (ms, `performance.now` base minus the delay) the drawn pose was
   * sampled at, or null before the first sample or while seated. Lets e2e measure speed on
   * the same time base the avatar is drawn with.
   */
  sampledAt: number | null;
};

type Remote = {
  readonly employee: ReplicatedEmployee;
  readonly buffer: InterpolationBuffer;
  readonly group: THREE.Group;
  readonly capsule: THREE.Mesh[];
  readonly nameplate: RemoteNameplate;
  readonly unsubscribe: () => void;
  activity: Activity;
  emote: EmoteId | '';
  status: string;
  /** The seat seen in the last snapshot; a change restarts interpolation. */
  seatId: string;
  view: RemoteView | null;
  disposed: boolean;
  sampledAt: number | null;
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
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.2),
    new THREE.MeshStandardMaterial({ color: '#222426' }),
  );
  nose.position.set(0, 1.5, r);
  return [body, nose];
}

export { createBlobShadow };

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
  /** T-1377: interpolation delay adapted to the frame time, and this frame's clock reading. */
  private readonly delay = new InterpolationDelay();
  private delayMs: number = BALANCE.net.interpolationDelayMs;
  private renderNow = 0;

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
      // T-1377: bunched patches may be spaced as far ahead as the current delay allows.
      else buffer.push(s, this.delayMs);
      seatId = employee.seatId;
      remote.seatId = seatId;
    };
    const group = new THREE.Group();
    group.name = `remote:${id}`;
    const capsule = createCapsule();
    group.add(...capsule);
    const nameplate = this.deps.createNameplate();
    group.add(nameplate.object, createBlobShadow());
    const remote: Remote = {
      employee,
      buffer,
      group,
      capsule,
      nameplate,
      unsubscribe: this.source.onChange(employee, snapshot),
      activity: toActivity(employee.activity),
      emote: toEmote(employee.emote ?? ''),
      status: '',
      seatId,
      view: null,
      disposed: false,
      sampledAt: null,
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
        view.root.traverse((o) => (o.castShadow = false));
        group.add(view.root);
        const socket = seatSocket(remote.employee.seatId);
        view.setSeat?.(socket?.kind ?? null);
        view.setActivity(remote.activity, socket !== null);
        view.setEmote?.(remote.emote);
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
    const t = renderTime(this.renderNow, this.delayMs);
    const pose = socket ? seatPose(socket) : remote.buffer.sample(t);
    remote.sampledAt = pose && !socket ? t : null;
    if (pose) {
      remote.group.position.set(pose.x, 0, pose.z);
      remote.group.rotation.y = pose.heading;
    }
    remote.activity = toActivity(remote.employee.activity);
    remote.emote = toEmote(remote.employee.emote ?? '');
    remote.view?.setSeat?.(socket?.kind ?? null);
    remote.view?.setActivity(remote.activity, socket !== null);
    remote.view?.setEmote?.(remote.emote);
    remote.view?.setHeld?.(
      toItem(remote.employee.item ?? ''),
      socket ? cupRestSpot(remote.employee.seatId) : null,
    );
    remote.view?.update(dt);
    const reconnecting = remote.employee.connected === false;
    remote.status = presenceLabel(remote.activity, remote.employee.connected);
    remote.nameplate.set(remote.employee.name, remote.status, reconnecting);
  }

  /** Called once per rendered frame with the frame time in seconds. */
  update(dt: number): void {
    // T-1377: one delay for every remote, adapted to the frame time.
    this.renderNow = this.deps.now();
    this.delayMs = this.delay.update(this.renderNow);
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
      typing: r.view?.typing ?? 0,
      brew: r.view?.brew ?? 0,
      emote: r.emote,
      item: toItem(r.employee.item ?? ''),
      sips: toItem(r.employee.item ?? '') === '' ? 0 : (r.employee.sips ?? 0),
      prop: r.view?.heldProp ?? null,
      sampledAt: r.sampledAt,
    }));
  }

  /** True while any remote employee is brewing at the coffee machine (steam, T-1154). */
  someoneBrewing(): boolean {
    for (const remote of this.remotes.values()) if (remote.activity === 'brewing') return true;
    return false;
  }

  dispose(): void {
    this.unbind();
  }
}
