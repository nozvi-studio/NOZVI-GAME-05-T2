import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BALANCE, type Activity, type AvatarId } from '@office/protocol';
import { findSkinnedMesh, retargetClipFromRestPose } from './retarget';

export const CLIP_FOR: Record<Activity, { clip: string; loop: boolean }> = {
  idle: { clip: 'Idle_Loop', loop: true },
  walking: { clip: 'Walk_Loop', loop: true },
  sitting: { clip: 'Sitting_Idle_Loop', loop: true },
  working: { clip: 'Sitting_Idle_Loop', loop: true },
  resting: { clip: 'Sitting_Idle_Loop', loop: true },
  drinking: { clip: 'Interact', loop: false },
  waving: { clip: 'Idle_Loop', loop: true }, // Arm is overridden procedurally.
};

const loader = new GLTFLoader();
let ualPromise: Promise<{ mesh: THREE.SkinnedMesh; clips: THREE.AnimationClip[] }> | null = null;
function loadUal() {
  ualPromise ??= loader.loadAsync('/assets/anim/ual.glb').then((g) => {
    const mesh = findSkinnedMesh(g.scene);
    if (!mesh) throw new Error('UAL skinned mesh missing');
    return { mesh, clips: g.animations };
  });
  return ualPromise;
}

export class AvatarView {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private activity: Activity = 'idle';
  private waveTime = 0;

  private constructor(
    model: THREE.Object3D,
    private readonly bones: THREE.Bone[],
    clips: THREE.AnimationClip[],
  ) {
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle');
  }

  static async load(avatarId: AvatarId): Promise<AvatarView> {
    const [gltf, ual] = await Promise.all([
      loader.loadAsync(`/assets/avatars/${avatarId}.glb`),
      loadUal(),
    ]);
    const target = findSkinnedMesh(gltf.scene);
    if (!target) throw new Error(`No skinned mesh in ${avatarId}`);
    target.skeleton.pose();
    const names = new Set(
      Object.values(CLIP_FOR)
        .map((c) => c.clip)
        .concat('Sitting_Enter', 'Sitting_Exit'),
    );
    const clips = ual.clips
      .filter((c) => names.has(c.name))
      .map((c) => retargetClipFromRestPose(target, ual.mesh, c, avatarId === 'women_suit'));
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      // The exported skin bounds do not follow animated bones (also disabled in the PoC).
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    });
    return new AvatarView(gltf.scene, target.skeleton.bones, clips);
  }

  setActivity(a: Activity): void {
    if (a === this.activity) return;
    const wasSeated =
      this.activity === 'sitting' || this.activity === 'working' || this.activity === 'resting';
    const seated = a === 'sitting' || a === 'working' || a === 'resting';
    this.activity = a;
    if (a === 'waving') this.waveTime = BALANCE.activity.waveSeconds;
    if (seated && !wasSeated) this.playOnce('Sitting_Enter', a);
    else if (!seated && wasSeated) this.playOnce('Sitting_Exit', a);
    else this.play(a);
  }

  private play(a: Activity): void {
    const spec = CLIP_FOR[a];
    this.fadeTo(spec.clip, spec.loop);
  }

  private playOnce(clip: string, then: Activity): void {
    const action = this.fadeTo(clip, false);
    if (!action) return this.play(then);
    const onDone = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== action) return;
      this.mixer.removeEventListener('finished', onDone);
      if (this.activity === then) this.play(then);
    };
    this.mixer.addEventListener('finished', onDone);
  }

  private fadeTo(clip: string, loop: boolean): THREE.AnimationAction | null {
    const next = this.actions.get(clip);
    if (!next) return null;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop;
    next.play();
    if (this.current && this.current !== next)
      this.current.crossFadeTo(next, BALANCE.activity.crossFadeSeconds, false);
    this.current = next;
    return next;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    if (this.activity === 'waving' && this.waveTime > 0) {
      this.waveTime -= dt;
      // GLTFLoader sanitizes the exported UpperArm.R / LowerArm.R names by removing dots.
      const arm = this.bones.find((b) => b.name === 'UpperArmR');
      const fore = this.bones.find((b) => b.name === 'LowerArmR');
      const t = performance.now() / 1000;
      if (arm) arm.rotation.set(0, 0, -2.4);
      if (fore) fore.rotation.set(0, 0, -0.4 + Math.sin(t * 10) * 0.4);
    }
  }

  hasFiniteBones(): boolean {
    return this.bones.every((b) =>
      [...b.position.toArray(), ...b.quaternion.toArray()].every(Number.isFinite),
    );
  }
}
