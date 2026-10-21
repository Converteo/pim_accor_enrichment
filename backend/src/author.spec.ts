import { describe, expect, it } from 'vitest';
import { authorFrom } from './author.js';

describe('authorFrom', () => {
  it.each([
    ['test@converteo.com', 'test@converteo.com'],
    ['  Nicolas.Wyseur@Converteo.com ', 'nicolas.wyseur@converteo.com'],
  ])('accepte %s', (header, expected) => {
    expect(authorFrom(header)).toBe(expected);
  });

  it.each([
    [undefined, 401, 'author_required'],
    ['', 401, 'author_required'],
    ['pas un email', 401, 'author_invalid'],
    ['x@converteo.com.evil.io', 403, 'author_forbidden'],
    ['j.martin@accor.com', 403, 'author_forbidden'],
    ['x@notconverteo.com', 403, 'author_forbidden'],
  ])('refuse %j', (header, status, code) => {
    try {
      authorFrom(header);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ status, response: { error: { code } } });
    }
  });
});
