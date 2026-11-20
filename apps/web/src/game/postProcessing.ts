import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BALANCE } from '@office/protocol';
import type { RenderQuality } from './renderQuality';

/** Post-processing settings for one render quality, or `null` to render directly. */
export type PostProcessingConfig = {
  /** MSAA samples of the composer's render targets (anti-aliasing). */
  msaaSamples: number;
  bloom: { strength: number; radius: number; threshold: number };
};

/**
 * Phase 4.1 task 5 (T-1150): `high` renders through an `EffectComposer` with MSAA and a mild
 * bloom; `e2e` (software WebGL in Playwright) renders directly, as before.
 */
export function postProcessingConfig(
  quality: RenderQuality,
  p: { msaaSamples: number; bloom: PostProcessingConfig['bloom'] } = BALANCE.rendering
    .postProcessing,
): PostProcessingConfig | null {
  if (quality === 'e2e') return null;
  // FPS pass 2026-11-20: without bloom the composer only adds MSAA, which costs two
  // full-screen half-float targets and an output pass; the canvas's own antialias is cheaper.
  if (p.bloom.strength <= 0) return null;
  return { msaaSamples: p.msaaSamples, bloom: { ...p.bloom } };
}

/** The slice of an `EffectComposer` the frame renderer uses (injectable for unit tests). */
export type ComposerLike = {
  render(): void;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number): void;
  dispose(): void;
};

export type ComposerFactory = (
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  config: PostProcessingConfig,
) => ComposerLike;

/** Draws one frame of the scene; owns the composer when post-processing is on. */
export type FrameRenderer = {
  readonly composed: boolean;
  render(): void;
  /** Call after `renderer.setSize`; picks up the renderer's current pixel ratio. */
  setSize(width: number, height: number): void;
  dispose(): void;
};

/**
 * Scene pass into a multisampled half-float target (linear HDR, so the bloom threshold only
 * catches emissive panels, screens and lamps), bloom, then `OutputPass` for the renderer's
 * tone mapping and sRGB output. Alpha passes through, so the TV occluder's transparent hole
 * still shows the CSS3D layer under the canvas.
 */
export const createEffectComposer: ComposerFactory = (renderer, scene, camera, config) => {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: config.msaaSamples,
  });
  target.texture.name = 'EffectComposer.rt1';
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const { strength, radius, threshold } = config.bloom;
  // Strength 0 drops the pass (plan §6.5 fallback) instead of running it invisibly.
  if (strength > 0) {
    composer.addPass(new UnrealBloomPass(size.clone(), strength, radius, threshold));
  }
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    setSize: (w, h) => composer.setSize(w, h),
    dispose: () => {
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    },
  };
};

export function createFrameRenderer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: RenderQuality,
  factory: ComposerFactory = createEffectComposer,
  settings: Parameters<typeof postProcessingConfig>[1] = BALANCE.rendering.postProcessing,
): FrameRenderer {
  const config = postProcessingConfig(quality, settings);
  if (!config) {
    return {
      composed: false,
      render: () => renderer.render(scene, camera),
      setSize: () => {},
      dispose: () => {},
    };
  }
  const composer = factory(renderer, scene, camera, config);
  return {
    composed: true,
    render: () => composer.render(),
    setSize: (w, h) => {
      // setPixelRatio resizes with the old size; setSize then applies the new one.
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    },
    dispose: () => composer.dispose(),
  };
}
