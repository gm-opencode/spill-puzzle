import { describe, expect, it } from 'vitest';
import {
  cubicPoint,
  flattenPath,
  pieceHitPolygon,
  toFlatArray,
  toLocal,
} from '../../../../src/game/geometry/flatten';
import { computeGrid } from '../../../../src/game/geometry/grid';
import { generatePieceShapes } from '../../../../src/game/geometry/outline';
import type { PathCommand } from '../../../../src/game/geometry/types';

const square: PathCommand[] = [
  { type: 'M', x: 0, y: 0 },
  { type: 'L', x: 10, y: 0 },
  { type: 'L', x: 10, y: 10 },
  { type: 'L', x: 0, y: 10 },
  { type: 'L', x: 0, y: 0 },
  { type: 'Z' },
];

describe('cubicPoint', () => {
  it('hits the end points at t = 0 and t = 1', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 0 },
    ] as const;
    expect(cubicPoint(...p, 0)).toEqual({ x: 0, y: 0 });
    expect(cubicPoint(...p, 1)).toEqual({ x: 4, y: 0 });
    expect(cubicPoint(...p, 0.5)).toEqual({ x: 2, y: 1.5 });
  });
});

describe('flattenPath', () => {
  it('keeps straight lines and drops the repeated closing point', () => {
    expect(flattenPath(square)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it('splits each cubic into the requested number of segments', () => {
    const path: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 2, x2: 3, y2: 2, x: 4, y: 0 },
      { type: 'L', x: 0, y: 0 },
      { type: 'Z' },
    ];
    expect(flattenPath(path, 8)).toHaveLength(9); // start + 7 inner + end
    expect(flattenPath(path, 4)).toHaveLength(5);
    expect(flattenPath(path, 8)[8]).toEqual({ x: 4, y: 0 });
  });

  it('produces about 8 points per Bézier for a piece outline', () => {
    const grid = computeGrid(2048, 1536, 48);
    const inner = generatePieceShapes(grid, 1).find((s) => s.row === 2 && s.col === 3)!;
    // 4 internal edges × 6 cubics × 8 segments, closing point dropped.
    expect(flattenPath(inner.outline)).toHaveLength(4 * 6 * 8);
  });

  it('rejects malformed input', () => {
    expect(() => flattenPath(square, 0)).toThrow(RangeError);
    expect(() => flattenPath([{ type: 'L', x: 1, y: 1 }])).toThrow();
    expect(() => flattenPath([{ type: 'C', x1: 0, y1: 0, x2: 0, y2: 0, x: 1, y: 1 }])).toThrow();
    expect(() =>
      flattenPath([
        { type: 'M', x: 0, y: 0 },
        { type: 'M', x: 1, y: 1 },
      ]),
    ).toThrow();
  });
});

describe('piece-local helpers', () => {
  it('converts to local coordinates and flat arrays', () => {
    const local = toLocal(flattenPath(square), { x: 5, y: -5 });
    expect(local[0]).toEqual({ x: -5, y: 5 });
    expect(toFlatArray(local)).toEqual([-5, 5, 5, 5, 5, 15, -5, 15]);
  });

  it('places the hit polygon inside the texture rectangle', () => {
    const grid = computeGrid(1536, 2048, 96);
    for (const shape of generatePieceShapes(grid, 31337)) {
      const poly = pieceHitPolygon(shape.outline, shape.bounds);
      for (const p of poly) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(shape.bounds.width);
        expect(p.y).toBeLessThanOrEqual(shape.bounds.height);
      }
    }
  });
});
