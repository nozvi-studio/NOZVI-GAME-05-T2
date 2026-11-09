import * as THREE from 'three';
import { BALANCE } from '@office/protocol';
import { clampPitch, damp, orbitOffset, resolveDistance } from './cameraMath';

const C = BALANCE.camera;

export class CameraRig {
  yaw = 0;
  pitch = clampPitch((C.defaultPitchDeg * Math.PI) / 180);
  private distance: number = C.distance;
  private currentDistance: number = C.distance;
  private dragging = false;
  private readonly ray = new THREE.Raycaster();
  private readonly focus = new THREE.Vector3();
  private readonly dirVec = new THREE.Vector3();
  private readonly hidden = new Set<THREE.Object3D>();

  private readonly onDown = (e: PointerEvent) => {
    if (e.button === 0) this.dragging = true;
  };
  private readonly onUp = () => {
    this.dragging = false;
  };
  private readonly onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.yaw -= e.movementX * C.mouseSensitivity;
    this.pitch = clampPitch(this.pitch + e.movementY * C.mouseSensitivity);
  };
  private readonly onWheel = (e: WheelEvent) => {
    this.distance = Math.min(
      Math.max(this.distance + e.deltaY * 0.002, C.minDistance),
      C.maxDistance,
    );
  };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly occluders: THREE.Object3D[],
  ) {
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointermove', this.onMove);
    dom.addEventListener('wheel', this.onWheel, { passive: true });
  }

  update(target: THREE.Vector3, dt: number): void {
    this.focus.set(target.x, target.y + C.targetHeight, target.z);
    const dir = orbitOffset(this.yaw, this.pitch, 1);
    this.dirVec.set(dir.x, dir.y, dir.z).normalize();
    this.ray.set(this.focus, this.dirVec);
    this.ray.far = this.distance;
    const hits = this.ray.intersectObjects(this.occluders, false);
    const hit = hits[0];
    const wanted = resolveDistance(this.distance, hit ? hit.distance : null);
    this.currentDistance =
      wanted < this.currentDistance ? wanted : damp(this.currentDistance, wanted, C.stiffness, dt);
    // The minimum-distance clamp wins over occlusion (OQ-007), so near a wall the camera can
    // end up behind it. Hide any occluder still between the focus and the camera this frame.
    this.restoreHidden();
    for (const h of hits) {
      if (h.distance >= this.currentDistance + this.camera.near) break;
      h.object.visible = false;
      this.hidden.add(h.object);
    }
    const o = orbitOffset(this.yaw, this.pitch, this.currentDistance);
    this.camera.position.set(this.focus.x + o.x, this.focus.y + o.y, this.focus.z + o.z);
    this.camera.lookAt(this.focus);
  }

  private restoreHidden(): void {
    for (const o of this.hidden) o.visible = true;
    this.hidden.clear();
  }

  dispose(): void {
    this.restoreHidden();
    this.dom.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointermove', this.onMove);
    this.dom.removeEventListener('wheel', this.onWheel);
  }
}
