import * as THREE from 'three';
import {
  BALANCE,
  officeLayout,
  nextActivity,
  type Activity,
  type MoveInput,
  type PlayerState,
  type Vec3,
} from '@office/protocol';
import { AvatarView } from './avatar/AvatarView';
import { Predictor } from '../net/prediction';

export class Player {
  readonly mesh = new THREE.Group();
  /** Presented state (what is rendered and what interaction reads). */
  state: PlayerState;
  /** REQ-NET-003: fixed-step prediction; `Game` binds it to the joined room. */
  readonly predictor: Predictor;
  activity: Activity = 'idle';
  private view: AvatarView | null = null;
  private seated: { position: Vec3; rotY: number } | null = null;
  private readonly materials: THREE.Material[] = [];
  private opacity = 1;

  constructor() {
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
    this.mesh.add(body, nose);
    this.materials.push(body.material, nose.material);
    for (const m of this.materials) m.transparent = true;
    const [x, , z] = officeLayout.spawn.position;
    this.state = { x, z, heading: (officeLayout.spawn.rotY * Math.PI) / 180 };
    this.predictor = new Predictor(this.state, officeLayout.colliders);
    this.sync();
  }

  update(input: MoveInput, cameraYaw: number, dt: number): void {
    const moving = input.forward !== 0 || input.right !== 0;
    if (!this.seated) {
      // One input per fixed 50 ms step (sent to the server); the frame shows a partial step.
      const sample = { forward: input.forward, right: input.right, run: input.run, yaw: cameraYaw };
      this.predictor.advance(dt, sample);
      this.state = this.predictor.present(sample);
      if (this.activity !== 'drinking' || moving) {
        this.setActivity(nextActivity(this.activity, { type: moving ? 'move' : 'stop' }));
      }
    }
    this.view?.update(dt);
    this.sync();
  }

  setView(view: AvatarView): void {
    this.mesh.clear();
    this.mesh.add(view.root);
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
    view.setActivity(this.activity);
  }

  setActivity(a: Activity): void {
    this.activity = a;
    this.view?.setActivity(a);
  }

  seatAt(socket: { position: Vec3; rotY: number }): void {
    this.seated = socket;
    this.state.x = socket.position[0];
    this.state.z = socket.position[2];
    this.state.heading = (socket.rotY * Math.PI) / 180;
    this.sync();
  }

  standAt(point: Vec3): void {
    this.seated = null;
    this.state.x = point[0];
    this.state.z = point[2];
    // Seating is local until the server owns seats (T-1039): the next patch pulls the
    // prediction back to the server position with a blended correction.
    this.predictor.reset(this.state);
    this.sync();
  }

  viewFinite(): boolean {
    return this.view?.hasFiniteBones() ?? false;
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
