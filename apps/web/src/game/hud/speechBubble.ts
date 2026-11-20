import { BALANCE } from '@office/protocol';

/** The fields of a live chat message the bubble rules read (`ChatEntry` in practice). */
export type BubbleMessage = {
  readonly sessionId: string;
  readonly text: string;
  /** Server epoch ms when the server accepted the message. */
  readonly sentAt: number;
  /** Local epoch ms when this client first saw it. */
  readonly receivedAt: number;
};

const ELLIPSIS = '…';

/**
 * REQ-CHAT-003: bubble text cut to `max` characters (code points, so an emoji is never
 * split), the last one an ellipsis when the message is longer.
 */
export function bubbleText(text: string, max: number = BALANCE.chat.bubbleMaxChars): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return (
    chars
      .slice(0, Math.max(0, max - 1))
      .join('')
      .trimEnd() + ELLIPSIS
  );
}

/**
 * Whether a message still shows as a bubble: for `seconds` after it was sent on the server
 * clock, and never longer than `seconds` after this client first saw it (so a skewed clock
 * estimate cannot stretch it). A late joiner sees no bubble for an old message.
 */
export function bubbleLive(
  message: BubbleMessage,
  localNow: number,
  serverNow: number,
  seconds: number = BALANCE.chat.bubbleSeconds,
): boolean {
  const ms = seconds * 1000;
  return localNow - message.receivedAt < ms && serverNow - message.sentAt < ms;
}

/**
 * REQ-CHAT-003: the bubble text per sender session. Only each sender's newest live message
 * counts (a newer one replaces the older bubble); when that one has expired the sender has
 * no bubble, even if an older message is still listed. A message the server removed is not
 * in `messages`, so its bubble goes at once. `messages` are oldest first, as in state.
 */
export function speechBubbles(
  messages: readonly BubbleMessage[],
  localNow: number,
  serverNow: number,
  seconds: number = BALANCE.chat.bubbleSeconds,
  maxChars: number = BALANCE.chat.bubbleMaxChars,
): Map<string, string> {
  const bubbles = new Map<string, string>();
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (seen.has(m.sessionId)) continue;
    seen.add(m.sessionId);
    if (bubbleLive(m, localNow, serverNow, seconds))
      bubbles.set(m.sessionId, bubbleText(m.text, maxChars));
  }
  return bubbles;
}
