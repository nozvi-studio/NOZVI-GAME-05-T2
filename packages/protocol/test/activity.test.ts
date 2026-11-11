import { describe, expect, it } from 'vitest';
import { isSeated, nextActivity, statusFor } from '../src/activity';

describe('activity', () => {
  it('walks and stops', () => {
    expect(nextActivity('idle', { type: 'move' })).toBe('walking');
    expect(nextActivity('walking', { type: 'stop' })).toBe('idle');
  });
  it('sits at a desk, toggles work, stands', () => {
    const s = nextActivity('idle', { type: 'sit', kind: 'desk' });
    expect(s).toBe('sitting');
    expect(nextActivity(s, { type: 'toggleWork' })).toBe('working');
    expect(nextActivity('working', { type: 'toggleWork' })).toBe('sitting');
    expect(nextActivity('working', { type: 'stand' })).toBe('idle');
  });
  it('rests on the sofa', () => {
    expect(nextActivity('walking', { type: 'sit', kind: 'sofa' })).toBe('resting');
    expect(nextActivity('resting', { type: 'toggleWork' })).toBe('resting');
  });
  it('ignores moves while seated (caller must stand first)', () => {
    expect(nextActivity('sitting', { type: 'move' })).toBe('sitting');
  });
  it('drinks and waves, moving cancels, actionDone ends', () => {
    expect(nextActivity('idle', { type: 'drink' })).toBe('drinking');
    expect(nextActivity('drinking', { type: 'move' })).toBe('walking');
    expect(nextActivity('idle', { type: 'wave' })).toBe('waving');
    expect(nextActivity('waving', { type: 'actionDone' })).toBe('idle');
    expect(nextActivity('sitting', { type: 'wave' })).toBe('sitting');
  });
  it('maps status', () => {
    expect(statusFor('working')).toBe('working');
    expect(statusFor('resting')).toBe('online');
    expect(isSeated('resting')).toBe(true);
    expect(isSeated('drinking')).toBe(false);
  });
});
