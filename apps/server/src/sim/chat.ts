/** The replicated chat fields the expiry reads (`ChatMessageState` fits). */
export type ChatEntry = { sentAt: number };

/** The list operations the chat log needs (`ArraySchema` and plain arrays fit). */
export type ChatList<T> = {
  readonly length: number;
  at(index: number): T | undefined;
  push(...items: T[]): number;
  shift(): T | undefined;
  splice(start: number, deleteCount?: number): T[];
};

/**
 * REQ-CHAT-001/002: appends an entry, oldest first. When the list already holds `max`
 * entries, the oldest are removed first, so it never holds more than `max`.
 */
export function appendChat<T extends ChatEntry>(list: ChatList<T>, entry: T, max: number): void {
  while (list.length >= max && list.length > 0) list.shift();
  list.push(entry);
}

/**
 * REQ-CHAT-002: removes every entry with `now - sentAt >= ttlMs`; returns how many went.
 * Pure, so the room tick and the tests share it.
 */
export function expireChat<T extends ChatEntry>(
  list: ChatList<T>,
  now: number,
  ttlMs: number,
): number {
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list.at(i);
    if (entry !== undefined && now - entry.sentAt >= ttlMs) {
      list.splice(i, 1);
      removed++;
    }
  }
  return removed;
}
