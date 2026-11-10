import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator.js';
import { BALANCE } from '@office/protocol';

const R = BALANCE.rendering;

/**
 * Configures colour output, tone mapping, image-based fill and the window sun. The sun's
 * orthographic shadow camera is fitted tightly around `bounds` (the room) in light space.
 * `ready` resolves once the environment light probe has been baked and added.
 */
export function setupLighting(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  bounds: THREE.Box3,
): { ready: Promise<void>; dispose: () => void } {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping =
    R.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.AgXToneMapping;
  renderer.toneMappingExposure = R.exposure;
  // r187 removed PCFSoftShadowMap; PCFShadowMap now does soft Vogel-disk filtering via shadow.radius.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene.background = new THREE.Color(R.background);
  // Image-based fill: bake THREE's RoomEnvironment into a spherical-harmonics light probe once.
  // A PMREM scene.environment gives the same diffuse look on these roughness-1 materials but
  // costs ~70 ms per frame under software WebGL (SwiftShader); the probe is nearly free.
  const cubeTarget = new THREE.WebGLCubeRenderTarget(32, { type: THREE.HalfFloatType });
  const roomEnv = new RoomEnvironment();
  new THREE.CubeCamera(0.1, 100, cubeTarget).update(renderer, roomEnv);
  roomEnv.dispose();
  let disposed = false;
  const ready = LightProbeGenerator.fromCubeRenderTarget(renderer, cubeTarget)
    .then((probe) => {
      if (disposed) return;
      probe.intensity = R.environmentIntensity;
      scene.add(probe);
    })
    .catch((e: unknown) => console.warn('Environment light probe unavailable', e))
    .finally(() => cubeTarget.dispose());

  const h = R.hemisphere;
  scene.add(new THREE.HemisphereLight(h.sky, h.ground, h.intensity));

  const sun = new THREE.DirectionalLight(R.sun.color, R.sun.intensity);
  sun.position.set(...R.sun.position);
  sun.target.position.set(...R.sun.target);
  sun.castShadow = true;
  const s = R.shadow;
  sun.shadow.mapSize.set(s.mapSize, s.mapSize);
  sun.shadow.bias = s.bias;
  sun.shadow.normalBias = s.normalBias;
  sun.shadow.radius = s.radius;
  fitShadowCamera(sun, bounds, s.margin);
  scene.add(sun, sun.target);

  return {
    ready,
    dispose: () => {
      disposed = true;
      sun.shadow.dispose();
    },
  };
}

/** Fits the light's orthographic shadow frustum to the box corners expressed in light space. */
export function fitShadowCamera(light: THREE.DirectionalLight, box: THREE.Box3, margin: number) {
  const cam = light.shadow.camera;
  cam.position.copy(light.position);
  cam.lookAt(light.target.position);
  cam.updateMatrixWorld(true);
  const inv = cam.matrixWorldInverse;
  const ls = new THREE.Box3();
  const p = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    p.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    ls.expandByPoint(p.applyMatrix4(inv));
  }
  cam.left = ls.min.x - margin;
  cam.right = ls.max.x + margin;
  cam.bottom = ls.min.y - margin;
  cam.top = ls.max.y + margin;
  // Camera looks down -Z in its own space.
  cam.near = Math.max(0.05, -ls.max.z - margin);
  cam.far = -ls.min.z + margin;
  cam.updateProjectionMatrix();
}
