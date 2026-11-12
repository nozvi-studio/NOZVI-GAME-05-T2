import { describe, expect, it } from 'vitest';
import { AVATAR_IDS, normalizeOfficeCode, validateName } from '../src/identity';

describe('identity', () => {
  it('normalizes office codes', () => {
    expect(normalizeOfficeCode('  nozvi-01 ')).toBe('NOZVI-01');
    expect(normalizeOfficeCode('abc')).toBeNull();
    expect(normalizeOfficeCode('ABCDEFGHIJKLM')).toBeNull();
    expect(normalizeOfficeCode('AB CD')).toBeNull();
  });
  it('validates names by visible characters', () => {
    expect(validateName('  Khánh  ')).toBe('Khánh');
    expect(validateName('')).toBeNull();
    expect(validateName('a'.repeat(21))).toBeNull();
    expect(validateName('😀'.repeat(20))).toBe('😀'.repeat(20));
    expect(validateName('<b>x</b>')).toBeNull();
    expect(validateName('a\u0007b')).toBeNull();
  });
  it('lists two preset avatars', () => {
    expect(AVATAR_IDS).toEqual(['men_suit', 'women_suit']);
  });
});
