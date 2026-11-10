import * as THREE from 'three';
import { officeLayout } from '@office/protocol';
import { CameraRig } from './camera';
import { KeyboardInput } from './input';
import { Player } from './player';
import { setupLighting } from './lighting';
import { buildRoom } from './room';

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly player = new Player();
  readonly input = new KeyboardInput(window);
  onFrame: ((dt: number) => void) | undefined;
  private readonly timer = new THREE.Timer();
  private readonly resizeObserver: ResizeObserver;
  private readonly rig: CameraRig;
  private readonly debugHook: unknown;
  private readonly disposeLighting: () => void;

  constructor(private readonly host: HTMLElement) {
    const room = buildRoom(officeLayout);
    this.scene.add(room);
    const occluders: THREE.Object3D[] = [];
    room.traverse((o) => {
      if (o.userData.occluder) occluders.push(o);
    });
    this.scene.add(this.player.mesh);
    this.rig = new CameraRig(this.camera, this.renderer.domElement, occluders);
    this.rig.yaw = this.player.state.heading;
    this.scene.updateMatrixWorld(true);
    this.rig.update(this.player.mesh.position, 0);
    const lighting = setupLighting(this.renderer, this.scene, new THREE.Box3().setFromObject(room));
    this.disposeLighting = lighting.dispose;
    if (import.meta.env.DEV) {
      this.debugHook = {
        getPlayer: () => ({ ...this.player.state }),
        getCameraYaw: () => this.rig.yaw,
      };
      (window as unknown as { __office: unknown }).__office = this.debugHook;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.1);
      this.player.update(this.input.read(), this.rig.yaw, dt);
      this.rig.update(this.player.mesh.position, dt);
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    this.rig.dispose();
    const w = window as unknown as { __office?: unknown };
    if (this.debugHook !== undefined && w.__office === this.debugHook) delete w.__office;
    this.resizeObserver.disconnect();
    this.disposeLighting();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
