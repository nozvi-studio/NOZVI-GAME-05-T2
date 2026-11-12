// Ported from spike/poc/avatar/src/retarget.ts (validated in PoC, see DECISIONS).
import * as THREE from 'three';

// Target bone name -> source bone name, using the names in the exported GLBs.
const BODY_BONES: Record<string, string> = {
  Root: 'root',
  Hips: 'DEF-hips',
  Abdomen: 'DEF-spine001',
  Torso: 'DEF-spine002',
  Chest: 'DEF-spine003',
  Neck: 'DEF-neck',
  Head: 'DEF-head',
};

function boneMap(female: boolean): Record<string, string> {
  const names = { ...BODY_BONES };
  for (const side of ['L', 'R']) {
    for (const [target, source] of [
      ['Shoulder', 'shoulder'],
      ['UpperArm', 'upper_arm'],
      ['LowerArm', 'forearm'],
      ['Hand', 'hand'],
      ['UpperLeg', 'thigh'],
      ['LowerLeg', 'shin'],
      ['Foot', 'foot'],
    ]) {
      names[`${target}${side}`] = `DEF-${source}${side}`;
    }
    for (const [target, source] of [
      ['Index', 'f_index'],
      ['Middle', 'f_middle'],
      ['Ring', 'f_ring'],
      ['Pinky', 'f_pinky'],
      ['Thumb', 'thumb'],
    ]) {
      for (let index = 1; index <= (!female && target === 'Thumb' ? 2 : 3); index++) {
        const sourceIndex = !female && target === 'Thumb' ? index + 1 : index;
        names[`${target}${female ? index : index + 1}${side}`] =
          `DEF-${source}0${sourceIndex}${side}`;
      }
    }
  }
  return names;
}

export const BONE_MAP_MEN = boneMap(false);
export const BONE_MAP_WOMEN = boneMap(true);

export function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((obj) => {
    if (!found && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
      found = obj as THREE.SkinnedMesh;
    }
  });
  return found;
}

export function retargetClipFromRestPose(
  targetMesh: THREE.SkinnedMesh,
  sourceMesh: THREE.SkinnedMesh,
  clip: THREE.AnimationClip,
  isFemale = false,
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const sourceBones = new Map(sourceMesh.skeleton.bones.map((bone) => [bone.name, bone]));
  const targetBones = new Map(targetMesh.skeleton.bones.map((bone) => [bone.name, bone]));
  const names = isFemale ? BONE_MAP_WOMEN : BONE_MAP_MEN;
  const sourceRestWorld = new Map<THREE.Object3D, THREE.Quaternion>();
  const targetRestWorld = new Map<THREE.Object3D, THREE.Quaternion>();
  const animatedTracks = new Map(clip.tracks.map((track) => [track.name, track]));
  const rotationTracks = clip.tracks.filter((track) => track.name.endsWith('.quaternion'));
  const times = [...new Set(rotationTracks.flatMap((track) => Array.from(track.times)))].sort(
    (a, b) => a - b,
  );
  const interpolants = new Map(
    rotationTracks.map((track) => [
      track.name,
      (
        track as THREE.KeyframeTrack & { createInterpolant: () => THREE.Interpolant }
      ).createInterpolant(),
    ]),
  );
  const sourceWorldCache = new Map<string, THREE.Quaternion>();
  const targetWorldCache = new Map<string, THREE.Quaternion>();
  const restWorld = (bone: THREE.Object3D, cache: Map<THREE.Object3D, THREE.Quaternion>) => {
    let rotation = cache.get(bone);
    if (!rotation) {
      rotation = bone.getWorldQuaternion(new THREE.Quaternion());
      cache.set(bone, rotation);
    }
    return rotation;
  };
  const animatedSourceWorld = (bone: THREE.Object3D, time: number): THREE.Quaternion => {
    const key = `${bone.uuid}:${time}`;
    const cached = sourceWorldCache.get(key);
    if (cached) return cached;
    const parent = bone.parent ? animatedSourceWorld(bone.parent, time) : new THREE.Quaternion();
    const sample = interpolants.get(`${bone.name}.quaternion`);
    const local = sample
      ? new THREE.Quaternion().fromArray(sample.evaluate(time)).normalize()
      : bone.quaternion;
    const world = parent.clone().multiply(local);
    sourceWorldCache.set(key, world);
    return world;
  };
  const animatedTargetWorld = (bone: THREE.Object3D, time: number): THREE.Quaternion => {
    const key = `${bone.uuid}:${time}`;
    const cached = targetWorldCache.get(key);
    if (cached) return cached;
    const parent = bone.parent ? animatedTargetWorld(bone.parent, time) : new THREE.Quaternion();
    const source = sourceBones.get(names[bone.name]!);
    const world =
      source && bone.name !== 'Root'
        ? animatedSourceWorld(source, time)
            .clone()
            .multiply(restWorld(source, sourceRestWorld).clone().invert())
            .multiply(restWorld(bone, targetRestWorld))
        : parent.clone().multiply(bone.quaternion);
    targetWorldCache.set(key, world);
    return world;
  };

  for (const [targetName, sourceName] of Object.entries(names)) {
    if (targetName === 'Root') continue; // Keep the character's exported world orientation.
    const target = targetBones.get(targetName);
    const source = sourceBones.get(sourceName);
    if (!target || !source) continue;

    const rotation = animatedTracks.get(`${sourceName}.quaternion`);
    if (rotation) {
      const values = new Float32Array(times.length * 4);
      for (let index = 0; index < times.length; index++) {
        const parentWorld = target.parent
          ? animatedTargetWorld(target.parent, times[index]!)
          : new THREE.Quaternion();
        parentWorld
          .clone()
          .invert()
          .multiply(animatedTargetWorld(target, times[index]!))
          .normalize()
          .toArray(values, index * 4);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${targetName}.quaternion`, times, values));
    }

    if (targetName === 'Hips') {
      const position = animatedTracks.get(`${sourceName}.position`);
      if (!position) continue;
      const values = new Float32Array(position.values.length);
      for (let index = 0; index < values.length; index += 3) {
        // Source hips use Z for height; the character rig uses Y at 100x scale.
        values[index] = target.position.x + (position.values[index]! - source.position.x) * 0.01;
        values[index + 1] =
          target.position.y + (position.values[index + 2]! - source.position.z) * 0.01;
        values[index + 2] =
          target.position.z - (position.values[index + 1]! - source.position.y) * 0.01;
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${targetName}.position`, position.times, values));
      // Some character exports parent thighs beside Hips, so they need the same root motion.
      for (const legName of ['UpperLegL', 'UpperLegR']) {
        const leg = targetBones.get(legName);
        if (!leg || leg.parent !== target.parent) continue;
        const legValues = new Float32Array(values.length);
        for (let index = 0; index < values.length; index += 3) {
          legValues[index] = leg.position.x + values[index]! - target.position.x;
          legValues[index + 1] = leg.position.y + values[index + 1]! - target.position.y;
          legValues[index + 2] = leg.position.z + values[index + 2]! - target.position.z;
        }
        tracks.push(
          new THREE.VectorKeyframeTrack(`${legName}.position`, position.times, legValues),
        );
      }
    }
  }
  if (tracks.length === 0) throw new Error(`No matching animation tracks for ${clip.name}`);
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
