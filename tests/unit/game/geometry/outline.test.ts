import { describe, expect, it } from 'vitest';
import { generateEdges } from '../../../../src/game/geometry/edges';
import { flattenPath } from '../../../../src/game/geometry/flatten';
import { computeGrid, type Grid } from '../../../../src/game/geometry/grid';
import {
  generatePieceShapes,
  pieceBounds,
  pieceOutline,
  piecePad,
} from '../../../../src/game/geometry/outline';
import { allPoints, outlineSides, polygonArea, selfIntersects } from './helpers';

const CASES: Array<[number, number, number, number]> = [
  // width, height, N, seed
  [2048, 1536, 48, 12345],
  [1536, 2048, 24, 1],
  [2048, 1152, 150, 0xdeadbeef],
  [1600, 1600, 12, 7],
  [2048, 878, 96, 2024],
];

function grids(): Array<[Grid, number]> {
  return CASES.map(([w, h, n, seed]) => [computeGrid(w, h, n), seed]);
}

describe('pieceBounds', () => {
  it('pads the cell by ceil(max(pw, ph) · 0.28)', () => {
    const grid = computeGrid(2048, 1536, 48); // 256 × 256 pieces
    expect(piecePad(grid)).toBe(Math.ceil(256 * 0.28));
    expect(pieceBounds(grid, 2, 3)).toEqual({
      x: 3 * 256 - 72,
      y: 2 * 256 - 72,
      width: 256 + 144,
      height: 256 + 144,
    });
  });
});

describe('pieceOutline', () => {
  it('is a closed path starting at the top-left corner', () => {
    const grid = computeGrid(2048, 1536, 48);
    const edges = generateEdges(grid.rows, grid.cols, 1);
    const outline = pieceOutline(grid, edges, 1, 2);
    expect(outline[0]).toEqual({ type: 'M', x: 2 * grid.pw, y: grid.ph });
    expect(outline.at(-1)).toEqual({ type: 'Z' });
    const last = outline.at(-2);
    expect(last).toMatchObject({ x: 2 * grid.pw, y: grid.ph });
  });

  it('is identical for the same (rows, cols, seed) (snapshot)', () => {
    const grid = computeGrid(1200, 900, 12);
    const a = generatePieceShapes(grid, 777);
    const b = generatePieceShapes(grid, 777);
    expect(a).toEqual(b);
    expect(a[5]).toMatchSnapshot();
  });

  it.each(grids())('neighbours share exactly the same edge points, reversed (%#)', (grid, seed) => {
    const shapes = generatePieceShapes(grid, seed);
    const sides = shapes.map((s) => outlineSides(s.outline));
    const at = (r: number, c: number) => sides[r * grid.cols + c]!;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const [top, right, bottom, left] = at(r, c);
        expect([top, right, bottom, left].every(Boolean)).toBe(true);
        if (c < grid.cols - 1) {
          const neighbourLeft = at(r, c + 1)[3]!;
          expect(neighbourLeft).toEqual(right!.slice().reverse());
        }
        if (r < grid.rows - 1) {
          const neighbourTop = at(r + 1, c)[0]!;
          expect(neighbourTop).toEqual(bottom!.slice().reverse());
        }
      }
    }
  });

  it.each(grids())('border edges are straight lines on the board edge (%#)', (grid, seed) => {
    const shapes = generatePieceShapes(grid, seed);
    for (const shape of shapes) {
      const [top, right, bottom, left] = outlineSides(shape.outline);
      const checks: Array<
        [boolean, Array<{ x: number; y: number }> | undefined, 'x' | 'y', number]
      > = [
        [shape.row === 0, top, 'y', 0],
        [shape.col === grid.cols - 1, right, 'x', grid.cols * grid.pw],
        [shape.row === grid.rows - 1, bottom, 'y', grid.rows * grid.ph],
        [shape.col === 0, left, 'x', 0],
      ];
      for (const [isBorder, side, axis, value] of checks) {
        expect(side).toBeDefined();
        if (isBorder) {
          expect(side).toHaveLength(2); // start + one straight line
          for (const p of side!) expect(p[axis]).toBe(value);
        } else {
          expect(side).toHaveLength(19); // start + 6 cubics × 3 points
        }
      }
    }
  });

  it.each(grids())('outline and polygon points stay within the piece bounds (%#)', (grid, seed) => {
    for (const shape of generatePieceShapes(grid, seed)) {
      const b = shape.bounds;
      const points = [...allPoints(shape.outline), ...flattenPath(shape.outline)];
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(b.x);
        expect(p.x).toBeLessThanOrEqual(b.x + b.width);
        expect(p.y).toBeGreaterThanOrEqual(b.y);
        expect(p.y).toBeLessThanOrEqual(b.y + b.height);
      }
    }
  });

  it.each(grids())(
    'pieces are simple polygons that tile the board without gaps (%#)',
    (grid, seed) => {
      let total = 0;
      for (const shape of generatePieceShapes(grid, seed)) {
        const poly = flattenPath(shape.outline, 16);
        expect(selfIntersects(poly)).toBe(false);
        const area = polygonArea(poly);
        expect(area).toBeGreaterThan(0); // clockwise in screen coordinates
        total += area;
      }
      // Shared edges are flattened identically from both sides, so areas must sum to the board.
      expect(total / (grid.width * grid.height)).toBeCloseTo(1, 9);
    },
  );
});

describe('generatePieceShapes', () => {
  it('returns rows × cols shapes ordered by id = r · cols + c', () => {
    const grid = computeGrid(2048, 1536, 48);
    const shapes = generatePieceShapes(grid, 1);
    expect(shapes).toHaveLength(48);
    shapes.forEach((s, i) => {
      expect(s.id).toBe(i);
      expect(s.row * grid.cols + s.col).toBe(i);
    });
  });
});
