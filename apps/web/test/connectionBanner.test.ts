import { describe, expect, it } from 'vitest';
import { bannerText } from '../src/ui/ConnectionBanner';

describe('bannerText (REQ-NET-005, REQ-NET-006)', () => {
  const connected = { status: 'connected' } as const;

  it('is hidden while connected or idle', () => {
    expect(bannerText('connected', connected, 0)).toBeNull();
    expect(bannerText('idle', connected, 0)).toBeNull();
  });

  it('counts down whole seconds to the next attempt', () => {
    const waiting = { status: 'reconnecting', attempt: 3, retryAt: 7000 } as const;
    expect(bannerText('reconnecting', waiting, 3000)).toBe('Reconnecting… retry in 4 s');
    expect(bannerText('reconnecting', waiting, 6100)).toBe('Reconnecting… retry in 1 s');
    expect(bannerText('reconnecting', waiting, 8000)).toBe('Reconnecting… retry in 0 s');
  });

  it('shows a plain marker while an attempt is in flight', () => {
    const inFlight = { status: 'reconnecting', attempt: 1, retryAt: null } as const;
    expect(bannerText('reconnecting', inFlight, 0)).toBe('Reconnecting…');
  });

  it('says the connection is lost once the backoff is used up, and Rejoining while it runs', () => {
    const expired = { status: 'expired' } as const;
    expect(bannerText('lost', expired, 0)).toBe('Connection lost');
    expect(bannerText('error', connected, 0)).toBe('Connection lost');
    expect(bannerText('connecting', connected, 0)).toBe('Rejoining…');
  });
});
