import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { BALANCE, EMOTES, canEmote } from '@office/protocol';
import { AvatarView, CLIP_FOR, EMOTE_SOURCE } from '../src/game/avatar/AvatarView';
import { Player } from '../src/game/player';

afterEach(() => {
  vi.restoreAllMocks();
  AvatarView.clearCache();
});

const UAL = [
  'Idle_Loop',
  'Walk_Formal_Loop',
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
    // Body, nose and (FPS pass 2026-11-20) the blob shadow.
    expect(capsule).toHaveLength(3);
    expect(capsule.some((o) => o.castShadow)).toBe(false);
    expect(player.viewFinite()).toBe(false);
    player.setOpacity(0.35);
    player.setActivity('walking');

    const view = await AvatarView.load(avatarId);
    player.setView(view);
    // FPS pass 2026-11-20: a blob shadow instead of a sun shadow; nothing on the avatar casts.
    expect(player.mesh.children[0]).toBe(view.root);
    expect(player.mesh.children.map((o) => o.name)).toEqual([view.root.name, 'blob-shadow']);
    let casts = false;
    view.root.traverse((o) => (casts ||= o.castShadow));
    expect(casts).toBe(false);
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
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(heading);
        // The avatar's right is the side of the right shoulder (owner report 2026-11-18: the
        // old fixed local +X raised the right arm across the head).
        const leftShoulder = view.root
          .getObjectByName('UpperArmL')!
          .getWorldPosition(new THREE.Vector3());
        const right = shoulder.clone().sub(leftShoulder);
        right.sub(up.clone().multiplyScalar(right.dot(up))).normalize();
        const raisedDirection = up
          .clone()
          .multiplyScalar(0.6)
          .addScaledVector(right, 0.8)
          .normalize();
        expect(elbow.clone().sub(shoulder).normalize().dot(raisedDirection)).toBeGreaterThan(0.99);
        const beforeSwing = handPosition.clone().sub(elbow).normalize();
        const forearmDirection = up.clone().addScaledVector(right, 0.1).normalize();
        expect(beforeSwing.dot(forearmDirection)).toBeGreaterThan(0.99);
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
  const lastSeq = () => player.predictor.pending.at(-1)?.seq ?? 0;
  // The server seats the player on ws_5 (socket 0.66, 1.2 facing +x).
  player.applyServer({
    x: 0.66,
    z: 1.2,
    heading: Math.PI / 2,
    lastSeq: 0,
    activity: 'sitting',
    seatId: 'ws_5_seat',
  });
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('sitting');
  const seatedState = { ...player.state };
  expect(seatedState).toEqual({ x: 0.66, z: 1.2, heading: Math.PI / 2 });
  // Moving while seated does not move the seat pose before the server stands the player up.
  player.update({ forward: 1, right: 0, run: false }, 0, 0.1);
  expect(player.state).toEqual(seatedState);
  expect(player.activity).toBe('sitting');
  expect(player.mesh.position.toArray()).toEqual([0.66, 0, 1.2]);
  expect(player.mesh.rotation.y).toBeCloseTo(Math.PI / 2);
  player.applyServer({
    x: 0.66,
    z: 2.46,
    heading: Math.PI / 2,
    lastSeq: lastSeq(),
    activity: 'idle',
    seatId: '',
  });
  player.update({ forward: 0, right: 0, run: false }, 0, 0.05);
  expect(player.state).toEqual({ x: 0.66, z: 2.46, heading: Math.PI / 2 });
  expect(player.mesh.position.y).toBe(0);
  expect(player.activity).toBe('idle');
  player.update({ forward: 1, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('walking');
  expect(player.state.z).toBeGreaterThan(2.46);
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('idle');
});

it('shows a break only while the server reports it, and walking at once when moving', () => {
  const player = new Player();
  const self = { ...player.state, lastSeq: 0, seatId: '' };
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('idle');
  player.applyServer({ ...self, activity: 'drinking' });
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('drinking');
  player.update({ forward: 1, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('walking');
  player.applyServer({ ...self, activity: 'waving' });
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('waving');
  // The server ends the break; there is no client timer.
  for (let i = 0; i < 100; i++) player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('waving');
  player.applyServer({ ...self, activity: 'idle' });
  player.update({ forward: 0, right: 0, run: false }, 0, 0.1);
  expect(player.activity).toBe('idle');
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

it('loads each avatar GLB once and clones it for further views', async () => {
  const load = vi
    .spyOn(GLTFLoader.prototype, 'loadAsync')
    .mockImplementation((url) => loadLocalGltf(url));
  const [a, b] = await Promise.all([AvatarView.load('men_suit'), AvatarView.load('men_suit')]);
  const c = await AvatarView.load('men_suit');
  const avatarLoads = load.mock.calls.filter(([url]) => url === '/assets/avatars/men_suit.glb');
  expect(avatarLoads).toHaveLength(1);
  const skinned = (v: AvatarView) => {
    let found: THREE.SkinnedMesh | undefined;
    v.root.traverse((o) => {
      if (!found && o instanceof THREE.SkinnedMesh) found = o;
    });
    return found!;
  };
  const [ma, mb, mc] = [skinned(a), skinned(b), skinned(c)];
  expect(new Set([ma, mb, mc]).size).toBe(3);
  expect(mb.geometry).toBe(ma.geometry);
  expect(mb.material).not.toBe(ma.material);
  expect(mb.skeleton.bones[0]).not.toBe(ma.skeleton.bones[0]);
  // Each clone animates its own skeleton.
  b.setActivity('walking');
  for (let i = 0; i < 30; i++) b.update(1 / 30);
  expect(b.hasFiniteBones()).toBe(true);
  const dispose = vi.spyOn(mb.material as THREE.Material, 'dispose');
  b.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(b.root.parent).toBeNull();
  expect(a.hasFiniteBones()).toBe(true);
});

const ARM_BONES = ['UpperArmL', 'LowerArmL', 'HandL', 'UpperArmR', 'LowerArmR', 'HandR'];
const bone = (v: AvatarView, name: string) => v.root.getObjectByName(name) as THREE.Bone;
/** Largest angle (rad) between the arm bones of two views of the same preset. */
const armDifference = (a: AvatarView, b: AvatarView) =>
  Math.max(...ARM_BONES.map((n) => bone(a, n).quaternion.angleTo(bone(b, n).quaternion)));
const armPose = (v: AvatarView) => ARM_BONES.map((n) => bone(v, n).quaternion.clone());

it.each(['men_suit', 'women_suit'] as const)(
  'types while working on %s and returns to the seated idle pose within the cross-fade',
  async (avatarId) => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(loadLocalGltf);
    // Same clip timeline on both views: one sits, the other works (T-1219).
    const seated = await AvatarView.load(avatarId);
    const working = await AvatarView.load(avatarId);
    for (const v of [seated, working]) v.root.rotation.y = 1.1;
    seated.setActivity('sitting');
    working.setActivity('working');
    const step = (n: number) => {
      for (let i = 0; i < n; i++) {
        seated.update(1 / 60);
        working.update(1 / 60);
        expect(working.hasFiniteBones()).toBe(true);
      }
    };
    step(150); // Sitting_Enter, then the seated loop with the overlay fully in.
    expect(working.typing).toBe(1);
    expect(seated.typing).toBe(0);
    expect(armDifference(seated, working)).toBeGreaterThan(0.3);
    // The hands move over time (alternating taps), not a frozen pose.
    const first = armPose(working);
    step(7);
    const second = armPose(working);
    expect(Math.max(...first.map((q, i) => q.angleTo(second[i]!)))).toBeGreaterThan(0.02);
    // Hands reach forward toward the keyboard, in front of the shoulders.
    working.root.updateMatrixWorld(true);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
      working.root.getWorldQuaternion(new THREE.Quaternion()),
    );
    for (const side of ['L', 'R']) {
      const reach = bone(working, `Hand${side}`)
        .getWorldPosition(new THREE.Vector3())
        .sub(bone(working, `UpperArm${side}`).getWorldPosition(new THREE.Vector3()))
        .dot(forward);
      expect(reach).toBeGreaterThan(0.25);
    }

    // Stop working: the arms are back on the seated idle pose once the cross-fade is over.
    working.setActivity('sitting');
    const frames = Math.ceil(BALANCE.activity.crossFadeSeconds * 60) + 1;
    const half = Math.floor(frames / 2);
    step(half);
    expect(working.typing).toBeGreaterThan(0);
    expect(armDifference(seated, working)).toBeGreaterThan(1e-3);
    step(frames - half);
    expect(working.typing).toBe(0);
    // Both views now rest the hands on the thighs (T-1614). The mixer skips writing a bone
    // whose clip value did not change, so the reach keeps a trace of the typing pose's twist
    // (well under 0.1 degree).
    expect(armDifference(seated, working)).toBeLessThan(2e-3);
    seated.dispose();
    working.dispose();
  },
);

describe.each(['men_suit', 'women_suit'] as const)(
  'make-coffee motion on %s (T-1611)',
  (avatarId) => {
    it.each([
      ['brewDone', 'idle'],
      ['cancel', 'walking'],
    ] as const)(
      'moves the arms while brewing and returns to the reference pose after %s',
      async (_, after) => {
        vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(loadLocalGltf);
        // Same clip timeline on both views: brewing keeps the idle clip under the overlay.
        const reference = await AvatarView.load(avatarId);
        const brewing = await AvatarView.load(avatarId);
        for (const v of [reference, brewing]) v.root.rotation.y = -0.7;
        reference.setActivity('idle');
        brewing.setActivity('brewing');
        const step = (n: number) => {
          for (let i = 0; i < n; i++) {
            reference.update(1 / 60);
            brewing.update(1 / 60);
            expect(brewing.hasFiniteBones()).toBe(true);
          }
        };
        step(30);
        expect(brewing.brew).toBe(1);
        expect(reference.brew).toBe(0);
        expect(armDifference(reference, brewing)).toBeGreaterThan(0.3);
        // Both hands reach forward toward the machine, in front of the shoulders.
        brewing.root.updateMatrixWorld(true);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(
          brewing.root.getWorldQuaternion(new THREE.Quaternion()),
        );
        for (const side of ['L', 'R']) {
          const reach = bone(brewing, `Hand${side}`)
            .getWorldPosition(new THREE.Vector3())
            .sub(bone(brewing, `UpperArm${side}`).getWorldPosition(new THREE.Vector3()))
            .dot(forward);
          expect(reach).toBeGreaterThan(0.2);
        }
        // The right hand presses over time: the pose changes along the brew.
        const poses: THREE.Quaternion[][] = [];
        for (let i = 0; i < 8; i++) {
          poses.push(armPose(brewing));
          step(9);
        }
        const spread = Math.max(
          ...poses.map((p) => Math.max(...p.map((q, i) => q.angleTo(poses[0]![i]!)))),
        );
        expect(spread).toBeGreaterThan(0.05);

        // brewDone (idle) or cancel (walking): the overlay fades out over the cross-fade.
        reference.setActivity(after);
        brewing.setActivity(after);
        step(Math.ceil(BALANCE.activity.crossFadeSeconds * 60) + 1);
        expect(brewing.brew).toBe(0);
        expect(armDifference(reference, brewing)).toBeLessThan(1e-4);
        reference.dispose();
        brewing.dispose();
      },
    );
  },
);

const POSE_BONES = [...ARM_BONES, 'Chest', 'Neck', 'Head', 'Hips'];
/** Largest bone angle (rad) between two views, over arms, chest, head and hips. */
const poseDifference = (a: AvatarView, b: AvatarView) =>
  Math.max(...POSE_BONES.map((n) => bone(a, n).quaternion.angleTo(bone(b, n).quaternion)));

it('maps every protocol emote to a UAL clip or an overlay', () => {
  expect(Object.keys(EMOTE_SOURCE).sort()).toEqual([...EMOTES].sort());
  for (const id of EMOTES) {
    const source = EMOTE_SOURCE[id];
    if ('clip' in source) expect(source.clip).toBe('Dance_Loop');
    else expect(['wave', 'think', 'laugh', 'stretch']).toContain(source.overlay);
  }
});

it.each(['men_suit', 'women_suit'] as const)(
  'plays every emote on %s standing and seated, without NaN, and fades back',
  async (avatarId) => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(loadLocalGltf);
    const vi_now = vi.spyOn(performance, 'now');
    for (const posture of ['idle', 'working'] as const) {
      for (const id of EMOTES) {
        if (!canEmote(posture, id)) continue;
        const plain = await AvatarView.load(avatarId);
        const emoting = await AvatarView.load(avatarId);
        for (const v of [plain, emoting]) {
          v.root.rotation.y = -0.7;
          v.setActivity(posture);
        }
        const step = (n: number) => {
          for (let i = 0; i < n; i++) {
            vi_now.mockReturnValue(i * 16);
            plain.update(1 / 60);
            emoting.update(1 / 60);
            expect(emoting.hasFiniteBones(), `${posture} ${id}`).toBe(true);
          }
        };
        step(120); // Seated: through Sitting_Enter into the loop.
        emoting.setEmote(id);
        expect(emoting.shownEmote).toBe(id);
        step(40);
        expect(poseDifference(plain, emoting), `${posture} ${id}`).toBeGreaterThan(0.15);
        // The emote ends: overlays fade out over the cross-fade, a clip fades back.
        emoting.setEmote('');
        // A clip emote restarts the activity clip, like a fresh view of that activity.
        const reference = 'clip' in EMOTE_SOURCE[id] ? await AvatarView.load(avatarId) : plain;
        reference.root.rotation.y = -0.7;
        reference.setActivity(posture);
        const frames = Math.ceil((BALANCE.activity.crossFadeSeconds + 0.1) * 60);
        for (let i = 0; i < frames; i++) {
          if (reference !== plain) reference.update(1 / 60);
          step(1);
        }
        // A working avatar resumes typing, so it is compared with a working view.
        expect(poseDifference(reference, emoting), `${posture} ${id} after`).toBeLessThan(0.02);
        for (const v of new Set([plain, emoting, reference])) v.dispose();
      }
    }
  },
);

it.each(['men_suit', 'women_suit'] as const)(
  'owner report 2026-11-18: %s waves and stretches with each hand on its own side',
  async (avatarId) => {
    vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockImplementation(loadLocalGltf);
    for (const emote of ['wave', 'stretch'] as const) {
      const view = await AvatarView.load(avatarId);
      // Turned, so a fixed local axis would not pass by accident.
      view.root.rotation.y = 2.1;
      view.setEmote(emote);
      for (let i = 0; i < 30; i++) view.update(0.05);
      view.root.updateWorldMatrix(true, true);
      const at = (n: string) => view.root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
      const right = at('UpperArmR').sub(at('UpperArmL')).setY(0).normalize();
      const centre = at('UpperArmR').add(at('UpperArmL')).multiplyScalar(0.5);
      // The raised right hand stays right of the body centre, the left one left of it.
      expect(at('HandR').sub(centre).dot(right), `${emote} right hand`).toBeGreaterThan(0.05);
      expect(at('HandR').y, `${emote} right hand raised`).toBeGreaterThan(at('UpperArmR').y);
      if (emote === 'stretch')
        expect(at('HandL').sub(centre).dot(right), `${emote} left hand`).toBeLessThan(-0.05);
      view.dispose();
    }
  },
);
