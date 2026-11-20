import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BALANCE, MSG, SERVER_MSG, type ChatRateLimitedNotice } from '@office/protocol';
import {
  ChatStore,
  chatRateLimitMessage,
  type ChatEntry,
  type ChatRoom,
  type ChatSource,
  type ReplicatedChatMessage,
} from '../src/net/chat';
import { ChatMessageList, ChatPanel } from '../src/ui/ChatPanel';

// T-1695 (REQ-CHAT-001/002): the chat store over room state and the chat panel.

/** In-memory stand-in for `room.state.chat` callbacks (several subscribers). */
class FakeChat implements ChatSource {
  readonly messages: ReplicatedChatMessage[] = [];
  private readonly adds = new Set<(m: ReplicatedChatMessage) => void>();
  private readonly removes = new Set<(m: ReplicatedChatMessage) => void>();
  private next = 1;
  onAdd(h: (m: ReplicatedChatMessage) => void) {
    this.adds.add(h);
    for (const m of this.messages) h(m);
    return () => void this.adds.delete(h);
  }
  onRemove(h: (m: ReplicatedChatMessage) => void) {
    this.removes.add(h);
    return () => void this.removes.delete(h);
  }
  post(sessionId: string, name: string, text: string, sentAt = 1_000): ReplicatedChatMessage {
    const m = { id: `m${this.next++}`, sessionId, name, text, sentAt };
    this.messages.push(m);
    for (const h of this.adds) h(m);
    return m;
  }
  expire(m: ReplicatedChatMessage) {
    this.messages.splice(this.messages.indexOf(m), 1);
    for (const h of this.removes) h(m);
  }
  get listeners() {
    return this.adds.size + this.removes.size;
  }
}

/** Records sends and lets a test push the server's `chat_rate_limited` notice. */
class FakeRoom implements ChatRoom {
  readonly sent: { type: string; message: unknown }[] = [];
  private readonly notices = new Set<(n: ChatRateLimitedNotice) => void>();
  failing = false;
  send(type: typeof MSG.chat, message: { text: string }) {
    if (this.failing) throw new Error('socket closed');
    this.sent.push({ type, message });
  }
  onMessage(type: typeof SERVER_MSG.chatRateLimited, cb: (n: ChatRateLimitedNotice) => void) {
    expect(type).toBe(SERVER_MSG.chatRateLimited);
    this.notices.add(cb);
    return () => void this.notices.delete(cb);
  }
  rateLimit(retryAfterMs: number) {
    for (const cb of this.notices) cb({ retryAfterMs });
  }
  get listeners() {
    return this.notices.size;
  }
}

/** Manual clock and timers (same shape as the TV notice test). */
function clock() {
  let t = 50_000;
  const pending: { at: number; run: () => void; handle: number }[] = [];
  let next = 1;
  return {
    now: () => t,
    timers: {
      set: (run: () => void, ms: number) => {
        const handle = next++;
        pending.push({ at: t + ms, run, handle });
        return handle;
      },
      clear: (handle: unknown) => {
        const i = pending.findIndex((p) => p.handle === handle);
        if (i >= 0) pending.splice(i, 1);
      },
    },
    advance(ms: number) {
      t += ms;
      for (const p of pending.filter((p) => p.at <= t)) {
        pending.splice(pending.indexOf(p), 1);
        p.run();
      }
    },
  };
}

function setup() {
  const c = clock();
  const source = new FakeChat();
  const room = new FakeRoom();
  const store = new ChatStore(source, room, c);
  return { c, source, room, store };
}

const texts = (entries: readonly ChatEntry[]) => entries.map((e) => `${e.name}: ${e.text}`);

describe('ChatStore (T-1695)', () => {
  it('lists messages already in the state and new ones, oldest first, as plain copies', () => {
    const c = clock();
    const source = new FakeChat();
    source.post('a', 'Ann', 'hello', 10);
    const store = new ChatStore(source, new FakeRoom(), c);
    c.advance(500);
    source.post('b', 'Bob', 'hi', 20);
    const snapshot = store.getSnapshot();
    expect(texts(snapshot)).toEqual(['Ann: hello', 'Bob: hi']);
    expect(snapshot[1]).toEqual({
      id: 'm2',
      sessionId: 'b',
      name: 'Bob',
      text: 'hi',
      sentAt: 20,
      receivedAt: 50_500,
    });
    expect(snapshot[1]).not.toBe(source.messages[1]);
  });

  it('keeps the snapshot identity until a message is added or removed', () => {
    const { source, store } = setup();
    const changes = vi.fn();
    store.subscribe(changes);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    const m = source.post('a', 'Ann', 'one');
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(store.getSnapshot()).toBe(second);
    source.expire(m);
    expect(store.getSnapshot()).toEqual([]);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('drops a message as soon as the server removes it (expiry is server-side)', () => {
    const { source, store } = setup();
    const a = source.post('a', 'Ann', 'first');
    source.post('b', 'Bob', 'second');
    source.expire(a);
    expect(texts(store.getSnapshot())).toEqual(['Bob: second']);
  });

  it('sends only text that passes parseChatMessage, cleaned', () => {
    const { room, store } = setup();
    expect(store.send('   ')).toBe('invalid');
    expect(store.send('')).toBe('invalid');
    expect(store.send('x'.repeat(BALANCE.chat.maxLength + 1))).toBe('invalid');
    expect(room.sent).toEqual([]);
    expect(store.send('  hi\u0007 there  ')).toBe('sent');
    expect(room.sent).toEqual([{ type: MSG.chat, message: { text: 'hi there' } }]);
  });

  it('reports a closed socket without throwing', () => {
    const { room, store } = setup();
    room.failing = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(store.send('hi')).toBe('failed');
    warn.mockRestore();
  });

  it('shows the rate-limit notice until retryAfterMs and holds sends meanwhile', () => {
    const { c, room, store } = setup();
    expect(store.notice.message()).toBeNull();
    room.rateLimit(3_500);
    expect(store.notice.message()).toBe(chatRateLimitMessage(4));
    expect(store.send('again')).toBe('blocked');
    c.advance(3_500);
    expect(store.notice.message()).toBeNull();
    expect(store.send('again')).toBe('sent');
  });

  it('rebuilds from the new room after a resumed session and keeps first-seen times', () => {
    const { c, source, room, store } = setup();
    const kept = source.post('a', 'Ann', 'kept');
    source.post('a', 'Ann', 'expired during the drop');
    const changes = vi.fn();
    store.subscribe(changes);

    const resumed = new FakeChat();
    resumed.messages.push(kept);
    const newRoom = new FakeRoom();
    c.advance(2_000);
    store.rebind(resumed, newRoom);
    expect(texts(store.getSnapshot())).toEqual(['Ann: kept']);
    expect(store.getSnapshot()[0]!.receivedAt).toBe(50_000);
    expect(changes).toHaveBeenCalled();
    expect(source.listeners).toBe(0);
    expect(room.listeners).toBe(0);
    expect(store.send('after')).toBe('sent');
    expect(newRoom.sent).toHaveLength(1);
    expect(room.sent).toHaveLength(0);
  });

  it('dispose unsubscribes from the room', () => {
    const { source, room, store } = setup();
    store.dispose();
    expect(source.listeners).toBe(0);
    expect(room.listeners).toBe(0);
    expect(store.getSnapshot()).toEqual([]);
  });
});

describe('ChatPanel (T-1695)', () => {
  it('renders name, local time and text as text, never as markup', () => {
    const sentAt = Date.UTC(2026, 10, 20, 9, 5);
    const html = renderToStaticMarkup(
      createElement(ChatMessageList, {
        messages: [
          {
            id: 'm1',
            sessionId: 'a',
            name: '<b>Ann</b>',
            text: '<img src=x onerror=alert(1)>',
            sentAt,
            receivedAt: 0,
          },
        ],
      }),
    );
    expect(html).toContain('&lt;b&gt;Ann&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    const local = new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    expect(html).toContain(local);
    expect(html).toContain('data-testid="chat-message"');
  });

  it('has the input with maxLength, the send button, the help line and the notice', () => {
    const { c, source, room, store } = setup();
    source.post('a', 'Ann', 'hello');
    let html = renderToStaticMarkup(createElement(ChatPanel, { store }));
    expect(html).toContain('data-testid="chat-input"');
    expect(html).toContain('aria-label="Chat message"');
    expect(html).toContain(`maxLength="${BALANCE.chat.maxLength}"`);
    expect(html).toContain('data-testid="chat-send"');
    expect(html).toContain('Messages disappear after one minute.');
    expect(html).toContain('hello');
    expect(html).not.toContain('chat-rate-limited');

    room.rateLimit(10_000);
    html = renderToStaticMarkup(createElement(ChatPanel, { store }));
    expect(html).toContain('data-testid="chat-rate-limited"');
    expect(html).toContain(chatRateLimitMessage(10));
    c.advance(10_000);
    html = renderToStaticMarkup(createElement(ChatPanel, { store }));
    expect(html).not.toContain('chat-rate-limited');
  });

  it('never uses dangerouslySetInnerHTML or browser storage for chat', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['ui/ChatPanel.tsx', 'net/chat.ts']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      expect(source).not.toMatch(/dangerouslySetInnerHTML|innerHTML|localStorage|sessionStorage/);
    }
  });
});
