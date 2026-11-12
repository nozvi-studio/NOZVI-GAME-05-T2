import { useState } from 'react';
import { AVATAR_IDS, normalizeOfficeCode, validateName, type AvatarId } from '@office/protocol';
import { loadDraft, safeLocalStorage, saveDraft } from './identityStorage';

export type JoinResult = { name: string; officeCode: string; avatarId: AvatarId };
const LABEL: Record<AvatarId, string> = { men_suit: 'Suit (men)', women_suit: 'Suit (women)' };

export function JoinScreen({ onJoin }: { onJoin(r: JoinResult): void }) {
  const [draft, setDraft] = useState(() => loadDraft(safeLocalStorage()));
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = validateName(draft.name);
    const officeCode = normalizeOfficeCode(draft.officeCode);
    if (!name) return setError('Name must be 1–20 characters, without < or >.');
    if (!officeCode) return setError('Office code must be 4–12 letters, digits or "-".');
    const result = { name, officeCode, avatarId: draft.avatarId };
    saveDraft(safeLocalStorage(), result);
    onJoin(result);
  };
  return (
    <form
      onSubmit={submit}
      data-testid="join"
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
      <button type="submit">Join Office</button>
    </form>
  );
}
