import { expect, it } from 'vitest';
import { JoinRateLimiter } from '../src/joinRateLimiter';

it('allows N joins per address per sliding minute', () => {
  let t = 0;
  const l = new JoinRateLimiter(3, () => t);
  expect([l.tryJoin('a'), l.tryJoin('a'), l.tryJoin('a'), l.tryJoin('a')]).toEqual([
    true,
    true,
    true,
    false,
  ]);
  expect(l.tryJoin('b')).toBe(true);
  t = 59_999;
  expect(l.tryJoin('a')).toBe(false);
  t = 60_000;
  expect(l.tryJoin('a')).toBe(true);
  t = 200_000;
  l.prune();
  expect(l.tryJoin('a')).toBe(true);
});
