import { describe, expect, it } from 'vitest';
import { appendChat, expireChat } from '../src/sim/chat';

type Entry = { id: string; sentAt: number };
const entry = (id: number, sentAt: number): Entry => ({ id: String(id), sentAt });

describe('chat log (REQ-CHAT-001, REQ-CHAT-002)', () => {
  it('appends oldest first and drops the oldest when full', () => {
    const list: Entry[] = [];
    for (let i = 1; i <= 3; i++) appendChat(list, entry(i, i), 3);
    expect(list.map((e) => e.id)).toEqual(['1', '2', '3']);
    appendChat(list, entry(4, 4), 3);
    expect(list.map((e) => e.id)).toEqual(['2', '3', '4']);
  });

  it('removes entries exactly when now - sentAt reaches the TTL', () => {
    const list = [entry(1, 0), entry(2, 100), entry(3, 200)];
    expect(expireChat(list, 59_999, 60_000)).toBe(0);
    expect(expireChat(list, 60_000, 60_000)).toBe(1);
    expect(list.map((e) => e.id)).toEqual(['2', '3']);
    expect(expireChat(list, 60_200, 60_000)).toBe(2);
    expect(list).toEqual([]);
  });

  it('removes every expired entry even when sentAt is out of order', () => {
    const list = [entry(1, 500), entry(2, 0), entry(3, 900)];
    expireChat(list, 1_000, 500);
    expect(list.map((e) => e.id)).toEqual(['3']);
  });
});
