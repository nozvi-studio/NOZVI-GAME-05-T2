import * as THREE from 'three';
import {
  BALANCE,
  officeLayout,
  toEmote,
  toItem,
  type Activity,
  type EmoteId,
  type Item,
  type MoveInput,
  type PlayerState,
} from '@office/protocol';
import { AvatarView } from './avatar/AvatarView';
import { createBlobShadow } from './avatar/blobShadow';
import { Predictor } from '../net/prediction';
import type { LocalSnapshot } from '../net/localSync';
import { cupRestSpot, seatPose, seatSocket, toActivity } from './interaction/seats';
import type { PropState } from './avatar/HeldProp';

/**
 * The local activity to show: seat and break activities only as the server reports them;
 * walking and idle follow local movement at once (moving always ends a break on the server).
 */
export function localActivity(server: Activity, moving: boolean): Activity {
  if (moving) return 'walking';
  return server === 'drinking' || server === 'waving' || server === 'brewing' ? server : 'idle';
}

export class Player {
  readonly mesh = new THREE.Group();
  /** Presented state (what is rendered and what interaction reads). */
  state: PlayerState;
  /** REQ-NET-003: fixed-step prediction; `Game` binds it to the joined room. */
  readonly predictor: Predictor;
  activity: Activity = 'idle';
  /** The activity the server last reported for the local employee. */
  private serverActivity: Activity = 'idle';
  /** The emote the server last reported ('' = none); shown only while it runs there. */
  private serverEmote: EmoteId | '' = '';
  /** The emote shown on the local avatar ('' = none). */
  emote: EmoteId | '' = '';
  /** The seat the server last reported for the local employee ('' = none). */
  private seatId = '';
  /** REQ-INT-003: what the server says the local employee holds (T-1154). */
  item: Item = '';
  sips = 0;
  /** Seconds the local activity has been `brewing` (0 otherwise); drives the progress prompt. */
  private brewElapsed = 0;
  private view: AvatarView | null = null;
  private readonly materials: THREE.Material[] = [];
  private opacity = 1;

  constructor() {
    const r = BALANCE.movement.capsuleRadius;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, 1.7 - 2 * r, 4, 12),
      new THREE.MeshStandardMaterial({ color: '#3B9AE2' }),
    );
    body.position.y = 0.85;
    // FPS pass 2026-11-20: no avatar casts a sun shadow (the shadow map stays static).
    body.castShadow = false;
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.2),
      new THREE.MeshStandardMaterial({ color: '#222426' }),
    );
    nose.position.set(0, 1.5, r);
    this.mesh.add(body, nose, createBlobShadow());
    this.materials.push(body.material, nose.material);
    for (const m of this.materials) m.transparent = true;
    const [x, , z] = officeLayout.spawn.position;
    this.state = { x, z, heading: (officeLayout.spawn.rotY * Math.PI) / 180 };
    this.predictor = new Predictor(this.state, officeLayout.colliders);
    this.sync();
  }

  update(input: MoveInput, cameraYaw: number, dt: number): void {
    const moving = input.forward !== 0 || input.right !== 0;
    // One input per fixed 50 ms step (sent to the server); the frame shows a partial step.
    // While seated the inputs are still sent: a moving one makes the server stand us up.
    const sample = { forward: input.forward, right: input.right, run: input.run, yaw: cameraYaw };
    this.predictor.advance(dt, sample);
    this.state = this.predictor.present(sample);
    const activity = this.predictor.seated
      ? this.serverActivity
      : localActivity(this.serverActivity, moving);
    if (activity !== this.activity) this.setActivity(activity);
    this.brewElapsed = this.activity === 'brewing' ? this.brewElapsed + dt : 0;
    this.view?.setSeat(seatSocket(this.seatId)?.kind ?? null);
    this.view?.setActivity(this.activity, this.predictor.seated);
    this.view?.setHeld(this.item, this.predictor.seated ? cupRestSpot(this.seatId) : null);
    // Movement ends an emote on the server; like breaks, stop showing it at once.
    this.emote = moving && !this.predictor.seated ? '' : this.serverEmote;
    this.view?.setEmote(this.emote);
    this.view?.update(dt);
    this.sync();
  }

  /**
   * REQ-INT-002, REQ-NET-002: applies the server's view of the local employee on each patch.
   * A reported seat places the player on the seat socket and pauses prediction; leaving the
   * seat resumes prediction from the server position; otherwise the predictor reconciles.
   */
  applyServer(self: LocalSnapshot): void {
    const socket = seatSocket(self.seatId);
    if (socket) {
      if (!this.predictor.seated || self.seatId !== this.seatId) {
        this.predictor.seat(seatPose(socket));
        this.state = this.predictor.state;
        this.sync();
      }
      this.predictor.reconcile(self);
    } else if (this.predictor.seated) {
      this.predictor.unseat(self);
    } else {
      this.predictor.reconcile(self);
    }
    this.seatId = socket ? self.seatId : '';
    this.serverActivity = toActivity(self.activity);
    this.serverEmote = toEmote(self.emote ?? '');
    this.item = toItem(self.item ?? '');
    this.sips = this.item === '' ? 0 : (self.sips ?? 0);
  }

  /** True while the local employee is on a seat (also during a seated sip). */
  get seated(): boolean {
    return this.predictor.seated;
  }

  /** Brewing progress, 0 to 1, from the local clock since brewing started. */
  get brewProgress(): number {
    return Math.min(1, this.brewElapsed / BALANCE.coffee.brewSeconds);
  }

  /** The cup or glass drawn on the local avatar (null when none or still loading). */
  get heldProp(): PropState | null {
    return this.view?.heldProp ?? null;
  }

  setView(view: AvatarView): void {
    this.mesh.clear();
    // FPS pass 2026-11-20: a blob shadow like remote avatars (T-1161) instead of a sun shadow,
    // so the shadow map only holds static casters and is not redrawn every frame.
    view.root.traverse((o) => (o.castShadow = false));
    this.mesh.add(view.root, createBlobShadow());
    this.view = view;
    this.materials.length = 0;
    view.root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      const material = (o as THREE.Mesh).material;
      this.materials.push(...(Array.isArray(material) ? material : [material]));
    });
    for (const m of this.materials) {
      m.transparent = true;
      m.opacity = this.opacity;
    }
    view.setActivity(this.activity, this.predictor.seated);
    view.setEmote(this.emote);
  }

  setActivity(a: Activity): void {
    this.activity = a;
    this.view?.setActivity(a, this.predictor.seated);
  }

  viewFinite(): boolean {
    return this.view?.hasFiniteBones() ?? false;
  }

  /** Typing overlay weight of the loaded avatar, 0 to 1 (T-1219). */
  get typing(): number {
    return this.view?.typing ?? 0;
  }

  /** Make-coffee overlay weight, 0 to 1 (T-1611). */
  get brew(): number {
    return this.view?.brew ?? 0;
  }

  /**
   * Fades the player mesh (e.g. when the camera is close); 1 is fully opaque. Only the opacity
   * uniform changes: the materials always sit in the transparent pass with depth writes on, so a
   * fade never triggers a shader recompile mid-game (slow under software WebGL).
   */
  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return;
    this.opacity = opacity;
    for (const m of this.materials) m.opacity = opacity;
  }

  /**
   * Places the player directly, bypassing movement and collision (debug and test use). The
   * server cannot teleport, so prediction detaches from server patches from here on.
   */
  teleport(x: number, z: number, heading: number): void {
    this.state = { x, z, heading };
    this.predictor.detach(this.state);
    this.sync();
  }

  private sync(): void {
    this.mesh.position.set(this.state.x, 0, this.state.z);
    this.mesh.rotation.y = this.state.heading;
  }
}
