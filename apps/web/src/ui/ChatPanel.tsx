import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { BALANCE } from '@office/protocol';
import type { ChatEntry, ChatStore } from '../net/chat';
import { color, font, hudPanel, space } from './tokens';

/** How often the rate-limit countdown is redrawn while it runs. */
const NOTICE_POLL_MS = 250;

/** The sender's local clock time of a message, hours and minutes. */
export function chatTime(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The message list, oldest first. Names and text are React text children, so the browser
 * never parses them as markup (REQ-CHAT-001). Stateless, so tests render it directly.
 */
export function ChatMessageList({ messages }: { messages: readonly ChatEntry[] }) {
  return (
    <ul
      aria-label="Chat messages"
      data-testid="chat-messages"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        maxHeight: 180,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: space[1],
      }}
    >
      {messages.map((m) => (
        <li key={m.id} data-testid="chat-message" style={{ overflowWrap: 'anywhere' }}>
          <span data-testid="chat-message-name" style={{ fontWeight: font.bold }}>
            {m.name}
          </span>{' '}
          <time
            dateTime={new Date(m.sentAt).toISOString()}
            style={{ color: color.hudTextMuted, fontSize: font.xs }}
          >
            {chatTime(m.sentAt)}
          </time>
          <div data-testid="chat-message-text">{m.text}</div>
        </li>
      ))}
    </ul>
  );
}

type Props = { store: ChatStore };

/**
 * REQ-CHAT-001/002 (T-1695): office chat panel. Lists the live messages from room state,
 * sends through `ChatStore.send` and shows the server's rate-limit notice until
 * `retryAfterMs`. Messages leave the list when the server removes them (one minute).
 */
export function ChatPanel({ store }: Props) {
  const messages = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [text, setText] = useState('');
  const [noticeText, setNoticeText] = useState<string | null>(() => store.notice.message());
  useEffect(() => {
    const refresh = () => setNoticeText(store.notice.message());
    const off = store.notice.subscribe(refresh);
    const timer = setInterval(refresh, NOTICE_POLL_MS); // the countdown follows the poll
    refresh();
    return () => {
      off();
      clearInterval(timer);
    };
  }, [store]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (store.send(text) === 'sent') setText('');
  };
  return (
    <section
      aria-label="Chat"
      data-testid="chat-panel"
      className="ov-hud"
      style={{
        ...hudPanel,
        position: 'absolute',
        bottom: space[4],
        right: space[4],
        width: 320,
        maxWidth: `calc(100% - 2 * ${space[4]})`,
        boxSizing: 'border-box',
        padding: `${space[2]} ${space[3]}`,
        fontSize: font.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: space[2],
      }}
    >
      <ChatMessageList messages={messages} />
      {noticeText && (
        <div role="status" data-testid="chat-rate-limited" style={{ color: color.hudDangerText }}>
          {noticeText}
        </div>
      )}
      <form onSubmit={submit} style={{ display: 'flex', gap: space[2] }}>
        <input
          className="ov-input"
          type="text"
          aria-label="Chat message"
          data-testid="chat-input"
          value={text}
          maxLength={BALANCE.chat.maxLength}
          placeholder="Press Enter to chat"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button type="submit" className="ov-button" data-testid="chat-send">
          Send
        </button>
      </form>
      <div data-testid="chat-help" style={{ color: color.hudTextMuted, fontSize: font.xs }}>
        Messages disappear after one minute.
      </div>
    </section>
  );
}
