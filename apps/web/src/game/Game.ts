import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { BALANCE, isSeated, officeLayout, SeatRegistry, type AvatarId } from '@office/protocol';
import { CameraRig } from './camera';
import { fadeOpacity } from './cameraMath';
import { KeyboardInput } from './input';
import { Player } from './player';
import { setupLighting } from './lighting';
import { buildRoom } from './room';
import { loadFurniture } from './assets/loadFurniture';
import { AvatarView } from './avatar/AvatarView';
import { InteractionController, type Prompt } from './interaction/InteractionController';
import { Nameplate } from './hud/Nameplate';

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(BALANCE.camera.fovDeg, 1, 0.05, 50);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly labelRenderer = new CSS2DRenderer();
  private readonly nameplate = new Nameplate();
  readonly player = new Player();
  readonly input = new KeyboardInput(window);
  readonly seats = new SeatRegistry();
  readonly controller = new InteractionController(this.player, this.seats, 'local', {
    onExit: () => this.onExit?.(),
  });
  onPrompt: ((prompt: Prompt) => void) | undefined;
  onExit: (() => void) | undefined;
  onFrame: ((dt: number) => void) | undefined;
  private promptText: string | null = null;
  private readonly keydown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE' && !e.repeat) this.controller.press();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && isSeated(this.player.activity)) {
      this.controller.onMoveIntent();
    }
  };
  private readonly timer = new THREE.Timer();
  private readonly resizeObserver: ResizeObserver;
  private readonly rig: CameraRig;
  private readonly debugHook: unknown;
  private readonly disposeLighting: () => void;
  private furniture: Awaited<ReturnType<typeof loadFurniture>> | undefined;
  private disposed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly identity: { name: string; avatarId: AvatarId },
  ) {
    const room = buildRoom(officeLayout);
    this.scene.add(room);
    const occluders: THREE.Object3D[] = [];
    room.traverse((o) => {
      if (o.userData.occluder) occluders.push(o);
    });
    void loadFurniture(room, officeLayout).then((result) => {
      this.furniture = result;
      occluders.length = 0;
      room.updateMatrixWorld(true);
      room.traverse((o) => {
        if (o.userData.occluder) occluders.push(o);
      });
    });
    this.scene.add(this.player.mesh);
    this.player.mesh.add(this.nameplate.object);
    void AvatarView.load(identity.avatarId)
      .then((view) => {
        if (!this.disposed) {
          this.player.setView(view);
          // setView clears the fallback mesh, including its attached nameplate.
          this.player.mesh.add(this.nameplate.object);
        }
      })
      .catch((error: unknown) => console.warn('Avatar loading failed; keeping capsule.', error));
    this.rig = new CameraRig(this.camera, this.renderer.domElement, occluders);
    this.rig.yaw = this.player.state.heading;
    this.scene.updateMatrixWorld(true);
    this.rig.update(this.player.mesh.position, 0);
    const lighting = setupLighting(this.renderer, this.scene, new THREE.Box3().setFromObject(room));
    this.disposeLighting = lighting.dispose;
    if (import.meta.env.DEV) {
      let lightingReady = false;
      void lighting.ready.then(() => (lightingReady = true));
      this.debugHook = {
        getPlayer: () => ({ ...this.player.state }),
        getCameraYaw: () => this.rig.yaw,
        getCamera: () => {
          const { x, y, z } = this.camera.position;
          return { x, y, z, yaw: this.rig.yaw, pitch: this.rig.pitchInUse };
        },
        setPose: (p: { x: number; z: number; heading: number; yaw?: number; pitch?: number }) => {
          this.player.teleport(p.x, p.z, p.heading);
          this.rig.yaw = p.yaw ?? p.heading;
          if (p.pitch !== undefined) this.rig.pitch = p.pitch;
        },
        getDrawCalls: () => this.measureDrawCalls(),
        isLightingReady: () => lightingReady,
        getFurniture: () => this.furniture,
        getActivity: () => this.player.activity,
        teleport: (x: number, z: number, heading: number) => {
          this.player.teleport(x, z, heading);
          this.rig.yaw = heading;
        },
        avatarOk: () => this.player.viewFinite(),
      };
      (window as unknown as { __office: unknown }).__office = this.debugHook;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.labelRenderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;pointer-events:none';
    host.appendChild(this.labelRenderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    window.addEventListener('keydown', this.keydown);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Renders two frames: one with the shadow pass, one reusing the shadow map (main pass only). */
  private measureDrawCalls(): { total: number; main: number; shadow: number; triangles: number } {
    const shadowMap = this.renderer.shadowMap;
    this.renderer.render(this.scene, this.camera);
    const total = this.renderer.info.render.calls;
    const triangles = this.renderer.info.render.triangles;
    const autoUpdate = shadowMap.autoUpdate;
    shadowMap.autoUpdate = false;
    this.renderer.render(this.scene, this.camera);
    const main = this.renderer.info.render.calls;
    shadowMap.autoUpdate = autoUpdate;
    return { total, main, shadow: total - main, triangles };
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      this.timer.update();
      const dt = Math.min(this.timer.getDelta(), 0.1);
      const input = this.input.read();
      if (isSeated(this.player.activity) && (input.forward !== 0 || input.right !== 0)) {
        this.controller.onMoveIntent();
      }
      this.player.update(input, this.rig.yaw, dt);
      const prompt = this.controller.currentPrompt();
      const text = prompt?.text ?? null;
      if (text !== this.promptText) {
        this.promptText = text;
        this.onPrompt?.(prompt);
      }
      this.rig.update(this.player.mesh.position, dt);
      this.player.setOpacity(fadeOpacity(this.rig.distanceToFocus));
      this.onFrame?.(dt);
      const activity = this.player.activity;
      const label =
        activity === 'working'
          ? 'Working'
          : activity === 'drinking'
            ? 'Break'
            : activity === 'resting'
              ? 'Resting'
              : 'Online';
      this.nameplate.set(this.identity.name, label);
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    window.removeEventListener('keydown', this.keydown);
    this.rig.dispose();
    const w = window as unknown as { __office?: unknown };
    if (this.debugHook !== undefined && w.__office === this.debugHook) delete w.__office;
    this.resizeObserver.disconnect();
    this.disposeLighting();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }
}
