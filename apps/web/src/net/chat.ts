import { Callbacks } from '@colyseus/sdk';
import {
  MSG,
  SERVER_MSG,
  parseChatMessage,
  type ChatMessage,
  type ChatRateLimitedNotice,
} from '@office/protocol';
import { RateLimitNotice, type Timers } from '../tv/rateLimitNotice';
import type { OfficeRoomHandle } from './connection';

/** The replicated fields of one `OfficeState.chat` entry; a live schema instance in practice. */
export type ReplicatedChatMessage = {
  readonly id: string;
  readonly sessionId: string;
  readonly name: string;
  readonly text: string;
  /** Server epoch ms when the server accepted the message. */
  readonly sentAt: number;
};

/** One message as the panel and the speech bubbles read it (a plain copy, never live state). */
export type ChatEntry = ReplicatedChatMessage & {
  /** Local epoch ms when this client first saw the message (bubble timing, REQ-CHAT-003). */
  readonly receivedAt: number;
};

/** Add / remove notifications for `room.state.chat`; each returns an unsubscribe. */
export type ChatSource = {
  /** Also reports the messages already in the state when subscribing, oldest first. */
  onAdd(handler: (message: ReplicatedChatMessage) => void): () => void;
  onRemove(handler: (message: ReplicatedChatMessage) => void): () => void;
};

/** The part of the joined room the chat store sends to and listens on; tests use a fake. */
export type ChatRoom = {
  send(type: typeof MSG.chat, message: ChatMessage): void;
  onMessage(
    type: typeof SERVER_MSG.chatRateLimited,
    callback: (notice: ChatRateLimitedNotice) => void,
  ): () => void;
};

/** Adapts the joined room's schema callbacks (@colyseus/sdk 0.18 `Callbacks`). */
export function chatSource(room: OfficeRoomHandle): ChatSource {
  const callbacks = Callbacks.get(room);
  return {
    onAdd: (handler) => callbacks.onAdd('chat', (message) => handler(message), true),
    onRemove: (handler) => callbacks.onRemove('chat', (message) => handler(message)),
  };
}

/** The chat panel text while the server refuses messages (REQ-CHAT-001). */
export function chatRateLimitMessage(seconds: number): string {
  return `Too many messages, try again in ${seconds} s.`;
}

/**
 * Outcome of `ChatStore.send`: `invalid` failed `parseChatMessage` (nothing sent),
 * `blocked` while the rate-limit notice runs, `failed` when the socket refused it.
 */
export type ChatSendResult = 'sent' | 'invalid' | 'blocked' | 'failed';

export type ChatStoreDeps = {
  /** Local epoch ms. */
  now: () => number;
  timers?: Timers;
};

/**
 * REQ-CHAT-001/002: the office chat as server state, shaped for `useSyncExternalStore`.
 * The snapshot keeps its identity until a message is added or removed; it lists the live
 * messages oldest first, as the server keeps them. The server removes expired messages and
 * the store follows, so nothing here times out on its own and nothing is stored in the
 * browser. `send` validates locally before sending; the server's `chat_rate_limited`
 * notice is shown through `notice` until `retryAfterMs`.
 */
export class ChatStore {
  private readonly entries = new Map<string, ChatEntry>();
  private snapshot: readonly ChatEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void)[] = [];
  private room: ChatRoom;
  private readonly now: () => number;
  /** The rate-limit message for the panel (countdown, clears itself). */
  readonly notice: RateLimitNotice;

  constructor(source: ChatSource, room: ChatRoom, deps: Partial<ChatStoreDeps> = {}) {
    this.now = deps.now ?? Date.now;
    this.notice = new RateLimitNotice(this.now, deps.timers, chatRateLimitMessage);
    this.room = room;
    this.bind(source, room);
  }

  /**
   * REQ-NET-005: after a reconnect the room handle is new; rebuild the list from its full
   * state. Messages seen before keep their first-seen time. Listeners are notified once.
   */
  rebind(source: ChatSource, room: ChatRoom): void {
    const seen = new Map([...this.entries].map(([id, e]) => [id, e.receivedAt]));
    this.unbind();
    this.entries.clear();
    this.room = room;
    this.bind(source, room, seen);
    this.publish();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): readonly ChatEntry[] => this.snapshot;

  /** Sends `text` as one `chat` message if it passes `parseChatMessage`. */
  send(text: string): ChatSendResult {
    const message = parseChatMessage({ text });
    if (!message) return 'invalid';
    if (this.notice.message() !== null) return 'blocked';
    try {
      this.room.send(MSG.chat, message);
      return 'sent';
    } catch (error) {
      // A closed socket drops the message; nothing appears until the server accepts one.
      console.warn('Chat message not sent.', error);
      return 'failed';
    }
  }

  dispose(): void {
    this.unbind();
    this.entries.clear();
    this.snapshot = [];
    this.notice.dispose();
    this.listeners.clear();
  }

  private bind(source: ChatSource, room: ChatRoom, seen = new Map<string, number>()): void {
    this.unsubscribe = [
      source.onAdd((m) => {
        this.entries.set(m.id, {
          id: m.id,
          sessionId: m.sessionId,
          name: m.name,
          text: m.text,
          sentAt: m.sentAt,
          receivedAt: seen.get(m.id) ?? this.now(),
        });
        this.publish();
      }),
      source.onRemove((m) => {
        if (this.entries.delete(m.id)) this.publish();
      }),
      room.onMessage(SERVER_MSG.chatRateLimited, (n) =>
        this.notice.show(Number((n as Partial<ChatRateLimitedNotice> | null)?.retryAfterMs)),
      ),
    ];
  }

  private unbind(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  private publish(): void {
    this.snapshot = [...this.entries.values()];
    for (const listener of [...this.listeners]) listener();
  }
}
