import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../src/game/geometry/rng';
import {
  bringToFront,
  candidateGroups,
  createInitialState,
  drop,
  getGroup,
  groupOfPiece,
  groupsByZ,
  groupsFit,
  isComplete,
  moveGroup,
  neighbours,
  originForPiece,
  piecePosition,
  rotateVec,
  snapThreshold,
} from '../../../../src/game/model/groups';
import type { BoardState, PieceGrid, QuarterTurns } from '../../../../src/game/model/types';

/** 3 rows × 4 cols of 100 × 80 px pieces → snap threshold 17.6 px. */
const GRID: PieceGrid = { rows: 3, cols: 4, pw: 100, ph: 80 };
const T = snapThreshold(GRID);

/** Each piece far from the others, at (1000·id, 5000). */
function spreadState(grid: PieceGrid = GRID, rotations?: QuarterTurns[]): BoardState {
  const n = grid.rows * grid.cols;
  return createInitialState(
    grid,
    Array.from({ length: n }, (_, i) => ({ x: 1000 * i, y: 5000 })),
    rotations,
  );
}

/** Move group `id` so its origin is group `target`'s origin plus `(dx, dy)`. */
function placeNear(state: BoardState, id: number, target: number, dx: number, dy: number) {
  const t = getGroup(state, target);
  return moveGroup(state, id, t.x + dx, t.y + dy);
}

function assertInvariants(state: BoardState) {
  const seen = new Set<number>();
  for (const [id, g] of state.groups) {
    expect(g.id).toBe(id);
    expect([...g.pieces]).toEqual([...g.pieces].sort((a, b) => a - b));
    for (const p of g.pieces) {
      expect(seen.has(p)).toBe(false);
      seen.add(p);
      expect(state.pieceGroup[p]).toBe(id);
    }
    expect(g.z).toBeLessThanOrEqual(state.maxZ);
  }
  expect(seen.size).toBe(state.grid.rows * state.grid.cols);
}

describe('geometry helpers', () => {
  it('rotates vectors clockwise in screen coordinates', () => {
    const v = { x: 3, y: 1 };
    expect(rotateVec(v, 0)).toEqual({ x: 3, y: 1 });
    expect(rotateVec(v, 1)).toEqual({ x: -1, y: 3 });
    expect(rotateVec(v, 2)).toEqual({ x: -3, y: -1 });
    expect(rotateVec(v, 3)).toEqual({ x: 1, y: -3 });
    expect(rotateVec({ x: 1, y: 0 }, 1)).toEqual({ x: -0, y: 1 }); // right → down
  });

  it('piecePosition and originForPiece are inverses for every rotation', () => {
    for (const rot of [0, 1, 2, 3] as const) {
      for (const id of [0, 5, 11]) {
        const p = { x: 123.5, y: -42 };
        const origin = originForPiece(GRID, id, p, rot);
        expect(piecePosition(GRID, { ...origin, rot }, id)).toEqual(p);
      }
    }
  });

  it('lists grid neighbours, skipping borders', () => {
    expect(neighbours(GRID, 0).sort()).toEqual([1, 4]);
    expect(neighbours(GRID, 3).sort()).toEqual([2, 7]);
    expect(neighbours(GRID, 5).sort((a, b) => a - b)).toEqual([1, 4, 6, 9]);
    expect(neighbours(GRID, 11).sort()).toEqual([10, 7]);
  });

  it('uses 0.22 · min(pw, ph) as the snap threshold', () => {
    expect(snapThreshold(GRID)).toBeCloseTo(17.6, 10);
  });
});

describe('createInitialState', () => {
  it('creates one group per piece at the given positions', () => {
    const positions = Array.from({ length: 12 }, (_, i) => ({ x: i * 7, y: 100 - i * 3 }));
    const state = createInitialState(GRID, positions);
    expect(state.groups.size).toBe(12);
    for (let id = 0; id < 12; id++) {
      const g = groupOfPiece(state, id);
      expect(g.pieces).toEqual([id]);
      expect(g.rot).toBe(0);
      expect(g.locked).toBe(false);
      expect(piecePosition(GRID, g, id)).toEqual(positions[id]);
    }
    expect(state.maxZ).toBe(12);
    assertInvariants(state);
  });

  it('applies per-piece rotations', () => {
    const rotations = Array.from({ length: 12 }, (_, i) => (i % 4) as QuarterTurns);
    const state = spreadState(GRID, rotations);
    expect(getGroup(state, 5).rot).toBe(1);
    expect(piecePosition(GRID, getGroup(state, 5), 5)).toEqual({ x: 5000, y: 5000 });
  });

  it('rejects a wrong number of positions', () => {
    expect(() => createInitialState(GRID, [{ x: 0, y: 0 }])).toThrow(RangeError);
  });
});

describe('lookups and z-order', () => {
  it('throws for unknown groups and pieces', () => {
    const state = spreadState();
    expect(() => getGroup(state, 99)).toThrow(RangeError);
    expect(() => groupOfPiece(state, 99)).toThrow(RangeError);
  });

  it('brings a group to the front (spec §6.3)', () => {
    let state = spreadState();
    state = bringToFront(state, 3);
    expect(getGroup(state, 3).z).toBe(13);
    expect(state.maxZ).toBe(13);
    expect(groupsByZ(state).at(-1)?.id).toBe(3);
    expect(bringToFront(state, 3)).toBe(state); // already on top
  });

  it('moves a group without touching others', () => {
    const state = spreadState();
    const moved = moveGroup(state, 2, 1, 2);
    expect(getGroup(moved, 2)).toMatchObject({ x: 1, y: 2 });
    expect(getGroup(moved, 1)).toBe(getGroup(state, 1));
    expect(moveGroup(moved, 2, 1, 2)).toBe(moved);
  });
});

describe('drop: snapping (spec §6.1)', () => {
  it('snaps neighbours within the threshold, to the placed group', () => {
    let state = spreadState();
    state = placeNear(state, 1, 0, 10, -12); // distance ≈ 15.6 < 17.6
    const target = getGroup(state, 0);
    const result = drop(state, 1);
    expect(result.snapped).toBe(true);
    expect(result.groupId).toBe(0);
    expect(result.absorbed).toEqual([1]);
    const merged = getGroup(result.state, 0);
    expect(merged.pieces).toEqual([0, 1]);
    expect(merged).toMatchObject({ x: target.x, y: target.y });
    expect(result.state.groups.has(1)).toBe(false);
    assertInvariants(result.state);
  });

  it('does not snap beyond or exactly at the threshold', () => {
    for (const [dx, dy] of [
      [T + 0.01, 0],
      [T, 0],
      [0, -T],
      [T * 0.8, T * 0.8],
    ]) {
      const state = placeNear(spreadState(), 1, 0, dx!, dy!);
      const result = drop(state, 1);
      expect(result.snapped).toBe(false);
      expect(result.state).toBe(state);
      expect(result.absorbed).toEqual([]);
    }
  });

  it('does not snap pieces that are not grid neighbours', () => {
    // Same origin means each piece is exactly in its correct relative place.
    for (const other of [2, 5, 10]) {
      // 0 and 2: same row, gap between. 0 and 5: diagonal. 0 and 10: far.
      const state = placeNear(spreadState(), other, 0, 0, 0);
      expect(drop(state, other).snapped).toBe(false);
      expect(groupsFit(GRID, getGroup(state, 0), getGroup(state, other))).toBe(false);
    }
  });

  it('does not snap groups with different rotations', () => {
    const rotations: QuarterTurns[] = Array.from({ length: 12 }, () => 0);
    rotations[1] = 1;
    const state = placeNear(spreadState(GRID, rotations), 1, 0, 0, 0);
    expect(drop(state, 1).snapped).toBe(false);
  });

  it('snaps rotated groups that share a rotation', () => {
    const rotations: QuarterTurns[] = Array.from({ length: 12 }, () => 2);
    const state = placeNear(spreadState(GRID, rotations), 4, 0, 3, 3);
    const result = drop(state, 4);
    expect(result.snapped).toBe(true);
    expect(getGroup(result.state, 0).rot).toBe(2);
  });

  it('merges every fitting group on one drop', () => {
    let state = spreadState();
    state = placeNear(state, 2, 0, 0, 0); // 0 and 2 are not neighbours: both stay put
    state = placeNear(state, 5, 0, 0, 0); // 5 is below 1, diagonal to 0 and 2
    state = placeNear(state, 1, 0, 5, 5); // 1 neighbours 0, 2 and 5
    const result = drop(state, 1);
    expect(result.snapped).toBe(true);
    expect(result.absorbed.sort()).toEqual([1, 2, 5]);
    expect(getGroup(result.state, 0).pieces).toEqual([0, 1, 2, 5]);
    assertInvariants(result.state);
  });

  it('ignores neighbouring candidates that are out of range', () => {
    let state = spreadState();
    state = placeNear(state, 2, 0, 50, 0); // too far from where 1 will land
    state = placeNear(state, 1, 0, 2, 2);
    expect(candidateGroups(state, 1).sort()).toEqual([0, 2, 5]);
    const result = drop(state, 1);
    expect(result.absorbed).toEqual([1]);
    expect(groupOfPiece(result.state, 2).id).toBe(2);
  });

  it('gives the merged group the position of the largest group', () => {
    let state = spreadState();
    state = drop(placeNear(state, 1, 0, 0, 0), 1).state; // group 0 = {0, 1}
    state = drop(placeNear(state, 4, 0, 0, 0), 4).state; // group 0 = {0, 1, 4}

    // A single piece dropped next to the big group moves to the big group.
    const big = getGroup(state, 0);
    let result = drop(placeNear(state, 2, 0, 9, -9), 2);
    expect(result.groupId).toBe(0);
    expect(getGroup(result.state, 0)).toMatchObject({ x: big.x, y: big.y });

    // The big group dropped next to a single piece keeps its own position.
    state = placeNear(state, 0, 5, -8, 6);
    const moved = getGroup(state, 0);
    result = drop(state, 0);
    expect(result.groupId).toBe(0);
    expect(result.absorbed).toEqual([5]);
    expect(getGroup(result.state, 0)).toMatchObject({ x: moved.x, y: moved.y });
  });

  it('breaks size ties towards the lower id among placed groups', () => {
    let state = spreadState();
    state = placeNear(state, 2, 0, 0, 0);
    state = placeNear(state, 1, 0, 1, 1);
    const result = drop(state, 1);
    expect(result.groupId).toBe(0);
  });

  it('keeps the highest z of the merged groups', () => {
    let state = spreadState();
    state = bringToFront(state, 1);
    state = placeNear(state, 1, 0, 0, 0);
    const result = drop(state, 1);
    expect(getGroup(result.state, 0).z).toBe(13);
  });
});

describe('completion', () => {
  it('detects completion when all pieces form one group (FR-3.9)', () => {
    let state = spreadState({ rows: 2, cols: 2, pw: 50, ph: 50 });
    expect(isComplete(state)).toBe(false);
    for (const id of [1, 2]) {
      const r = drop(placeNear(state, id, 0, 1, -1), id);
      expect(r.completed).toBe(false);
      state = r.state;
    }
    const last = drop(placeNear(state, 3, 0, 0, 0), 3);
    expect(last.completed).toBe(true);
    expect(isComplete(last.state)).toBe(true);
    expect(getGroup(last.state, 0).pieces).toEqual([0, 1, 2, 3]);
  });

  it('reports completion on a drop that does not snap', () => {
    const grid: PieceGrid = { rows: 2, cols: 2, pw: 50, ph: 50 };
    let state = createInitialState(grid, [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 50 },
      { x: 50, y: 50 },
    ]);
    // Dropping 1 then 2 already pulls in 3, which neighbours both.
    for (const id of [1, 2]) state = drop(state, groupOfPiece(state, id).id).state;
    expect(isComplete(state)).toBe(true);
    expect(drop(state, 0)).toMatchObject({ snapped: false, completed: true });
  });
});

describe('random play', () => {
  it.each([1, 2, 3, 4, 5])('keeps invariants and completes (seed %i)', (seed) => {
    const grid: PieceGrid = { rows: 6, cols: 7, pw: 90, ph: 110 };
    const rng = mulberry32(seed);
    let state = spreadState(grid);
    const threshold = snapThreshold(grid);
    let drops = 0;
    while (!isComplete(state)) {
      const ids = [...state.groups.keys()];
      const g = getGroup(state, ids[Math.floor(rng() * ids.length)]!);
      state = bringToFront(state, g.id);

      if (rng() < 0.3) {
        // A drop far away from everything never snaps.
        state = moveGroup(state, g.id, -1e6 * (drops + 1), 0);
        expect(drop(state, g.id).snapped).toBe(false);
      } else {
        // Drop near the group of some neighbour, within the threshold.
        const piece = g.pieces[Math.floor(rng() * g.pieces.length)]!;
        const outside = neighbours(grid, piece).filter((n) => state.pieceGroup[n] !== g.id);
        if (outside.length === 0) continue;
        const target = groupOfPiece(state, outside[Math.floor(rng() * outside.length)]!);
        const angle = rng() * 2 * Math.PI;
        const dist = rng() * threshold * 0.95;
        state = placeNear(state, g.id, target.id, Math.cos(angle) * dist, Math.sin(angle) * dist);
        const before = state.groups.size;
        const result = drop(state, g.id);
        expect(result.snapped).toBe(true);
        expect(result.state.groups.size).toBe(before - result.absorbed.length);
        state = result.state;
      }
      assertInvariants(state);
      drops++;
      expect(drops).toBeLessThan(2000);
    }
    expect(getGroup(state, state.groups.keys().next().value!).pieces).toHaveLength(42);
  });
});
