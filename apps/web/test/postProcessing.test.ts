import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BALANCE } from '@office/protocol';
import {
  createFrameRenderer,
  postProcessingConfig,
  type ComposerFactory,
  type ComposerLike,
} from '../src/game/postProcessing';

function fakeRenderer(pixelRatio = 2) {
  const render = vi.fn();
  const renderer = { render, getPixelRatio: () => pixelRatio } as unknown as THREE.WebGLRenderer;
  return { renderer, render };
}

function fakeFactory() {
  const composer = {
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    dispose: vi.fn(),
  } satisfies ComposerLike;
  const factory = vi.fn<ComposerFactory>(() => composer);
  return { composer, factory };
}

describe('postProcessingConfig', () => {
  it('is off in e2e quality', () => {
    expect(postProcessingConfig('e2e')).toBeNull();
  });

  it('FPS pass 2026-11-20: bloom is off in the render config, so high renders directly', () => {
    expect(BALANCE.rendering.postProcessing.bloom.strength).toBe(0);
    expect(postProcessingConfig('high')).toBeNull();
  });

  it('takes MSAA and a mild bloom from the render config in high quality when bloom is on', () => {
    const p = BALANCE.rendering.postProcessing;
    const on = { msaaSamples: p.msaaSamples, bloom: { ...p.bloom, strength: 0.25 } };
    expect(postProcessingConfig('high', on)).toEqual({
      msaaSamples: on.msaaSamples,
      bloom: { ...on.bloom },
    });
    // Mild: the threshold sits above lit surfaces, below the emissive ceiling panels.
    expect(p.bloom.threshold).toBeGreaterThan(1);
    expect(BALANCE.rendering.ceilingFixtures.emissiveIntensity).toBeGreaterThan(p.bloom.threshold);
  });
});

describe('createFrameRenderer', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();

  const bloomOn = {
    msaaSamples: BALANCE.rendering.postProcessing.msaaSamples,
    bloom: { ...BALANCE.rendering.postProcessing.bloom, strength: 0.25 },
  };

  it('renders high quality through the composer when bloom is on, resizes and disposes it', () => {
    const { renderer, render } = fakeRenderer(2);
    const { composer, factory } = fakeFactory();
    const frame = createFrameRenderer(renderer, scene, camera, 'high', factory, bloomOn);
    expect(frame.composed).toBe(true);
    expect(factory).toHaveBeenCalledWith(
      renderer,
      scene,
      camera,
      postProcessingConfig('high', bloomOn),
    );

    frame.render();
    expect(composer.render).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();

    frame.setSize(800, 600);
    expect(composer.setPixelRatio).toHaveBeenCalledWith(2);
    expect(composer.setSize).toHaveBeenCalledWith(800, 600);
    // Pixel ratio first, so the final size is the new one.
    expect(composer.setPixelRatio.mock.invocationCallOrder[0]).toBeLessThan(
      composer.setSize.mock.invocationCallOrder[0] ?? 0,
    );

    frame.dispose();
    expect(composer.dispose).toHaveBeenCalledTimes(1);
  });

  it('renders high quality directly when bloom is off (the shipped config)', () => {
    const { renderer, render } = fakeRenderer();
    const { factory } = fakeFactory();
    const frame = createFrameRenderer(renderer, scene, camera, 'high', factory);
    expect(frame.composed).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    frame.render();
    expect(render).toHaveBeenCalledWith(scene, camera);
  });

  it('renders e2e quality directly without creating a composer', () => {
    const { renderer, render } = fakeRenderer();
    const { factory } = fakeFactory();
    const frame = createFrameRenderer(renderer, scene, camera, 'e2e', factory);
    expect(frame.composed).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    frame.render();
    expect(render).toHaveBeenCalledWith(scene, camera);
    expect(() => {
      frame.setSize(800, 600);
      frame.dispose();
    }).not.toThrow();
  });
});
