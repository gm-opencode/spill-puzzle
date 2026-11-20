import type { PathCommand, Point } from '../../../../src/game/geometry/types';

/** Every point referenced by a path (move/line/end points and Bézier control points). */
export function allPoints(commands: readonly PathCommand[]): Point[] {
  const out: Point[] = [];
  for (const c of commands) {
    if (c.type === 'M' || c.type === 'L') out.push({ x: c.x, y: c.y });
    if (c.type === 'C') out.push({ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y });
  }
  return out;
}

/**
 * Split a piece outline (`M`, four edges, `Z`) into its four sides, each as the
 * ordered list of points it passes through, including its start point.
 * Border sides are one `L`; internal sides are six `C`s.
 */
export function outlineSides(outline: readonly PathCommand[]): Point[][] {
  const first = outline[0];
  if (!first || first.type !== 'M') throw new Error('outline must start with M');
  const body = outline.slice(1, -1);
  const sides: Point[][] = [];
  let cursor: Point = { x: first.x, y: first.y };
  let i = 0;
  while (i < body.length) {
    const cmd = body[i];
    const n = cmd?.type === 'L' ? 1 : 6;
    const side = body.slice(i, i + n);
    const points = [cursor, ...allPoints(side)];
    sides.push(points);
    cursor = points[points.length - 1] ?? cursor;
    i += n;
  }
  return sides;
}

/** Signed polygon area (shoelace). Positive for clockwise polygons in screen coordinates (y down). */
export function polygonArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True if any two non-adjacent edges of the closed polygon properly cross. */
export function selfIntersects(points: readonly Point[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing edge
      if (segmentsIntersect(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)) {
        return true;
      }
    }
  }
  return false;
}
