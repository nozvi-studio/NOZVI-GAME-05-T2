import { useEffect, useState } from 'react';
import type { ConnectionError, ConnectionStatus, ReconnectState } from '../net';
import { JOIN_ERROR_TEXT } from './JoinScreen';

/** Banner text for a state; null hides the banner. Pure, so tests need no DOM. */
export function bannerText(
  status: ConnectionStatus,
  reconnect: ReconnectState,
  now: number,
): string | null {
  switch (status) {
    case 'reconnecting': {
      if (reconnect.status !== 'reconnecting' || reconnect.retryAt === null) {
        return 'Reconnecting…';
      }
      const seconds = Math.max(0, Math.ceil((reconnect.retryAt - now) / 1000));
      return `Reconnecting… retry in ${seconds} s`;
    }
    case 'lost':
    case 'error':
      return 'Connection lost';
    case 'connecting':
      return 'Rejoining…';
    default:
      return null;
  }
}

/**
 * REQ-NET-005, REQ-NET-006: shown over the office while the connection is down. During the
 * backoff it counts down to the next attempt; once the attempts are used up (or the
 * reservation expired) it offers Rejoin, which resumes or joins afresh with the same
 * name, office code and avatar.
 */
export function ConnectionBanner({
  status,
  reconnect,
  error,
  onRejoin,
}: {
  status: ConnectionStatus;
  reconnect: ReconnectState;
  error: ConnectionError | null;
  onRejoin(): void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const counting = status === 'reconnecting';
  // Restarted on every backoff step, so a new countdown never starts from a stale clock.
  useEffect(() => {
    if (!counting) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [counting, reconnect]);
  const text = bannerText(status, reconnect, now);
  if (text === null) return null;
  const canRejoin = status === 'lost' || status === 'error';
  // After a failed Rejoin, say why (e.g. the server is still unreachable or the room is full).
  const detail = canRejoin && error ? JOIN_ERROR_TEXT[error.code] : null;
  return (
    <div
      data-testid="connection-banner"
      role={canRejoin ? 'alert' : 'status'}
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 'calc(100% - 32px)',
        color: '#fff',
        background: canRejoin ? 'rgba(180,35,24,0.92)' : 'rgba(34,36,38,0.88)',
        borderRadius: 8,
        padding: '8px 14px',
        font: '600 14px system-ui',
      }}
    >
      <span data-testid="connection-banner-text">{text}</span>
      {detail && <span style={{ fontWeight: 400, fontSize: 12 }}>{detail}</span>}
      {canRejoin && (
        <button type="button" onClick={onRejoin}>
          Rejoin
        </button>
      )}
    </div>
  );
}
