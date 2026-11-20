import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
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

export type ChatInputAction = 'send' | 'close' | 'none';

/**
 * T-1696: what a key does in the chat input. Enter sends non-blank text, Enter on a blank
 * input closes it, Esc closes it. Enter that confirms an IME composition does nothing.
 */
export function chatInputKey(key: string, text: string, composing = false): ChatInputAction {
  if (composing) return 'none';
  if (key === 'Escape') return 'close';
  if (key === 'Enter') return text.trim() === '' ? 'close' : 'send';
  return 'none';
}

type Props = {
  store: ChatStore;
  /** The input element, so Enter in the game can focus it (`Game.onChatOpen`). */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** The input gained or lost focus (`Game.setChatFocused`). */
  onFocusChange?: (focused: boolean) => void;
  /** The input closed: keyboard focus goes back to the game (`Game.focusGame`). */
  onClose?: () => void;
};

/**
 * REQ-CHAT-001/002 (T-1695): office chat panel. Lists the live messages from room state,
 * sends through `ChatStore.send` and shows the server's rate-limit notice until
 * `retryAfterMs`. Messages leave the list when the server removes them (one minute).
 *
 * Keys (T-1696): the input is "open" while it has focus. Enter in the game focuses it.
 * Enter in the input sends and then closes it (focus back to the game), so one Enter opens
 * and the next one sends; a refused message (invalid, rate limited) keeps it open with the
 * text. Enter on a blank input and Esc close it. The Send button sends and keeps the input
 * open. While the input has focus the game reads idle input and ignores E, F and G.
 */
export function ChatPanel({ store, inputRef, onFocusChange, onClose }: Props) {
  const messages = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [text, setText] = useState('');
  const close = (input: HTMLInputElement) => {
    input.blur();
    onClose?.();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const action = chatInputKey(e.key, text, e.nativeEvent.isComposing);
    if (action === 'none') return;
    // Handled here: the window listener in Game sees defaultPrevented and does nothing.
    e.preventDefault();
    if (action === 'close') return close(e.currentTarget);
    if (store.send(text) !== 'sent') return;
    setText('');
    close(e.currentTarget);
  };
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
    inputRef?.current?.focus();
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
          ref={inputRef}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
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
