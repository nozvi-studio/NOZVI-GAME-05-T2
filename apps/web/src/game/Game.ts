import * as THREE from 'three';
import { officeLayout } from '@office/protocol';
import { buildRoom } from './room';

export class Game {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50);
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  onFrame: ((dt: number) => void) | undefined;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly host: HTMLElement) {
    this.scene.background = new THREE.Color('#dfe9f3');
    this.scene.add(buildRoom(officeLayout));
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a0', 1.2));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.4);
    sun.position.set(2, 6, 6);
    sun.castShadow = true;
    this.scene.add(sun);
    this.camera.position.set(0, 2.2, -1);
    this.camera.lookAt(0, 1, 2);
    this.renderer.shadowMap.enabled = true;
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
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
