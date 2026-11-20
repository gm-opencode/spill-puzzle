import { describe, expect, it } from 'vitest';
import {
  ATLAS_PADDING,
  chooseAtlasSize,
  packShelves,
  type AtlasFrame,
  type PackItem,
  type PackResult,
} from '../../../../src/game/bake/atlas';
import { computeGrid } from '../../../../src/game/geometry/grid';
import { generatePieceShapes } from '../../../../src/game/geometry/outline';

function overlaps(a: AtlasFrame, b: AtlasFrame, gap: number): boolean {
  if (a.atlas !== b.atlas) return false;
  return (
    a.x < b.x + b.width + gap &&
    b.x < a.x + a.width + gap &&
    a.y < b.y + b.height + gap &&
    b.y < a.y + a.height + gap
  );
}

function assertValidPacking(
  items: PackItem[],
  result: PackResult,
  maxSize: number,
  padding: number,
) {
  expect(result.frames).toHaveLength(items.length);
  result.frames.forEach((f, i) => {
    expect(f.width).toBe(items[i]!.width);
    expect(f.height).toBe(items[i]!.height);
    const atlas = result.atlases[f.atlas];
    expect(atlas).toBeDefined();
    expect(f.x).toBeGreaterThanOrEqual(padding);
    expect(f.y).toBeGreaterThanOrEqual(padding);
    expect(f.x + f.width + padding).toBeLessThanOrEqual(atlas!.width);
    expect(f.y + f.height + padding).toBeLessThanOrEqual(atlas!.height);
  });
  for (const atlas of result.atlases) {
    expect(atlas.width).toBeLessThanOrEqual(maxSize);
    expect(atlas.height).toBeLessThanOrEqual(maxSize);
  }
  // No overlaps, and at least `padding` px between frames.
  const frames = result.frames;
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      expect(overlaps(frames[i]!, frames[j]!, padding)).toBe(false);
    }
  }
}

/** Texture sizes of real puzzle pieces, as the baker requests them. */
function pieceItems(w: number, h: number, n: number): PackItem[] {
  const grid = computeGrid(w, h, n);
  return generatePieceShapes(grid, 1).map((s) => ({
    width: Math.ceil(s.bounds.width),
    height: Math.ceil(s.bounds.height),
  }));
}

describe('packShelves', () => {
  it.each([
    [2048, 1536, 12],
    [2048, 1536, 150],
    [1536, 2048, 300],
    [2048, 1152, 500],
  ])('packs a %i×%i, %i-piece puzzle into one 4096 atlas without overlaps', (w, h, n) => {
    const items = pieceItems(w, h, n);
    const result = packShelves(items, 4096);
    assertValidPacking(items, result, 4096, ATLAS_PADDING);
    expect(result.atlases).toHaveLength(1);
  });

  it('spills into several atlases when the max size is small', () => {
    const items = pieceItems(2048, 1536, 300);
    const result = packShelves(items, 1024);
    assertValidPacking(items, result, 1024, ATLAS_PADDING);
    expect(result.atlases.length).toBeGreaterThan(1);
    // Every atlas is used.
    const used = new Set(result.frames.map((f) => f.atlas));
    expect(used.size).toBe(result.atlases.length);
  });

  it('handles mixed sizes and respects a custom padding', () => {
    const items: PackItem[] = Array.from({ length: 60 }, (_, i) => ({
      width: 20 + ((i * 37) % 90),
      height: 15 + ((i * 53) % 70),
    }));
    for (const padding of [0, 1, 4]) {
      const result = packShelves(items, 256, padding);
      assertValidPacking(items, result, 256, padding);
    }
  });

  it('keeps a single atlas roughly square', () => {
    const items = pieceItems(2048, 1536, 150);
    const [atlas] = packShelves(items, 4096).atlases;
    expect(atlas!.width / atlas!.height).toBeGreaterThan(0.6);
    expect(atlas!.width / atlas!.height).toBeLessThan(1.7);
  });

  it('is deterministic', () => {
    const items = pieceItems(1536, 2048, 96);
    expect(packShelves(items, 2048)).toEqual(packShelves(items, 2048));
  });

  it('returns nothing for no items', () => {
    expect(packShelves([], 4096)).toEqual({ atlases: [], frames: [] });
  });

  it('rejects items that cannot fit and invalid sizes', () => {
    expect(() => packShelves([{ width: 4095, height: 10 }], 4096)).toThrow(RangeError);
    expect(() => packShelves([{ width: 10, height: 10.5 }], 4096)).toThrow(RangeError);
    expect(() => packShelves([{ width: 0, height: 10 }], 4096)).toThrow(RangeError);
    expect(() => packShelves([{ width: 10, height: 10 }], 0)).toThrow(RangeError);
  });
});

describe('chooseAtlasSize', () => {
  it('uses 4096, or 2048 when deviceMemory < 4', () => {
    expect(chooseAtlasSize(undefined)).toBe(4096);
    expect(chooseAtlasSize(8)).toBe(4096);
    expect(chooseAtlasSize(4)).toBe(4096);
    expect(chooseAtlasSize(2)).toBe(2048);
  });
});
