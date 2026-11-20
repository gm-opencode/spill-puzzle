import { describe, expect, it } from 'vitest';
import { computeGrid, gridScore, pieceCount } from '../../../../src/game/geometry/grid';

describe('computeGrid', () => {
  it.each([
    // [width, height, N, rows, cols]
    [2048, 1536, 48, 6, 8], // 4:3 → the example from spec §1.2
    [1536, 2048, 48, 8, 6], // 3:4 portrait
    [1600, 1600, 12, 3, 3], // square: 9 square pieces score better than 12 at 4:3 (spec §3 formula)
    [1600, 1600, 48, 7, 7], // square: 49 square pieces beat 48 non-square ones
    [2048, 1152, 24, 4, 6], // 16:9
    [2048, 1152, 150, 9, 16], // 16:9
    [2048, 1536, 300, 15, 20], // 4:3
    [2048, 1536, 500, 19, 26], // 4:3, desktop preset
    [2048, 878, 12, 2, 5], // 21:9 panorama, few pieces
  ])('%i×%i, N=%i → %i×%i', (w, h, n, rows, cols) => {
    const grid = computeGrid(w, h, n);
    expect({ rows: grid.rows, cols: grid.cols }).toEqual({ rows, cols });
    expect(grid.pw).toBe(w / cols);
    expect(grid.ph).toBe(h / rows);
    expect(grid.width).toBe(w);
    expect(grid.height).toBe(h);
  });

  it('picks the best-scoring candidate among cols ± 1 and rows ± 1', () => {
    for (const [w, h] of [
      [2048, 1536],
      [1536, 2048],
      [2048, 1152],
      [1200, 1900],
      [3000, 1000],
    ] as const) {
      for (const n of [12, 24, 48, 96, 150, 300, 500]) {
        const g = computeGrid(w, h, n);
        const cols0 = Math.max(2, Math.round(Math.sqrt((n * w) / h)));
        const rows0 = Math.max(2, Math.round(n / cols0));
        const best = gridScore(w, h, n, g.rows, g.cols);
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const rows = rows0 + dr;
            const cols = cols0 + dc;
            if (rows < 2 || cols < 2) continue;
            expect(gridScore(w, h, n, rows, cols)).toBeGreaterThanOrEqual(best);
          }
        }
      }
    }
  });

  it('keeps the piece count close to the target and pieces nearly square', () => {
    for (const [w, h] of [
      [2048, 1536],
      [1536, 2048],
      [2048, 1152],
      [1600, 1600],
    ] as const) {
      for (const n of [24, 48, 96, 150, 300, 500]) {
        const g = computeGrid(w, h, n);
        expect(Math.abs(pieceCount(g) - n) / n).toBeLessThan(0.15);
        const ratio = g.pw / g.ph;
        expect(ratio).toBeGreaterThan(0.8);
        expect(ratio).toBeLessThan(1.25);
      }
    }
  });

  it('never goes below 2 rows or 2 columns', () => {
    const g = computeGrid(4000, 400, 4);
    expect(g.rows).toBeGreaterThanOrEqual(2);
    expect(g.cols).toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid input', () => {
    expect(() => computeGrid(0, 100, 12)).toThrow(RangeError);
    expect(() => computeGrid(100, Number.NaN, 12)).toThrow(RangeError);
    expect(() => computeGrid(100, 100, 3)).toThrow(RangeError);
    expect(() => computeGrid(100, 100, 12.5)).toThrow(RangeError);
  });
});
