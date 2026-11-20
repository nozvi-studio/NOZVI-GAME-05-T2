import * as THREE from 'three';
import { BALANCE } from '@office/protocol';

let blobShadow: { geometry: THREE.CircleGeometry; material: THREE.MeshBasicMaterial } | null = null;

/**
 * T-1161: avatars do not cast real shadows (each caster costs one shadow-pass draw call
 * per part); a soft dark disc on the floor stands in for one draw call. Geometry and material
 * are shared by every avatar and never disposed. The fade comes from per-vertex alpha: centre
 * opaque, rim transparent.
 */
export function createBlobShadow(): THREE.Mesh {
  if (!blobShadow) {
    const geometry = new THREE.CircleGeometry(BALANCE.movement.capsuleRadius * 1.6, 20);
    const count = geometry.getAttribute('position').count;
    const rgba = new Float32Array(count * 4);
    // CircleGeometry: vertex 0 is the centre, the rest are on the rim.
    rgba[3] = 1;
    geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    blobShadow = { geometry, material };
  }
  const mesh = new THREE.Mesh(blobShadow.geometry, blobShadow.material);
  mesh.name = 'blob-shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
