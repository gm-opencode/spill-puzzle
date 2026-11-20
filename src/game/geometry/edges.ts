/**
 * Edge parameters and edge curves (spec §4.1–4.2).
 *
 * Changing anything in this file that affects output (RNG draw order, ranges,
 * control points) changes every saved puzzle's cut: bump `GENERATOR_VERSION`
 * and keep the old code path (spec §7, AGENTS.md rule 8).
 */
import type { Grid } from './grid';
import { mulberry32, randomRange, randomSign } from './rng';
import type { PathCommand, Point } from './types';

/** Bump when the generated shapes change (spec §7). */
export const GENERATOR_VERSION = 1;

/**
 * Shape parameters of one internal edge. Lengths are fractions of the edge length.
 */
export interface EdgeParams {
  /**
   * Which side the tab protrudes to. `+1` = the left-hand side of the edge's
   * canonical direction in screen coordinates (y down): up for a horizontal
   * edge (into the upper piece), right for a vertical edge (into the right piece).
   * `-1` = the other side.
   */
  dir: 1 | -1;
  /** Tab position along the edge, in `[0.42, 0.58]`. */
  center: number;
  /** Tab height, in `[0.18, 0.24]`. */
  size: number;
  /** Half-width of the neck at the edge line, in `[0.08, 0.11]`. */
  neck: number;
  /** Offset of the left shoulder end, perpendicular to the edge, in `[-0.03, 0.03]`. */
  j1: number;
  /** Offset of the right shoulder end, perpendicular to the edge, in `[-0.03, 0.03]`. */
  j2: number;
}

/** Parameter ranges from spec §4.1. */
export const EDGE_RANGES = {
  center: [0.42, 0.58],
  size: [0.18, 0.24],
  neck: [0.08, 0.11],
  jitter: [-0.03, 0.03],
} as const;

/**
 * All internal edges of a grid.
 * - `horizontal[r][c]`: the edge between pieces `(r, c)` and `(r + 1, c)`; `r ∈ [0, rows-2]`.
 *   Canonical direction: left → right.
 * - `vertical[r][c]`: the edge between pieces `(r, c)` and `(r, c + 1)`; `c ∈ [0, cols-2]`.
 *   Canonical direction: top → bottom.
 */
export interface EdgeSet {
  rows: number;
  cols: number;
  horizontal: EdgeParams[][];
  vertical: EdgeParams[][];
}

/** One cubic Bézier segment: start, control 1, control 2, end. */
export type CubicSegment = readonly [Point, Point, Point, Point];

/** Bulb radius as a fraction of the tab size (spec §4.2: "≈ size·0.5"). */
export const BULB_RADIUS_FACTOR = 0.55;
/** Circle approximation constant for a quarter arc with one cubic. */
const KAPPA = 0.5522847498;

/**
 * Draw the parameters of one edge. Consumes exactly six RNG values, in the
 * order dir, center, size, neck, j1, j2.
 */
export function randomEdgeParams(rng: () => number): EdgeParams {
  const dir = randomSign(rng);
  const center = randomRange(rng, EDGE_RANGES.center[0], EDGE_RANGES.center[1]);
  const size = randomRange(rng, EDGE_RANGES.size[0], EDGE_RANGES.size[1]);
  const neck = randomRange(rng, EDGE_RANGES.neck[0], EDGE_RANGES.neck[1]);
  const j1 = randomRange(rng, EDGE_RANGES.jitter[0], EDGE_RANGES.jitter[1]);
  const j2 = randomRange(rng, EDGE_RANGES.jitter[0], EDGE_RANGES.jitter[1]);
  return { dir, center, size, neck, j1, j2 };
}

/**
 * Generate all internal edges deterministically from a seed (spec §4.1).
 * Draw order: every horizontal edge row-major, then every vertical edge row-major.
 *
 * @param rows Number of rows (≥ 1).
 * @param cols Number of columns (≥ 1).
 * @param seed Puzzle seed (uint32).
 */
export function generateEdges(rows: number, cols: number, seed: number): EdgeSet {
  const rng = mulberry32(seed);
  const horizontal: EdgeParams[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    const row: EdgeParams[] = [];
    for (let c = 0; c < cols; c++) row.push(randomEdgeParams(rng));
    horizontal.push(row);
  }
  const vertical: EdgeParams[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: EdgeParams[] = [];
    for (let c = 0; c < cols - 1; c++) row.push(randomEdgeParams(rng));
    vertical.push(row);
  }
  return { rows, cols, horizontal, vertical };
}

/**
 * The edge curve in the local frame from `(0, 0)` to `(1, 0)` (spec §4.2).
 * Units are edge lengths; the tab peaks at `(center, -size·dir)`.
 * Six cubics: shoulder, neck in, two bulb quarter arcs, neck out, shoulder.
 *
 * All control points lie within `u ∈ [0, 1]` and `|v| ≤ max(size, |j1|, |j2|)`,
 * so the curve (inside the control polygon's convex hull) does too.
 */
export function localEdgeSegments(p: EdgeParams): CubicSegment[] {
  const k = -p.dir; // sign of v towards the tab
  const c = p.center;
  const r = p.size * BULB_RADIUS_FACTOR;
  const h = p.size - r; // height of the bulb's centre (and its widest point)
  const kr = KAPPA * r;
  const leftBase = c - p.neck;
  const rightBase = c + p.neck;

  const pt = (x: number, y: number): Point => ({ x, y });
  const P0 = pt(0, 0);
  const B1 = pt(leftBase, p.j1); // left neck base
  const W1 = pt(c - r, k * h); // left widest point of the bulb
  const T = pt(c, k * p.size); // tab peak
  const W2 = pt(c + r, k * h);
  const B2 = pt(rightBase, p.j2);
  const P1 = pt(1, 0);

  return [
    // 1. Shoulder, arriving horizontally at the neck base.
    [P0, pt(leftBase * 0.35, 0), pt(leftBase * 0.7, p.j1), B1],
    // 2. Neck in: start inwards (pinch), arrive vertically at the bulb.
    [B1, pt(c - p.neck * 0.5, p.j1), pt(c - r, k * h * 0.4), W1],
    // 3. Bulb, left quarter arc to the peak.
    [W1, pt(c - r, k * (h + kr)), pt(c - kr, k * p.size), T],
    // 3b. Bulb, right quarter arc down.
    [T, pt(c + kr, k * p.size), pt(c + r, k * (h + kr)), W2],
    // 4. Neck out, mirror of step 2.
    [W2, pt(c + r, k * h * 0.4), pt(c + p.neck * 0.5, p.j2), B2],
    // 5. Shoulder to the end.
    [B2, pt(rightBase + (1 - rightBase) * 0.3, p.j2), pt(1 - (1 - rightBase) * 0.35, 0), P1],
  ];
}

/**
 * Map the local edge curve onto the world segment `from → to`.
 * Local `u` runs along `to - from`; local `v` runs along `(-dy, dx)`, which is the
 * right-hand side in screen coordinates (y down). Both are scaled by the edge length.
 * The first and last points are exactly `from` and `to`, so edges meet at corners
 * without floating-point gaps.
 */
export function worldEdgeSegments(p: EdgeParams, from: Point, to: Point): CubicSegment[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const map = (q: Point): Point => ({
    x: from.x + q.x * dx - q.y * dy,
    y: from.y + q.x * dy + q.y * dx,
  });
  const local = localEdgeSegments(p);
  const last = local.length - 1;
  return local.map(([a, b, c, d], i) => {
    const start = i === 0 ? { ...from } : map(a);
    const end = i === last ? { ...to } : map(d);
    return [start, map(b), map(c), end] as const;
  });
}

/**
 * Path commands for one edge, without the initial move (spec §4.2).
 *
 * `from` and `to` are the edge's endpoints in its **canonical** direction. When
 * `reversed` is true the commands trace the same points from `to` back to `from`.
 * Both neighbouring pieces therefore use exactly the same points, which
 * guarantees a perfect fit. `params === null` is a straight border edge.
 *
 * @param params Edge shape, or `null` for a border edge.
 * @param from Canonical start point (world px).
 * @param to Canonical end point (world px).
 * @param reversed Trace the edge from `to` to `from`.
 */
export function edgePath(
  params: EdgeParams | null,
  from: Point,
  to: Point,
  reversed: boolean,
): PathCommand[] {
  if (params === null) {
    const end = reversed ? from : to;
    return [{ type: 'L', x: end.x, y: end.y }];
  }
  const segments = worldEdgeSegments(params, from, to);
  if (!reversed) {
    return segments.map(([, c1, c2, end]) => cubic(c1, c2, end));
  }
  return segments
    .slice()
    .reverse()
    .map(([start, c1, c2]) => cubic(c2, c1, start));
}

function cubic(c1: Point, c2: Point, end: Point): PathCommand {
  return { type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: end.x, y: end.y };
}

/** Edge parameters on each side of piece `(r, c)`; `null` for border sides. */
export interface PieceEdges {
  top: EdgeParams | null;
  right: EdgeParams | null;
  bottom: EdgeParams | null;
  left: EdgeParams | null;
}

/** Look up the four edges of piece `(r, c)`. */
export function pieceEdges(edges: EdgeSet, r: number, c: number): PieceEdges {
  return {
    top: r > 0 ? at(edges.horizontal, r - 1, c) : null,
    bottom: r < edges.rows - 1 ? at(edges.horizontal, r, c) : null,
    left: c > 0 ? at(edges.vertical, r, c - 1) : null,
    right: c < edges.cols - 1 ? at(edges.vertical, r, c) : null,
  };
}

function at(table: EdgeParams[][], r: number, c: number): EdgeParams {
  const e = table[r]?.[c];
  if (!e) throw new RangeError(`Edge (${r}, ${c}) out of range`);
  return e;
}

/** Corner `(r, c)` of the grid lattice in world px. Always computed the same way so shared corners match exactly. */
export function gridCorner(grid: Pick<Grid, 'pw' | 'ph'>, r: number, c: number): Point {
  return { x: c * grid.pw, y: r * grid.ph };
}
