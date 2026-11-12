import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AvatarView, CLIP_FOR } from '../src/game/avatar/AvatarView';
import { Player } from '../src/game/player';

afterEach(() => vi.restoreAllMocks());

const UAL = [
  'Idle_Loop',
  'Walk_Loop',
  'Sitting_Enter',
  'Sitting_Exit',
  'Sitting_Idle_Loop',
  'Interact',
];

async function loadLocalGltf(url: string): Promise<GLTF> {
  const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new GLTFLoader().parseAsync(data, '');
}

it('maps every activity to a UAL clip that exists', () => {
  for (const a of [
    'idle',
    'walking',
    'sitting',
    'working',
    'resting',
    'drinking',
    'waving',
  ] as const) {
    expect(UAL).toContain(CLIP_FOR[a].clip);
  }
});

it.each(['men_suit', 'women_suit'] as const)(
  'animates the real %s assets with finite bones and preserves wall fading on replacement',
  async (avatarId) => {
    // Parse the checked-in assets locally; only replace the loader's network transport.
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(loadLocalGltf);
    const player = new Player();
    const capsule = [...player.mesh.children];
    expect(capsule).toHaveLength(2);
    expect(player.viewFinite()).toBe(false);
    player.setOpacity(0.35);
    player.setActivity('walking');

    const view = await AvatarView.load(avatarId);
    player.setView(view);
    expect(player.mesh.children).toEqual([view.root]);
    expect(capsule.every((o) => o.parent === null)).toBe(true);
    expect(player.viewFinite()).toBe(true);
    const arm = view.root.getObjectByName('UpperArmR')!;
    const forearm = view.root.getObjectByName('LowerArmR')!;
    expect(arm).toBeInstanceOf(THREE.Bone);
    expect(forearm).toBeInstanceOf(THREE.Bone);
    const before = arm.quaternion.clone();
    view.update(0.35);
    expect(arm.quaternion.angleTo(before)).toBeGreaterThan(0.01);

    const materials = new Set<THREE.Material>();
    view.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    });
    expect(materials.size).toBeGreaterThan(0);
    for (const m of materials) {
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBe(0.35);
    }
    player.setOpacity(1);
    for (const m of materials) expect(m.opacity).toBe(1);

    for (const activity of [
      'sitting',
      'working',
      'resting',
      'idle',
      'drinking',
      'waving',
    ] as const) {
      player.setActivity(activity);
      view.update(1 / 60);
      if (activity === 'waving') {
        const hand = forearm.children.find((child) => child.name === 'HandR')!;
        expect(hand).toBeInstanceOf(THREE.Bone);
        view.root.rotation.y = 0.8;
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        for (let i = 0; i < 3; i++) view.update(1 / 60);
        view.root.updateMatrixWorld(true);
        const shoulder = arm.getWorldPosition(new THREE.Vector3());
        const elbow = forearm.getWorldPosition(new THREE.Vector3());
        const handPosition = hand.getWorldPosition(new THREE.Vector3());
        expect(handPosition.y - shoulder.y).toBeGreaterThan(0.2);
        const heading = view.root.getWorldQuaternion(new THREE.Quaternion());
        const raisedDirection = new THREE.Vector3(0.35, 0.9, 0)
          .normalize()
          .applyQuaternion(heading);
        expect(elbow.clone().sub(shoulder).normalize().dot(raisedDirection)).toBeGreaterThan(0.99);
        const beforeSwing = handPosition.clone().sub(elbow).normalize();
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(heading);
        expect(beforeSwing.dot(up)).toBeGreaterThan(0.99);
        now.mockReturnValue((Math.PI / 20) * 1000);
        view.update(1 / 60);
        view.root.updateMatrixWorld(true);
        const afterSwing = hand
          .getWorldPosition(new THREE.Vector3())
          .sub(forearm.getWorldPosition(new THREE.Vector3()))
          .normalize();
        expect(beforeSwing.angleTo(afterSwing)).toBeCloseTo(0.4);
        expect(
          hand.getWorldPosition(new THREE.Vector3()).y - arm.getWorldPosition(shoulder).y,
        ).toBeGreaterThan(0.2);
      }
      for (let i = 0; i < 180; i++) {
        view.update(1 / 60);
        expect(view.hasFiniteBones()).toBe(true);
      }
    }
    arm.quaternion.y = NaN;
    expect(player.viewFinite()).toBe(false);
  },
);

it('keeps seated players on the floor at the socket and resumes movement after standing', () => {
  const player = new Player();
  player.seatAt({ position: [0, 0.45, 0], rotY: 90 });
  player.setActivity('sitting');
  const seatedState = { ...player.state };
  player.update({ forward: 1, right: 0, run: false }, 0, 0.1);
  expect(player.state).toEqual(seatedState);
  expect(player.mesh.position.toArray()).toEqual([0, 0, 0]);
  expect(player.mesh.rotation.y).toBeCloseTo(Math.PI / 2);
  player.standAt([0, 0.45, 1]);
  expect(player.state).toEqual({ x: 0, z: 1, heading: Math.PI / 2 });
  expect(player.mesh.position.y).toBe(0);
  player.setActivity('idle');
  player.update({ forward: 1, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('walking');
  expect(player.state.z).toBeGreaterThan(1);
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('idle');
});

it('preserves drinking while stationary and interrupts it when movement starts', () => {
  const player = new Player();
  player.setActivity('drinking');
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('drinking');
  player.update({ forward: 1, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('walking');
});

it('rejects an avatar without a skinned mesh without replacing the capsule', async () => {
  vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(async (url) =>
    url === '/assets/anim/ual.glb' ? loadLocalGltf(url) : ({ scene: new THREE.Group() } as GLTF),
  );
  const player = new Player();
  const capsule = [...player.mesh.children];
  await expect(AvatarView.load('men_suit').then((view) => player.setView(view))).rejects.toThrow(
    'No skinned mesh in men_suit',
  );
  expect(player.mesh.children).toEqual(capsule);
  expect(player.viewFinite()).toBe(false);
});
