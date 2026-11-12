import { describe, expect, it } from 'vitest';
import { loadDraft, saveDraft } from '../src/ui/identityStorage';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe('identityStorage', () => {
  it('round-trips a draft', () => {
    const s = mem();
    saveDraft(s, { name: 'An', officeCode: 'NOZVI', avatarId: 'women_suit' });
    expect(loadDraft(s)).toEqual({ name: 'An', officeCode: 'NOZVI', avatarId: 'women_suit' });
  });
  it('falls back to defaults on missing, corrupt or throwing storage', () => {
    const def = { name: '', officeCode: '', avatarId: 'men_suit' };
    expect(loadDraft(null)).toEqual(def);
    expect(loadDraft(mem())).toEqual(def);
    expect(loadDraft({ getItem: () => '{bad' })).toEqual(def);
    expect(
      loadDraft({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toEqual(def);
    expect(
      loadDraft({
        getItem: () => JSON.stringify({ name: 'x', officeCode: 'y', avatarId: 'robot' }),
      }).avatarId,
    ).toBe('men_suit');
    expect(() =>
      saveDraft(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        def as never,
      ),
    ).not.toThrow();
  });
});
