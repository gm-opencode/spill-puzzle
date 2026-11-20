/**
 * Bézier → polygon flattening (spec §4.5).
 */
import type { PathCommand, Point } from './types';

/** Default number of line segments per cubic Bézier (spec §4.5). */
export const DEFAULT_SEGMENTS_PER_CURVE = 8;

/** Evaluate a cubic Bézier at `t ∈ [0, 1]`. */
export function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Flatten a single closed path into a polygon.
 * Each cubic becomes `segmentsPerCurve` line segments; `L` adds its end point.
 * The closing point is not repeated, and consecutive duplicate points are dropped.
 *
 * @param commands Path starting with `M` (world px or any unit; units are preserved).
 * @param segmentsPerCurve Line segments per cubic (≥ 1).
 */
export function flattenPath(
  commands: readonly PathCommand[],
  segmentsPerCurve: number = DEFAULT_SEGMENTS_PER_CURVE,
): Point[] {
  if (!Number.isInteger(segmentsPerCurve) || segmentsPerCurve < 1) {
    throw new RangeError(`flattenPath: invalid segment count ${segmentsPerCurve}`);
  }
  const points: Point[] = [];
  let current: Point | null = null;
  let start: Point | null = null;

  const push = (p: Point) => {
    const prev = points[points.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) points.push(p);
  };

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        if (start) throw new Error('flattenPath: only single sub-path outlines are supported');
        current = { x: cmd.x, y: cmd.y };
        start = current;
        push(current);
        break;
      case 'L':
        if (!current) throw new Error('flattenPath: path must start with M');
        current = { x: cmd.x, y: cmd.y };
        push(current);
        break;
      case 'C': {
        if (!current) throw new Error('flattenPath: path must start with M');
        const p0 = current;
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x2, y: cmd.y2 };
        const p3 = { x: cmd.x, y: cmd.y };
        for (let i = 1; i < segmentsPerCurve; i++) {
          push(cubicPoint(p0, p1, p2, p3, i / segmentsPerCurve));
        }
        push(p3); // exact end point
        current = p3;
        break;
      }
      case 'Z':
        break;
    }
  }

  // Drop the closing point if it repeats the start.
  const last = points[points.length - 1];
  if (start && points.length > 1 && last && last.x === start.x && last.y === start.y) {
    points.pop();
  }
  return points;
}

/** Translate points by `(-origin.x, -origin.y)`, e.g. world px → piece-local px. */
export function toLocal(points: readonly Point[], origin: Point): Point[] {
  return points.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
}

/** Flatten `[{x, y}, …]` into `[x0, y0, x1, y1, …]` (the format Pixi's `Polygon` accepts). */
export function toFlatArray(points: readonly Point[]): number[] {
  const out: number[] = new Array<number>(points.length * 2);
  points.forEach((p, i) => {
    out[2 * i] = p.x;
    out[2 * i + 1] = p.y;
  });
  return out;
}

/**
 * Hit-area polygon of a piece in piece-local px, relative to the top-left of its
 * texture bounds (spec §4.5).
 */
export function pieceHitPolygon(
  outline: readonly PathCommand[],
  boundsOrigin: Point,
  segmentsPerCurve: number = DEFAULT_SEGMENTS_PER_CURVE,
): Point[] {
  return toLocal(flattenPath(outline, segmentsPerCurve), boundsOrigin);
}
