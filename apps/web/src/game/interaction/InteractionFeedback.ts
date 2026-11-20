import * as THREE from 'three';
import { BALANCE, type Interactable, type PlayerState } from '@office/protocol';
import type { LiftResult } from '../assets/furnitureLift';
import { swingDoors } from './doorSwing';
import { TargetHighlight } from './highlight';
import { easeOpen, Openables } from './openables';

/**
 * Placement id drawn for an interactable whose layout item is not the model (the coffee
 * machine is a decor model on the pantry counter, T-1158). Others use `itemId`.
 */
const MODEL_ID: Readonly<Record<string, string>> = { coffee_machine: 'pantry_coffee_machine' };

export function modelId(target: Interactable): string {
  return MODEL_ID[target.id] ?? target.itemId;
}

/** What the scene side needs from the loaded furniture (`FurnitureHandle`). */
export type LiftSource = {
  lift(id: string): LiftResult | undefined;
  drop(id: string): THREE.Mesh[];
};

export type FeedbackDeps = {
  /** The interactable the prompt names (`InteractionController.focusTarget`). */
  focus(): Interactable | null;
  player(): PlayerState;
  /** Loaded furniture, or undefined while the models load. */
  furniture(): LiftSource | undefined;
  /** Camera occluder list; lifted meshes join it while they are in the scene. */
  occluders: THREE.Object3D[];
  /** Restores camera-hidden instances before instance matrices change. */
  releaseOccluders(): void;
};

export type FeedbackSnapshot = {
  /** Interactable id of the highlighted target, or null. */
  highlighted: string | null;
  /** Meshes drawn with the highlight tint. */
  tintedMeshes: number;
  /** Local open state per openable interactable id. */
  open: Record<string, boolean>;
  /** Furniture ids lifted out of their instances right now. */
  lifted: string[];
};

/**
 * REQ-INT-001/004/005 (T-1156): local interaction feedback in the scene. Highlights the
 * focused target, swings cabinet, fridge and main-door leaves from `Openables`, and delays
 * the door exit until the swing is seen. Presentation only: nothing here is sent or
 * replicated, and collision never changes.
 */
export class InteractionFeedback {
  readonly openables = new Openables();
  private readonly highlight = new TargetHighlight();
  private readonly lifted = new Set<string>();
  /** Openable ids swung last frame; one that closed gets a last swing to 0. */
  private swung = new Set<string>();
  private highlighted: Interactable | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly deps: FeedbackDeps) {}

  /** E at a cabinet or fridge. */
  toggle(target: Interactable): void {
    this.openables.toggle(target.id);
  }

  /** True while a cabinet, fridge or door leaf swung this frame (shadow map redraw). */
  get swinging(): boolean {
    return this.swung.size > 0;
  }

  /** True while the door exit is waiting for the swing. */
  get exiting(): boolean {
    return this.exitTimer !== undefined;
  }

  /**
   * REQ-INT-005: E at the main door swings it open, then leaves the room after
   * `doorExitSeconds`. A second E while waiting does nothing.
   */
  exitThroughDoor(door: Interactable, leave: () => void): void {
    if (this.exitTimer !== undefined) return;
    this.openables.set(door.id, true);
    this.exitTimer = setTimeout(() => {
      this.exitTimer = undefined;
      leave();
    }, BALANCE.interactionView.doorExitSeconds * 1000);
  }

  update(dt: number): void {
    this.openables.update(dt, this.deps.player());
    const furniture = this.deps.furniture();
    if (!furniture) return;
    const focus = this.deps.focus();
    // Model objects this frame, by furniture id; lifted ones not needed any more are dropped.
    const objects = new Map<string, THREE.Object3D>();
    const ensure = (target: Interactable): THREE.Object3D | undefined => {
      const id = modelId(target);
      const known = objects.get(id);
      if (known) return known;
      const before = this.lifted.has(id);
      if (!before) this.deps.releaseOccluders();
      const result = furniture.lift(id);
      if (!result) return undefined;
      if (!before && result.added.length > 0) {
        this.lifted.add(id);
        this.deps.occluders.push(...result.added);
      }
      objects.set(id, result.object);
      return result.object;
    };
    const focusObject = focus ? ensure(focus) : undefined;
    const swinging = new Set([...this.swung, ...this.openables.active()]);
    this.swung = new Set(this.openables.active());
    for (const id of swinging) {
      const target = this.openables.target(id);
      const object = target ? ensure(target) : undefined;
      const kind = this.openables.kind(id);
      if (!object || !kind) continue;
      const angle = THREE.MathUtils.degToRad(BALANCE.interactionView.openAngleDeg[kind]);
      swingDoors(object, angle * easeOpen(this.openables.progress(id)));
    }
    // A lifted copy is kept until its swing is back at 0, so a dropped copy is closed.
    for (const id of [...this.lifted]) if (!objects.has(id)) this.drop(furniture, id);
    this.highlighted = focusObject ? focus : null;
    this.highlight.set(focusObject ?? null);
  }

  private drop(furniture: LiftSource, id: string): void {
    if (this.highlight.current && this.highlight.current.name === id) this.highlight.clear();
    this.deps.releaseOccluders();
    const removed = new Set<THREE.Object3D>(furniture.drop(id));
    for (let i = this.deps.occluders.length - 1; i >= 0; i--) {
      if (removed.has(this.deps.occluders[i]!)) this.deps.occluders.splice(i, 1);
    }
    this.lifted.delete(id);
  }

  snapshot(): FeedbackSnapshot {
    return {
      highlighted: this.highlighted?.id ?? null,
      tintedMeshes: this.highlight.tintedMeshes,
      open: this.openables.snapshot(),
      lifted: [...this.lifted],
    };
  }

  dispose(): void {
    if (this.exitTimer !== undefined) clearTimeout(this.exitTimer);
    this.exitTimer = undefined;
    this.highlight.dispose();
    const furniture = this.deps.furniture();
    if (furniture) for (const id of [...this.lifted]) this.drop(furniture, id);
    this.lifted.clear();
  }
}
