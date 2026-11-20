import { describe, expect, it } from 'vitest';
import {
  chooseMaxSide,
  fitWithin,
  ImageImportError,
  importImage,
  validateDimensions,
} from '../../../src/image/importImage';

describe('validateDimensions (FR-1.5)', () => {
  it('accepts images with both sides ≥ 400 px', () => {
    expect(validateDimensions({ width: 400, height: 400 })).toBeNull();
    expect(validateDimensions({ width: 4000, height: 3000 })).toBeNull();
  });

  it('rejects images with a side < 400 px', () => {
    expect(validateDimensions({ width: 300, height: 300 })).toBe('too-small');
    expect(validateDimensions({ width: 4000, height: 399 })).toBe('too-small');
    expect(validateDimensions({ width: 399, height: 4000 })).toBe('too-small');
  });

  it('treats empty or broken dimensions as unsupported', () => {
    expect(validateDimensions({ width: 0, height: 500 })).toBe('unsupported');
    expect(validateDimensions({ width: Number.NaN, height: 500 })).toBe('unsupported');
  });
});

describe('chooseMaxSide (spec §2.3)', () => {
  it('is 2048, or 1600 when deviceMemory < 4', () => {
    expect(chooseMaxSide(undefined)).toBe(2048);
    expect(chooseMaxSide(8)).toBe(2048);
    expect(chooseMaxSide(4)).toBe(2048);
    expect(chooseMaxSide(2)).toBe(1600);
    expect(chooseMaxSide(0.5)).toBe(1600);
  });
});

describe('fitWithin', () => {
  it('never scales up', () => {
    expect(fitWithin({ width: 900, height: 1600 }, 2048)).toEqual({ width: 900, height: 1600 });
    expect(fitWithin({ width: 2048, height: 1000 }, 2048)).toEqual({ width: 2048, height: 1000 });
  });

  it('scales the longest side down to the limit, keeping the aspect ratio', () => {
    expect(fitWithin({ width: 4032, height: 3024 }, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin({ width: 1600, height: 2400 }, 2048)).toEqual({ width: 1365, height: 2048 });
    expect(fitWithin({ width: 2048, height: 1536 }, 320)).toEqual({ width: 320, height: 240 });
  });

  it('keeps at least 1 px', () => {
    expect(fitWithin({ width: 10000, height: 1 }, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe('importImage', () => {
  it('rejects an empty file as unsupported', async () => {
    const err = await importImage(new Blob([])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImageImportError);
    expect((err as ImageImportError).code).toBe('unsupported');
    expect((err as ImageImportError).message).toMatch(/isn't supported/);
  });
});
