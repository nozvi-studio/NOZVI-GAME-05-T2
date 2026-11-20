/**
 * Game key routing (T-1696, REQ-CHAT-001; TV mode REQ-TV-002). Pure so the rules are unit
 * tested without a DOM; `Game` feeds it the window `keydown` events.
 */

/** What else on the page currently owns the keyboard. */
export type KeyContext = {
  /** TV mode: the panel has the keyboard until Close / Esc. */
  readonly tvOpen: boolean;
  /** The chat input has focus: every key is text for it. */
  readonly chatFocused: boolean;
  /** Focus is on the game canvas or nowhere (body), not on a HUD control. */
  readonly gameFocused: boolean;
};

export type GameKeyAction = 'none' | 'tvExit' | 'chatOpen' | 'press' | 'wave' | 'sip';

type KeyEventLike = { readonly code: string; readonly repeat: boolean; defaultPrevented: boolean };

/**
 * One window `keydown`. A key some control already handled (`defaultPrevented`, e.g. Enter
 * that just sent a chat message) and every key typed in the chat input do nothing here, so
 * E, F, G and the emote key never fire while typing. Enter opens the chat only when the game
 * itself has focus (Enter on a focused button keeps activating that button).
 */
export function routeGameKey(e: KeyEventLike, ctx: KeyContext): GameKeyAction {
  if (e.defaultPrevented || ctx.chatFocused) return 'none';
  if (ctx.tvOpen) return e.code === 'Escape' ? 'tvExit' : 'none';
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && ctx.gameFocused)
    return 'chatOpen';
  if (e.repeat) return 'none';
  if (e.code === 'KeyE') return 'press';
  if (e.code === 'KeyG') return 'wave';
  if (e.code === 'KeyF') return 'sip';
  return 'none';
}

/**
 * The player stands still (idle input) while TV mode is open or the chat input has focus:
 * WASD typed into the chat never moves the avatar.
 */
export function readsIdleInput(ctx: Pick<KeyContext, 'tvOpen' | 'chatFocused'>): boolean {
  return ctx.tvOpen || ctx.chatFocused;
}
