import * as THREE from 'three';
import type { FurniturePlacement } from './loadFurniture';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

type Entry =
  | { kind: 'object'; object: THREE.Object3D }
  | {
      kind: 'instance';
      source: THREE.Object3D;
      placement: FurniturePlacement;
      meshes: THREE.InstancedMesh[];
      index: number;
    };

type Lifted = { group: THREE.Group; saved: THREE.Matrix4[] };

export type LiftResult = {
  object: THREE.Object3D;
  /** Meshes that entered the scene with this call (empty for a model that was already its own object). */
  added: THREE.Mesh[];
};

const meshesOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return meshes;
};

/**
 * T-1156: gives one placed furniture item its own object so it can be highlighted and its
 * doors animated. An item drawn by itself is returned as is. An item drawn as one instance
 * of shared `InstancedMesh` parts (T-1148) is "lifted": its instances collapse to a zero
 * matrix (as `OccluderHider` does) and a fitted copy of the model takes its place, at the
 * same world matrices. `drop` puts the instances back. Only lifted items cost extra draw
 * calls, and only while lifted.
 *
 * Callers must restore camera-hidden instances first (`CameraRig.releaseOccluders`): the
 * hider would otherwise put a saved matrix back over a collapsed one.
 */
export class FurnitureLift {
  private readonly entries = new Map<string, Entry>();
  private readonly lifted = new Map<string, Lifted>();

  constructor(
    private readonly room: THREE.Object3D,
    /** `fitModel` from `loadFurniture.ts` (passed in to keep the modules acyclic). */
    private readonly fit: (
      source: THREE.Object3D,
      box: FurniturePlacement['box'],
      rotY: number,
      contain?: boolean,
    ) => THREE.Group,
  ) {}

  registerObject(id: string, object: THREE.Object3D): void {
    this.entries.set(id, { kind: 'object', object });
  }

  registerInstances(
    source: THREE.Object3D,
    placements: FurniturePlacement[],
    meshes: THREE.InstancedMesh[],
  ): void {
    placements.forEach((placement, index) =>
      this.entries.set(placement.box.id, { kind: 'instance', source, placement, meshes, index }),
    );
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  isLifted(id: string): boolean {
    return this.lifted.has(id);
  }

  lift(id: string): LiftResult | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    if (entry.kind === 'object') return { object: entry.object, added: [] };
    const current = this.lifted.get(id);
    if (current) return { object: current.group, added: [] };
    const { source, placement, meshes, index } = entry;
    const group = this.fit(source, placement.box, placement.rotY, placement.contain);
    const saved = meshes.map((mesh) => {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(index, matrix);
      mesh.setMatrixAt(index, ZERO);
      mesh.instanceMatrix.needsUpdate = true;
      return matrix;
    });
    this.room.add(group);
    this.lifted.set(id, { group, saved });
    return { object: group, added: meshesOf(group) };
  }

  /** Puts a lifted item back into its instances; returns the meshes that left the scene. */
  drop(id: string): THREE.Mesh[] {
    const lifted = this.lifted.get(id);
    const entry = this.entries.get(id);
    if (!lifted || entry?.kind !== 'instance') return [];
    entry.meshes.forEach((mesh, k) => {
      mesh.setMatrixAt(entry.index, lifted.saved[k]!);
      mesh.instanceMatrix.needsUpdate = true;
    });
    lifted.group.removeFromParent();
    this.lifted.delete(id);
    return meshesOf(lifted.group);
  }

  /** Ids lifted right now. */
  liftedIds(): string[] {
    return [...this.lifted.keys()];
  }

  dispose(): void {
    for (const id of this.liftedIds()) this.drop(id);
    this.entries.clear();
  }
}
