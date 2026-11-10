import * as THREE from 'three';
import {
  BALANCE,
  officeLayout,
  stepPlayer,
  type MoveInput,
  type PlayerState,
} from '@office/protocol';

export class Player {
  readonly mesh = new THREE.Group();
  state: PlayerState;
  private readonly materials: THREE.MeshStandardMaterial[] = [];
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
    this.sync();
  }

  update(input: MoveInput, cameraYaw: number, dt: number): void {
    this.state = stepPlayer(this.state, input, cameraYaw, dt, officeLayout.colliders);
    this.sync();
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

  /** Places the player directly, bypassing movement and collision (debug and test use). */
  teleport(x: number, z: number, heading: number): void {
    this.state = { x, z, heading };
    this.sync();
  }

  private sync(): void {
    this.mesh.position.set(this.state.x, 0, this.state.z);
    this.mesh.rotation.y = this.state.heading;
  }
}
