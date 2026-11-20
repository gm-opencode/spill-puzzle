import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelative } from '../../../src/i18n/format';
import { t, type MessageKey } from '../../../src/i18n/t';

describe('t', () => {
  it('looks up and fills placeholders', () => {
    expect(t('app.name')).toBe('PicPuzzle');
    expect(t('new.grid', { rows: 6, cols: 8, count: 48 })).toBe('6 × 8 = 48 pieces');
    expect(t('library.pieces')).toBe('{count} pieces'); // missing params stay visible
    expect(t('library.pieces', { other: 1 })).toBe('{count} pieces');
  });

  it('returns the key for unknown keys', () => {
    expect(t('nope.missing' as MessageKey)).toBe('nope.missing');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [-5, '0:00'],
    [999, '0:00'],
    [61_000, '1:01'],
    [59 * 60_000 + 59_999, '59:59'],
    [3600_000, '1:00:00'],
    [3600_000 * 2 + 5 * 60_000 + 7_000, '2:05:07'],
  ])('%i ms → %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('formatRelative', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  it.each([
    [now - 30_000, null],
    [now - 5 * 60_000, '5 minutes ago'],
    [now - 2 * 3600_000, '2 hours ago'],
    [now - 26 * 3600_000, 'yesterday'],
    [now - 9 * 24 * 3600_000, 'last week'],
    [now - 400 * 24 * 3600_000, 'last year'],
  ])('%i → %s', (then, text) => {
    expect(formatRelative(then, now)).toBe(text);
  });
});
