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
    const [x, , z] = officeLayout.spawn.position;
    this.state = { x, z, heading: (officeLayout.spawn.rotY * Math.PI) / 180 };
    this.sync();
  }

  update(input: MoveInput, cameraYaw: number, dt: number): void {
    this.state = stepPlayer(this.state, input, cameraYaw, dt, officeLayout.colliders);
    this.sync();
  }

  private sync(): void {
    this.mesh.position.set(this.state.x, 0, this.state.z);
    this.mesh.rotation.y = this.state.heading;
  }
}
