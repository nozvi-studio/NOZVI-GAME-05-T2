import { useState } from 'react';
import { AVATAR_IDS, normalizeOfficeCode, validateName, type AvatarId } from '@office/protocol';
import { toConnectionError, type ConnectionErrorCode } from '../net';
import { loadDraft, safeLocalStorage, saveDraft } from './identityStorage';

export type JoinResult = { name: string; officeCode: string; avatarId: AvatarId };
const LABEL: Record<AvatarId, string> = { men_suit: 'Suit (men)', women_suit: 'Suit (women)' };

/** Player-facing text for each failed join; the form stays editable so the user can retry. */
export const JOIN_ERROR_TEXT: Record<ConnectionErrorCode, string> = {
  room_full: 'This office is full (10 people). Try again later or use another office code.',
  unreachable: 'Cannot reach the office server. Check your connection and try again.',
  invalid_identity: 'The server rejected this name or office code. Check them and try again.',
  version_mismatch: 'This page is out of date. Reload the page and try again.',
  rate_limited: 'Too many join attempts. Wait a minute and try again.',
  unknown: 'Could not join the office. Please try again.',
};

/** `onJoin` connects to the office; it rejects with a `ConnectionError` on failure. */
export function JoinScreen({ onJoin }: { onJoin(r: JoinResult): Promise<void> }) {
  const [draft, setDraft] = useState(() => loadDraft(safeLocalStorage()));
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  /** The identity of the last join that failed on the server side; enables Retry. */
  const [failed, setFailed] = useState<JoinResult | null>(null);
  const attempt = (result: JoinResult) => {
    if (connecting) return;
    setError(null);
    setFailed(null);
    setConnecting(true);
    onJoin(result).catch((err: unknown) => {
      setConnecting(false);
      setFailed(result);
      setError(JOIN_ERROR_TEXT[toConnectionError(err).code]);
    });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (connecting) return;
    const name = validateName(draft.name);
    const officeCode = normalizeOfficeCode(draft.officeCode);
    setFailed(null);
    if (!name) return setError('Name must be 1–20 characters, without < or >.');
    if (!officeCode) return setError('Office code must be 4–12 letters, digits or "-".');
    const result = { name, officeCode, avatarId: draft.avatarId };
    saveDraft(safeLocalStorage(), result);
    attempt(result);
  };
  return (
    <form
      onSubmit={submit}
      data-testid="join"
      aria-busy={connecting}
      style={{
        maxWidth: 360,
        margin: '12vh auto',
        display: 'grid',
        gap: 12,
        font: '15px system-ui',
      }}
    >
      <h1 style={{ margin: 0 }}>Virtual Office</h1>
      <label>
        Your name
        <input
          name="name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label>
        Office code
        <input
          name="officeCode"
          value={draft.officeCode}
          onChange={(e) => setDraft({ ...draft, officeCode: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>Avatar</legend>
        {AVATAR_IDS.map((id) => (
          <label key={id} style={{ marginRight: 12 }}>
            <input
              type="radio"
              name="avatar"
              value={id}
              checked={draft.avatarId === id}
              onChange={() => setDraft({ ...draft, avatarId: id })}
            />{' '}
            {LABEL[id]}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" style={{ color: '#b42318', margin: 0 }}>
          {error}
        </p>
      )}
      {failed && !connecting && (
        <button type="button" onClick={() => attempt(failed)}>
          Retry
        </button>
      )}
      {connecting && (
        <p role="status" style={{ margin: 0 }}>
          Connecting to the office…
        </p>
      )}
      <button type="submit" disabled={connecting}>
        Join Office
      </button>
    </form>
  );
}
