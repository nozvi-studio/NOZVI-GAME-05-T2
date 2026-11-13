import * as THREE from 'three';
import type { OfficeLayout } from '@office/protocol';

const WIDTH_M = 0.9;
const HEIGHT_M = 0.45;
const CENTER_Y = 1.6;
/** Gap between the board and the wall face, against z-fighting. */
const WALL_GAP = 0.01;

/** Text drawn on the decorative entrance board (REQ-UI-003). */
export const onlineBoardText = (count: number): string => `Online: ${count}`;

/**
 * Board pose on the inner face of the wall that closes the entrance zone, centered on the
 * zone along that wall. Faces into the room (+Z).
 */
export function entranceBoardPose(layout: OfficeLayout): { x: number; y: number; z: number } {
  const zone = layout.zones.find((z) => z.id === 'Entrance');
  if (!zone) throw new Error('Layout has no Entrance zone');
  const x = (zone.bounds.minX + zone.bounds.maxX) / 2;
  const edge = zone.bounds.minZ;
  let best: { z: number; dist: number } | undefined;
  for (const wall of layout.walls) {
    const [w, , d] = wall.size;
    const [wx, , wz] = wall.position;
    if (d >= w || Math.abs(x - wx) > w / 2) continue; // only walls running along X at this x
    const dist = Math.abs(wz - edge);
    if (!best || dist < best.dist) best = { z: wz + d / 2, dist };
  }
  if (!best) throw new Error('No wall behind the entrance zone');
  return { x, y: CENTER_Y, z: best.z + WALL_GAP };
}

/**
 * One unlit plane with a canvas texture showing the online count; display only, no
 * interaction. Costs one draw call (it casts no shadow) and redraws only when the count changes.
 */
export class EntranceBoard {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private shown: number | undefined;

  constructor(layout: OfficeLayout) {
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH_M, HEIGHT_M),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    this.mesh.name = 'entrance_board';
    const { x, y, z } = entranceBoardPose(layout);
    this.mesh.position.set(x, y, z);
    this.set(0);
  }

  /** The text currently drawn on the board. */
  get text(): string {
    return onlineBoardText(this.shown ?? 0);
  }

  set(count: number): void {
    if (count === this.shown) return;
    this.shown = count;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.fillStyle = '#222426';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#8a8f96';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    ctx.fillStyle = '#7ee08a';
    ctx.font = '600 88px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(onlineBoardText(count), width / 2, height / 2);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture.dispose();
  }
}
