import { isAvatarId, type AvatarId } from '@office/protocol';

export type JoinDraft = { name: string; officeCode: string; avatarId: AvatarId };
const KEY = 'office.identity';
const DEFAULT: JoinDraft = { name: '', officeCode: '', avatarId: 'men_suit' };

export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDraft(storage: Pick<Storage, 'getItem'> | null): JoinDraft {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const v = JSON.parse(raw) as Partial<Record<keyof JoinDraft, unknown>>;
    return {
      name: typeof v.name === 'string' ? v.name : '',
      officeCode: typeof v.officeCode === 'string' ? v.officeCode : '',
      avatarId: isAvatarId(v.avatarId) ? v.avatarId : 'men_suit',
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveDraft(storage: Pick<Storage, 'setItem'> | null, d: JoinDraft): void {
  try {
    storage?.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}
