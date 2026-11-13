import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
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

type Template = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };
const templates = new Map<AvatarId, Promise<Template>>();

async function loadTemplate(avatarId: AvatarId): Promise<Template> {
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
  return { scene: gltf.scene, clips };
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
    private readonly materials: THREE.Material[] = [],
  ) {
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.play('idle');
  }

  /**
   * Loads, prepares and retargets each avatar GLB once per `avatarId`; every view after that is
   * a skeleton-aware clone sharing geometry, textures and clips. Materials are cloned per view
   * because players fade their own materials. A failed load is not cached, so a later call
   * retries.
   */
  static async load(avatarId: AvatarId): Promise<AvatarView> {
    let template = templates.get(avatarId);
    if (!template) {
      template = loadTemplate(avatarId);
      templates.set(avatarId, template);
      template.catch(() => {
        if (templates.get(avatarId) === template) templates.delete(avatarId);
      });
    }
    const { scene, clips } = await template;
    const model = cloneSkinned(scene);
    const materials: THREE.Material[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const own = (m: THREE.Material) => {
        const copy = m.clone();
        materials.push(copy);
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    });
    const target = findSkinnedMesh(model)!;
    return new AvatarView(model, target.skeleton.bones, clips, materials);
  }

  /** Test hook: forgets cached templates so the next load parses the GLB again. */
  static clearCache(): void {
    templates.clear();
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
      const hand = fore?.children.find((b) => b.name === 'HandR');
      const t = performance.now() / 1000;
      if (arm && fore && hand) {
        this.root.updateWorldMatrix(true, true);
        const heading = this.root.getWorldQuaternion(new THREE.Quaternion());
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(heading);
        const raised = new THREE.Vector3(0.35, 0.9, 0).normalize().applyQuaternion(heading);
        this.pointBone(arm, fore, raised);
        this.pointBone(fore, hand, up);
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(heading);
        const inverseParent = fore.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
        forward.applyQuaternion(inverseParent);
        fore.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(forward, Math.sin(t * 10) * 0.4),
        );
        fore.updateWorldMatrix(false, true);
      }
    }
  }

  private pointBone(bone: THREE.Bone, end: THREE.Object3D, direction: THREE.Vector3): void {
    const current = end
      .getWorldPosition(new THREE.Vector3())
      .sub(bone.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
    worldRotation.premultiply(new THREE.Quaternion().setFromUnitVectors(current, direction));
    const inverseParent = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(worldRotation.premultiply(inverseParent));
    bone.updateWorldMatrix(false, true);
  }

  /**
   * Stops animation, detaches the model and frees this view's own materials. Geometry and
   * textures belong to the shared per-avatar template and stay alive for later clones.
   */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.root.removeFromParent();
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
  }

  hasFiniteBones(): boolean {
    return this.bones.every((b) =>
      [...b.position.toArray(), ...b.quaternion.toArray()].every(Number.isFinite),
    );
  }
}
