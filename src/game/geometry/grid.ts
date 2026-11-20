/**
 * Grid calculation (spec §3).
 */

/** Rows × columns for a puzzle plus the piece size in world px (= image px). */
export interface Grid {
  rows: number;
  cols: number;
  /** Image (= board) width in world px. */
  width: number;
  /** Image (= board) height in world px. */
  height: number;
  /** Piece width in world px (floating point). */
  pw: number;
  /** Piece height in world px (floating point). */
  ph: number;
}

/** Minimum number of rows and columns. */
export const MIN_GRID_SIDE = 2;

/**
 * Score a candidate grid: relative piece-count error plus how far the pieces are from square.
 * Lower is better.
 */
export function gridScore(
  width: number,
  height: number,
  target: number,
  rows: number,
  cols: number,
): number {
  const countError = Math.abs(rows * cols - target) / target;
  const squareness = Math.abs(Math.log(width / cols / (height / rows)));
  return countError + squareness;
}

/**
 * Compute rows and columns for an image so the piece count is close to `target`
 * and pieces are as square as possible (FR-2.2, spec §3).
 *
 * Candidates are the initial estimate with `cols ± 1` and `rows ± 1` (never below
 * {@link MIN_GRID_SIDE}). Ties are broken by the first candidate in the order
 * `cols - 1 .. cols + 1`, then `rows - 1 .. rows + 1`.
 *
 * @param width Image width in px (> 0).
 * @param height Image height in px (> 0).
 * @param target Desired piece count (≥ 4).
 */
export function computeGrid(width: number, height: number, target: number): Grid {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new RangeError(`computeGrid: invalid image size ${width}×${height}`);
  }
  if (!Number.isInteger(target) || target < MIN_GRID_SIDE * MIN_GRID_SIDE) {
    throw new RangeError(`computeGrid: invalid piece count ${target}`);
  }

  const aspect = width / height;
  const cols0 = Math.max(MIN_GRID_SIDE, Math.round(Math.sqrt(target * aspect)));
  const rows0 = Math.max(MIN_GRID_SIDE, Math.round(target / cols0));

  let best = { rows: rows0, cols: cols0, score: Infinity };
  for (let dc = -1; dc <= 1; dc++) {
    const cols = cols0 + dc;
    if (cols < MIN_GRID_SIDE) continue;
    for (let dr = -1; dr <= 1; dr++) {
      const rows = rows0 + dr;
      if (rows < MIN_GRID_SIDE) continue;
      const score = gridScore(width, height, target, rows, cols);
      if (score < best.score) best = { rows, cols, score };
    }
  }

  return {
    rows: best.rows,
    cols: best.cols,
    width,
    height,
    pw: width / best.cols,
    ph: height / best.rows,
  };
}

/** Total number of pieces in a grid. */
export function pieceCount(grid: Pick<Grid, 'rows' | 'cols'>): number {
  return grid.rows * grid.cols;
}

/**
 * Build a grid from known rows and columns (e.g. from a saved `PuzzleMeta`).
 * @param width Image width in px.
 * @param height Image height in px.
 */
export function makeGrid(width: number, height: number, rows: number, cols: number): Grid {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new RangeError(`makeGrid: invalid image size ${width}×${height}`);
  }
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) {
    throw new RangeError(`makeGrid: invalid grid ${rows}×${cols}`);
  }
  return { rows, cols, width, height, pw: width / cols, ph: height / rows };
}
