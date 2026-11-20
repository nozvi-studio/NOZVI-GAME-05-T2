import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BALANCE, officeLayout } from '@office/protocol';
import {
  buildCeilingFixtures,
  ceilingFixturePositions,
  setupEnvironment,
  shadowsEnabled,
  type EnvironmentDeps,
} from '../src/game/lighting';

const F = BALANCE.rendering.ceilingFixtures;

describe('ceiling fixtures', () => {
  it('places a columns x rows grid centred under the ceiling, inside the room', () => {
    const room = officeLayout.room;
    const positions = ceilingFixturePositions(room);
    expect(positions).toHaveLength(F.columns * F.rows);
    expect(positions.reduce((a, p) => a + p[0], 0)).toBeCloseTo(0);
    expect(positions.reduce((a, p) => a + p[2], 0)).toBeCloseTo(0);
    for (const [x, y, z] of positions) {
      expect(y + F.thickness / 2).toBeCloseTo(room.height);
      expect(Math.abs(x) + F.panelSize / 2).toBeLessThanOrEqual(room.width / 2);
      expect(Math.abs(z) + F.panelSize / 2).toBeLessThanOrEqual(room.depth / 2);
    }
  });

  it('leaves out panels that would cross a wall', () => {
    const small = { width: 3, depth: 3, height: 2.5 };
    const positions = ceilingFixturePositions(small, { ...F, columns: 3, rows: 1 });
    expect(positions).toEqual([[0, 2.5 - F.thickness / 2, 0]]);
  });

  it('builds one emissive, non-shadow-casting InstancedMesh from the render config', () => {
    const mesh = buildCeilingFixtures(officeLayout.room);
    expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(mesh.count).toBe(F.columns * F.rows);
    expect(mesh.castShadow).toBe(false);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.emissiveIntensity).toBe(F.emissiveIntensity);
    expect(material.emissive.getHexString()).toBe(new THREE.Color(F.emissive).getHexString());
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    // Instance matrices are Float32.
    const expected = ceilingFixturePositions(officeLayout.room)[0] ?? [NaN, NaN, NaN];
    p.toArray().forEach((v, i) => expect(v).toBeCloseTo(expected[i] ?? NaN, 5));
  });
});

describe('environment (T-1149)', () => {
  const renderer = {} as THREE.WebGLRenderer;

  function fakes() {
    const target = new THREE.WebGLRenderTarget(1, 1);
    const texture = target.texture;
    // T-1149 review: the whole render target is released, not only its texture.
    const disposeTexture = vi.spyOn(target, 'dispose');
    const probe = new THREE.LightProbe();
    const deps = {
      pmrem: vi.fn<EnvironmentDeps['pmrem']>(() => target),
      probe: vi.fn<EnvironmentDeps['probe']>(() => Promise.resolve(probe)),
    };
    return { texture, disposeTexture, probe, deps };
  }

  it('sets scene.environment from the RoomEnvironment PMREM in high quality and disposes it', async () => {
    const scene = new THREE.Scene();
    const { texture, disposeTexture, deps } = fakes();
    const env = setupEnvironment(renderer, scene, 'high', deps);
    await env.ready;
    expect(deps.pmrem).toHaveBeenCalledWith(renderer);
    expect(deps.probe).not.toHaveBeenCalled();
    expect(scene.environment).toBe(texture);
    expect(scene.environmentIntensity).toBe(BALANCE.rendering.environmentIntensity);
    expect(scene.children.some((c) => (c as THREE.LightProbe).isLightProbe)).toBe(false);

    env.dispose();
    expect(scene.environment).toBeNull();
    expect(disposeTexture).toHaveBeenCalledTimes(1);
  });

  it('keeps the light probe and sets no environment in e2e quality', async () => {
    const scene = new THREE.Scene();
    const { probe, deps } = fakes();
    const env = setupEnvironment(renderer, scene, 'e2e', deps);
    await env.ready;
    expect(deps.pmrem).not.toHaveBeenCalled();
    expect(scene.environment).toBeNull();
    expect(probe.parent).toBe(scene);
    expect(probe.intensity).toBe(BALANCE.rendering.environmentIntensity);

    env.dispose();
    expect(probe.parent).toBeNull();
  });

  it('does not add the probe after an early dispose in e2e quality', async () => {
    const scene = new THREE.Scene();
    const { probe, deps } = fakes();
    const env = setupEnvironment(renderer, scene, 'e2e', deps);
    env.dispose();
    await env.ready;
    expect(probe.parent).toBeNull();
  });
});

describe('shadows by render quality (PR #4 CI fix)', () => {
  it('draws shadow maps in high quality only', () => {
    expect(shadowsEnabled('high')).toBe(true);
    expect(shadowsEnabled('e2e')).toBe(false);
  });
});
