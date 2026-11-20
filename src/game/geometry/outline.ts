/**
 * Piece outlines and bounds (spec §4.3–4.4).
 */
import { edgePath, generateEdges, gridCorner, pieceEdges } from './edges';
import type { EdgeSet } from './edges';
import type { Grid } from './grid';
import type { PathCommand, Rect } from './types';

/** Padding around a piece cell, as a fraction of the larger piece side (spec §4.4). */
export const PAD_FACTOR = 0.28;

/**
 * Padding in world px around each piece cell. Covers the maximum tab protrusion and jitter.
 */
export function piecePad(grid: Pick<Grid, 'pw' | 'ph'>): number {
  return Math.ceil(Math.max(grid.pw, grid.ph) * PAD_FACTOR);
}

/**
 * The texture rectangle of piece `(r, c)` in world px:
 * `(c·pw - pad, r·ph - pad, pw + 2·pad, ph + 2·pad)` (spec §4.4).
 */
export function pieceBounds(grid: Pick<Grid, 'pw' | 'ph'>, r: number, c: number): Rect {
  const pad = piecePad(grid);
  const corner = gridCorner(grid, r, c);
  return {
    x: corner.x - pad,
    y: corner.y - pad,
    width: grid.pw + 2 * pad,
    height: grid.ph + 2 * pad,
  };
}

/**
 * Closed outline of piece `(r, c)` in world px (spec §4.3). Edges are combined
 * clockwise: top (left→right), right (top→bottom), bottom (right→left), left (bottom→top).
 * Starts with `M` at the top-left corner and ends with `Z`.
 */
export function pieceOutline(
  grid: Pick<Grid, 'pw' | 'ph'>,
  edges: EdgeSet,
  r: number,
  c: number,
): PathCommand[] {
  const e = pieceEdges(edges, r, c);
  const tl = gridCorner(grid, r, c);
  const tr = gridCorner(grid, r, c + 1);
  const br = gridCorner(grid, r + 1, c + 1);
  const bl = gridCorner(grid, r + 1, c);
  return [
    { type: 'M', x: tl.x, y: tl.y },
    // Horizontal edges run left→right canonically; vertical edges top→bottom.
    ...edgePath(e.top, tl, tr, false),
    ...edgePath(e.right, tr, br, false),
    ...edgePath(e.bottom, bl, br, true),
    ...edgePath(e.left, tl, bl, true),
    { type: 'Z' },
  ];
}

/** Everything needed to draw and hit-test one piece. */
export interface PieceShape {
  /** `r * cols + c`. */
  id: number;
  row: number;
  col: number;
  /** Closed outline in world px. */
  outline: PathCommand[];
  /** Texture rectangle in world px. */
  bounds: Rect;
}

/**
 * Generate the shapes of every piece, deterministically for `(rows, cols, seed)`
 * and the grid's piece size. Ordered by piece id.
 */
export function generatePieceShapes(grid: Grid, seed: number): PieceShape[] {
  const edges = generateEdges(grid.rows, grid.cols, seed);
  const shapes: PieceShape[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      shapes.push({
        id: r * grid.cols + c,
        row: r,
        col: c,
        outline: pieceOutline(grid, edges, r, c),
        bounds: pieceBounds(grid, r, c),
      });
    }
  }
  return shapes;
}
