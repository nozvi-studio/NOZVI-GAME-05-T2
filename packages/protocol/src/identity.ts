export const AVATAR_IDS = ['men_suit', 'women_suit'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export type EmployeeIdentity = {
  sessionId: string;
  employeeName: string;
  officeCode: string;
  avatarId: AvatarId;
  status: 'online' | 'working' | 'away';
};

export function normalizeOfficeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{4,12}$/.test(code) ? code : null;
}

const FORBIDDEN = /[\u0000-\u001f\u007f<>]/;

export function validateName(raw: string): string | null {
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > 20 || FORBIDDEN.test(name)) return null;
  return name;
}

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value);
}
