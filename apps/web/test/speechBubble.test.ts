import { describe, expect, it } from 'vitest';
import { BALANCE } from '@office/protocol';
import {
  bubbleLive,
  bubbleText,
  speechBubbles,
  type BubbleMessage,
} from '../src/game/hud/speechBubble';

// T-1698 (REQ-CHAT-003): which message shows above whom, cut how, and for how long.

const SECONDS = BALANCE.chat.bubbleSeconds;
const MAX = BALANCE.chat.bubbleMaxChars;
const T0 = 1_000_000;

const msg = (sessionId: string, text: string, at = T0): BubbleMessage => ({
  sessionId,
  text,
  sentAt: at,
  receivedAt: at,
});

describe('bubbleText (T-1698)', () => {
  it('keeps text up to bubbleMaxChars unchanged', () => {
    expect(MAX).toBe(80);
    expect(bubbleText('hello')).toBe('hello');
    const exact = 'x'.repeat(MAX);
    expect(bubbleText(exact)).toBe(exact);
  });

  it('cuts longer text to bubbleMaxChars with an ellipsis', () => {
    const cut = bubbleText('y'.repeat(MAX + 1));
    expect(Array.from(cut)).toHaveLength(MAX);
    expect(cut).toBe('y'.repeat(MAX - 1) + '…');
    expect(bubbleText('abcdef', 4)).toBe('abc…');
    // No dangling space before the ellipsis.
    expect(bubbleText('ab cdef', 4)).toBe('ab…');
  });

  it('counts code points, so an emoji is never split', () => {
    const cut = bubbleText('😀'.repeat(MAX + 5));
    expect(Array.from(cut)).toHaveLength(MAX);
    expect(cut.endsWith('😀…')).toBe(true);
  });
});

describe('bubbleLive (T-1698)', () => {
  it('shows a message for bubbleSeconds after it was sent', () => {
    expect(SECONDS).toBe(6);
    const m = msg('a', 'hi');
    expect(bubbleLive(m, T0, T0)).toBe(true);
    expect(bubbleLive(m, T0 + 5_999, T0 + 5_999)).toBe(true);
    expect(bubbleLive(m, T0 + 6_000, T0 + 6_000)).toBe(false);
  });

  it('a late joiner sees no bubble for an old message', () => {
    const old = { ...msg('a', 'hi', T0), receivedAt: T0 + 30_000 };
    expect(bubbleLive(old, T0 + 30_000, T0 + 30_000)).toBe(false);
  });

  it('a slow clock estimate never stretches the bubble past the local first-seen time', () => {
    const m = msg('a', 'hi');
    expect(bubbleLive(m, T0 + 6_000, T0 + 1_000)).toBe(false);
  });
});

describe('speechBubbles (T-1698)', () => {
  it('one bubble per sender with that sender’s newest message', () => {
    const bubbles = speechBubbles(
      [msg('a', 'first', T0), msg('b', 'bob'), msg('a', 'second', T0 + 1_000)],
      T0 + 1_000,
      T0 + 1_000,
    );
    expect(Object.fromEntries(bubbles)).toEqual({ a: 'second', b: 'bob' });
  });

  it('a newer message replaces the bubble; when it expires no older one comes back', () => {
    const first = msg('a', 'first', T0);
    const second = msg('a', 'second', T0 + 4_000);
    expect(speechBubbles([first, second], T0 + 4_000, T0 + 4_000).get('a')).toBe('second');
    // At T0 + 10 s the newer one expires too; the first must not reappear.
    expect(speechBubbles([first, second], T0 + 10_000, T0 + 10_000).has('a')).toBe(false);
    // Even if the newest is expired while an older is still within its time (clock skew).
    expect(
      speechBubbles([msg('a', 'old', T0 + 5_000), { ...second, receivedAt: T0 }], T0 + 6_000, T0)
        .size,
    ).toBe(0);
  });

  it('a message removed from state removes its bubble at once', () => {
    const m = msg('a', 'gone soon');
    expect(speechBubbles([m], T0 + 1_000, T0 + 1_000).get('a')).toBe('gone soon');
    expect(speechBubbles([], T0 + 1_000, T0 + 1_000).size).toBe(0);
  });

  it('cuts the bubble text, the panel keeps the full message', () => {
    const long = 'z'.repeat(200);
    expect(speechBubbles([msg('a', long)], T0, T0).get('a')).toBe(bubbleText(long));
  });
});
