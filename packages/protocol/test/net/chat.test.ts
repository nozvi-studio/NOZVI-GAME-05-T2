import { describe, expect, it } from 'vitest';
import { Encoder, Decoder } from '@colyseus/schema';
import { BALANCE } from '../../src/balance';
import { MSG, SERVER_MSG, parseChatMessage } from '../../src/net/messages';
import { ChatMessageState, OfficeState } from '../../src/net/schema';

describe('parseChatMessage (REQ-CHAT-001)', () => {
  it('accepts 1 and maxLength visible characters and trims', () => {
    expect(parseChatMessage({ text: '  hi  ' })).toEqual({ text: 'hi' });
    expect(parseChatMessage({ text: 'a' })).toEqual({ text: 'a' });
    const max = 'x'.repeat(BALANCE.chat.maxLength);
    expect(parseChatMessage({ text: max })).toEqual({ text: max });
  });

  it('counts code points, not UTF-16 units (emoji and Vietnamese)', () => {
    const emoji = '😀'.repeat(BALANCE.chat.maxLength);
    expect(parseChatMessage({ text: emoji })?.text).toBe(emoji);
    expect(parseChatMessage({ text: 'Chào cả nhà' })).toEqual({ text: 'Chào cả nhà' });
  });

  it('rejects empty, too long, non-string and non-object payloads', () => {
    expect(parseChatMessage({ text: '' })).toBeNull();
    expect(parseChatMessage({ text: '   ' })).toBeNull();
    expect(parseChatMessage({ text: 'x'.repeat(BALANCE.chat.maxLength + 1) })).toBeNull();
    expect(parseChatMessage({ text: 42 })).toBeNull();
    expect(parseChatMessage('hi')).toBeNull();
    expect(parseChatMessage(null)).toBeNull();
  });

  it('strips control characters and drops extra fields', () => {
    expect(parseChatMessage({ text: 'a\u0000b\u0007\u001bc\u007f\u0085', name: 'spoof' })).toEqual({
      text: 'abc',
    });
    expect(parseChatMessage({ text: '\n\t\r' })).toBeNull();
    // Markup is kept as literal text; clients render it as text, never HTML.
    expect(parseChatMessage({ text: '<b>hi</b>' })).toEqual({ text: '<b>hi</b>' });
  });

  it('has the message names and owner-confirmed limits', () => {
    expect(MSG.chat).toBe('chat');
    expect(SERVER_MSG.chatRateLimited).toBe('chat_rate_limited');
    expect(BALANCE.chat).toMatchObject({
      ttlSeconds: 60,
      maxLength: 200,
      maxMessages: 50,
      rateLimitMessages: 5,
      rateLimitWindowSeconds: 10,
      bubbleSeconds: 6,
      bubbleMaxChars: 80,
    });
  });
});

describe('OfficeState.chat (REQ-CHAT-002)', () => {
  it('round-trips messages and removals through the schema encoder', () => {
    const state = new OfficeState();
    const encoder = new Encoder(state);
    const decoded = new OfficeState();
    const decoder = new Decoder(decoded);
    const add = (id: string, text: string) => {
      const m = new ChatMessageState();
      m.id = id;
      m.sessionId = 's1';
      m.name = 'Ann';
      m.text = text;
      m.sentAt = 1_700_000_000_000;
      state.chat.push(m);
    };
    add('c1', 'hello');
    add('c2', 'world');
    decoder.decode(encoder.encodeAll());
    encoder.discardChanges();
    expect(decoded.chat.map((m) => [m.id, m.text, m.name, m.sentAt])).toEqual([
      ['c1', 'hello', 'Ann', 1_700_000_000_000],
      ['c2', 'world', 'Ann', 1_700_000_000_000],
    ]);
    state.chat.shift();
    decoder.decode(encoder.encode());
    expect(decoded.chat.map((m) => m.id)).toEqual(['c2']);
  });
});
