import { describe, expect, it } from 'vitest';
import { mulberry32, randomRange, randomSign } from '../../../../src/game/geometry/rng';

describe('mulberry32', () => {
  it('produces the reference sequence for a fixed seed', () => {
    const rng = mulberry32(42);
    const values = Array.from({ length: 5 }, () => rng());
    expect(values).toMatchSnapshot();
  });

  it('is deterministic per seed and differs between seeds', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const c = mulberry32(124);
    const seqA = Array.from({ length: 50 }, () => a());
    const seqB = Array.from({ length: 50 }, () => b());
    const seqC = Array.from({ length: 50 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('returns values in [0, 1)', () => {
    const rng = mulberry32(0xdeadbeef);
    for (let i = 0; i < 10_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('treats seeds as uint32', () => {
    const a = mulberry32(-1);
    const b = mulberry32(0xffffffff);
    expect(a()).toBe(b());
  });
});

describe('randomRange / randomSign', () => {
  it('stays within the range', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = randomRange(rng, 0.42, 0.58);
      expect(v).toBeGreaterThanOrEqual(0.42);
      expect(v).toBeLessThan(0.58);
    }
  });

  it('returns both signs', () => {
    const rng = mulberry32(7);
    const signs = new Set(Array.from({ length: 100 }, () => randomSign(rng)));
    expect(signs).toEqual(new Set([1, -1]));
  });
});
