import { describe, expect, it } from 'vitest';
import {
  EDGE_RANGES,
  edgePath,
  generateEdges,
  GENERATOR_VERSION,
  localEdgeSegments,
  pieceEdges,
  randomEdgeParams,
  type EdgeParams,
} from '../../../../src/game/geometry/edges';
import { mulberry32 } from '../../../../src/game/geometry/rng';
import { allPoints } from './helpers';

const SAMPLE: EdgeParams = { dir: 1, center: 0.5, size: 0.2, neck: 0.1, j1: 0.02, j2: -0.01 };

describe('generateEdges', () => {
  it('creates (rows-1)×cols horizontal and rows×(cols-1) vertical edges', () => {
    const e = generateEdges(4, 6, 1);
    expect(e.horizontal).toHaveLength(3);
    e.horizontal.forEach((row) => expect(row).toHaveLength(6));
    expect(e.vertical).toHaveLength(4);
    e.vertical.forEach((row) => expect(row).toHaveLength(5));
  });

  it('draws every parameter within the spec ranges', () => {
    const e = generateEdges(20, 25, 987654321);
    for (const p of [...e.horizontal.flat(), ...e.vertical.flat()]) {
      expect([1, -1]).toContain(p.dir);
      expect(p.center).toBeGreaterThanOrEqual(EDGE_RANGES.center[0]);
      expect(p.center).toBeLessThanOrEqual(EDGE_RANGES.center[1]);
      expect(p.size).toBeGreaterThanOrEqual(EDGE_RANGES.size[0]);
      expect(p.size).toBeLessThanOrEqual(EDGE_RANGES.size[1]);
      expect(p.neck).toBeGreaterThanOrEqual(EDGE_RANGES.neck[0]);
      expect(p.neck).toBeLessThanOrEqual(EDGE_RANGES.neck[1]);
      for (const j of [p.j1, p.j2]) {
        expect(j).toBeGreaterThanOrEqual(EDGE_RANGES.jitter[0]);
        expect(j).toBeLessThanOrEqual(EDGE_RANGES.jitter[1]);
      }
    }
  });

  it('is deterministic for a seed and changes with the seed', () => {
    expect(generateEdges(5, 7, 42)).toEqual(generateEdges(5, 7, 42));
    expect(generateEdges(5, 7, 42)).not.toEqual(generateEdges(5, 7, 43));
  });

  it('matches the snapshot for generator version 1 (changing this requires a version bump)', () => {
    expect(GENERATOR_VERSION).toBe(1);
    expect(generateEdges(3, 4, 12345)).toMatchSnapshot();
  });

  it('consumes six RNG values per edge in a fixed order', () => {
    const rng = mulberry32(99);
    const first = randomEdgeParams(rng);
    const e = generateEdges(2, 1, 99); // exactly one horizontal edge, no vertical ones
    expect(e.horizontal[0]?.[0]).toEqual(first);
    const r2 = mulberry32(99);
    for (let i = 0; i < 6; i++) r2();
    expect(randomEdgeParams(r2)).toEqual(randomEdgeParams(rng));
  });
});

describe('pieceEdges', () => {
  it('returns null on border sides and shared params on internal sides', () => {
    const e = generateEdges(3, 3, 5);
    const corner = pieceEdges(e, 0, 0);
    expect(corner.top).toBeNull();
    expect(corner.left).toBeNull();
    const middle = pieceEdges(e, 1, 1);
    expect(middle.top).toBe(e.horizontal[0]?.[1]);
    expect(middle.bottom).toBe(e.horizontal[1]?.[1]);
    expect(middle.left).toBe(e.vertical[1]?.[0]);
    expect(middle.right).toBe(e.vertical[1]?.[1]);
    expect(pieceEdges(e, 0, 1).bottom).toBe(pieceEdges(e, 1, 1).top);
    expect(pieceEdges(e, 1, 0).right).toBe(pieceEdges(e, 1, 1).left);
  });

  it('throws when the grid is smaller than requested', () => {
    const e = generateEdges(2, 2, 5);
    expect(() => pieceEdges(e, 0, 0)).not.toThrow();
    expect(() => pieceEdges({ ...e, rows: 3 }, 1, 0)).toThrow(RangeError);
  });
});

describe('localEdgeSegments', () => {
  it('runs from (0,0) to (1,0) with continuous segments', () => {
    const segs = localEdgeSegments(SAMPLE);
    expect(segs).toHaveLength(6);
    expect(segs[0]?.[0]).toEqual({ x: 0, y: 0 });
    expect(segs[5]?.[3]).toEqual({ x: 1, y: 0 });
    for (let i = 1; i < segs.length; i++) expect(segs[i]?.[0]).toEqual(segs[i - 1]?.[3]);
  });

  it('peaks at (center, -size·dir)', () => {
    for (const dir of [1, -1] as const) {
      const segs = localEdgeSegments({ ...SAMPLE, dir });
      expect(segs[2]?.[3]).toEqual({ x: SAMPLE.center, y: -SAMPLE.size * dir });
    }
  });

  it('keeps all control points within u ∈ [0,1] and |v| ≤ size', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const p = randomEdgeParams(rng);
      for (const seg of localEdgeSegments(p)) {
        for (const q of seg) {
          expect(q.x).toBeGreaterThanOrEqual(0);
          expect(q.x).toBeLessThanOrEqual(1);
          expect(Math.abs(q.y)).toBeLessThanOrEqual(
            Math.max(p.size, Math.abs(p.j1), Math.abs(p.j2)),
          );
        }
      }
    }
  });
});

describe('edgePath', () => {
  const from = { x: 100, y: 200 };
  const to = { x: 356, y: 200 };

  it('draws a straight line for border edges, forward and reversed', () => {
    expect(edgePath(null, from, to, false)).toEqual([{ type: 'L', x: 356, y: 200 }]);
    expect(edgePath(null, from, to, true)).toEqual([{ type: 'L', x: 100, y: 200 }]);
  });

  it('ends exactly at the target point in both directions', () => {
    const fwd = edgePath(SAMPLE, from, to, false);
    const rev = edgePath(SAMPLE, from, to, true);
    expect(fwd.at(-1)).toMatchObject({ x: to.x, y: to.y });
    expect(rev.at(-1)).toMatchObject({ x: from.x, y: from.y });
  });

  it('reversed traces exactly the same points in the opposite order', () => {
    const fwd = [from, ...allPoints(edgePath(SAMPLE, from, to, false))];
    const rev = [to, ...allPoints(edgePath(SAMPLE, from, to, true))];
    expect(rev).toEqual(fwd.slice().reverse());
  });

  it('protrudes up for dir = +1 and down for dir = -1 on a left→right edge', () => {
    const minY = (dir: 1 | -1) =>
      Math.min(...allPoints(edgePath({ ...SAMPLE, dir }, from, to, false)).map((p) => p.y));
    const maxY = (dir: 1 | -1) =>
      Math.max(...allPoints(edgePath({ ...SAMPLE, dir }, from, to, false)).map((p) => p.y));
    expect(minY(1)).toBeCloseTo(200 - 0.2 * 256, 9);
    expect(maxY(-1)).toBeCloseTo(200 + 0.2 * 256, 9);
  });

  it('protrudes right for dir = +1 on a top→bottom edge', () => {
    const pts = allPoints(edgePath(SAMPLE, { x: 0, y: 0 }, { x: 0, y: 100 }, false));
    expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(20, 9);
  });
});
