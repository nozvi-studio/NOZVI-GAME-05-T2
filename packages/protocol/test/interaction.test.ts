import { describe, expect, it } from 'vitest';
import { findInteractionTarget } from '../src/interaction';
import { officeLayout } from '../src/layout/layout';

const chairs = officeLayout.interactables.filter((i) => i.type === 'chair');
const N = Math.PI; // heading toward -Z
const S = 0;

describe('findInteractionTarget', () => {
  it('picks ws_1 when facing north from the shared approach point', () => {
    const t = findInteractionTarget({ x: -3.9, z: 2.46, heading: N }, chairs);
    expect(t?.id).toBe('ws_1_chair');
  });
  it('picks ws_3 when facing south from the same point', () => {
    const t = findInteractionTarget({ x: -3.9, z: 2.46, heading: S }, chairs);
    expect(t?.id).toBe('ws_3_chair');
  });
  it('returns null when out of range', () => {
    expect(findInteractionTarget({ x: 4.8, z: -3.6, heading: S }, chairs)).toBeNull();
  });
  it('returns null when facing away', () => {
    const door = officeLayout.interactables.filter((i) => i.type === 'main_door');
    expect(findInteractionTarget({ x: -0.46, z: -3.8, heading: S }, door)).toBeNull();
    expect(findInteractionTarget({ x: -0.46, z: -3.8, heading: N }, door)?.id).toBe('main_door');
  });
});
