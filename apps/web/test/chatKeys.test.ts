import { describe, expect, it } from 'vitest';
import { readsIdleInput, routeGameKey, type KeyContext } from '../src/game/keys';
import { chatInputKey } from '../src/ui/ChatPanel';

// T-1696 (REQ-CHAT-001): Enter / Esc for the chat input and game keys while typing.

const GAME: KeyContext = { tvOpen: false, chatFocused: false, gameFocused: true };
const key = (code: string, extra: { repeat?: boolean; defaultPrevented?: boolean } = {}) => ({
  code,
  repeat: extra.repeat ?? false,
  defaultPrevented: extra.defaultPrevented ?? false,
});

describe('routeGameKey (T-1696)', () => {
  it('keeps E, G and F for the game when nothing else has the keyboard', () => {
    expect(routeGameKey(key('KeyE'), GAME)).toBe('press');
    expect(routeGameKey(key('KeyG'), GAME)).toBe('wave');
    expect(routeGameKey(key('KeyF'), GAME)).toBe('sip');
    expect(routeGameKey(key('KeyE', { repeat: true }), GAME)).toBe('none');
    expect(routeGameKey(key('KeyW'), GAME)).toBe('none');
  });

  it('Enter opens the chat only when the game has focus', () => {
    expect(routeGameKey(key('Enter'), GAME)).toBe('chatOpen');
    expect(routeGameKey(key('NumpadEnter'), GAME)).toBe('chatOpen');
    expect(routeGameKey(key('Enter', { repeat: true }), GAME)).toBe('none');
    // Enter on a focused HUD button activates the button, not the chat.
    expect(routeGameKey(key('Enter'), { ...GAME, gameFocused: false })).toBe('none');
    // In TV mode the panel keeps the keyboard.
    expect(routeGameKey(key('Enter'), { ...GAME, tvOpen: true })).toBe('none');
  });

  it('ignores every key typed in the chat input, interaction and emote keys included', () => {
    const typing = { ...GAME, chatFocused: true };
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'Enter', 'Escape'])
      expect(routeGameKey(key(code), typing), code).toBe('none');
    expect(routeGameKey(key('Escape'), { ...typing, tvOpen: true })).toBe('none');
  });

  it('ignores a key the chat input already handled (Enter that sent and closed it)', () => {
    // The input blurs before the window listener runs, so only defaultPrevented tells.
    expect(routeGameKey(key('Enter', { defaultPrevented: true }), GAME)).toBe('none');
    expect(routeGameKey(key('Escape', { defaultPrevented: true }), { ...GAME, tvOpen: true })).toBe(
      'none',
    );
  });

  it('keeps the TV mode rules: Esc closes, other game keys wait', () => {
    const tv = { ...GAME, tvOpen: true };
    expect(routeGameKey(key('Escape'), tv)).toBe('tvExit');
    expect(routeGameKey(key('KeyE'), tv)).toBe('none');
    expect(routeGameKey(key('KeyG'), tv)).toBe('none');
  });
});

describe('readsIdleInput (T-1696)', () => {
  it('stands the player still while the chat input or TV mode has the keyboard', () => {
    expect(readsIdleInput({ tvOpen: false, chatFocused: false })).toBe(false);
    expect(readsIdleInput({ tvOpen: false, chatFocused: true })).toBe(true);
    expect(readsIdleInput({ tvOpen: true, chatFocused: false })).toBe(true);
  });
});

describe('chatInputKey (T-1696)', () => {
  it('Enter sends text, Enter on a blank input and Esc close it', () => {
    expect(chatInputKey('Enter', 'hello')).toBe('send');
    expect(chatInputKey('Enter', '   ')).toBe('close');
    expect(chatInputKey('Enter', '')).toBe('close');
    expect(chatInputKey('Escape', 'draft')).toBe('close');
  });

  it('leaves other keys, WASD included, to the input as text', () => {
    for (const k of ['w', 'a', 's', 'd', 'e', 'f', 'g', ' ', 'ArrowLeft'])
      expect(chatInputKey(k, 'x')).toBe('none');
  });

  it('does not send while an IME composition is confirmed with Enter', () => {
    expect(chatInputKey('Enter', 'draft', true)).toBe('none');
  });
});
