import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET,
  difficultyOptions,
  randomSeed,
  titleFromFileName,
} from '../../../src/screens/new/difficulty';

describe('difficulty presets (FR-2.1)', () => {
  it('offers 12–300, plus 500 on desktop, defaulting to 48', () => {
    expect(difficultyOptions(false)).toEqual([12, 24, 48, 96, 150, 300]);
    expect(difficultyOptions(true)).toEqual([12, 24, 48, 96, 150, 300, 500]);
    expect(DEFAULT_PRESET).toBe(48);
  });
});

describe('titleFromFileName', () => {
  it('strips the extension and separators', () => {
    expect(titleFromFileName('IMG_2024-07-01.jpeg', 'Puzzle')).toBe('IMG 2024 07 01');
    expect(titleFromFileName('Beach day.png', 'Puzzle')).toBe('Beach day');
  });

  it('falls back for empty names and trims long ones', () => {
    expect(titleFromFileName(undefined, 'Puzzle')).toBe('Puzzle');
    expect(titleFromFileName('.jpg', 'Puzzle')).toBe('Puzzle');
    expect(titleFromFileName(`${'a'.repeat(80)}.jpg`, 'Puzzle')).toHaveLength(60);
  });
});

describe('randomSeed', () => {
  it('returns uint32 values', () => {
    for (let i = 0; i < 20; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });
});
