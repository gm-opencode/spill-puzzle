import { describe, expect, it } from 'vitest';
import { makeGrid } from '../../../../src/game/geometry/grid';
import { createInitialState, drop, getGroup, moveGroup } from '../../../../src/game/model/groups';
import {
  fromSavedState,
  InvalidSaveError,
  toSavedState,
  type PuzzleState,
} from '../../../../src/game/model/save';

const GRID = makeGrid(400, 300, 3, 4);

function playedBoard() {
  let state = createInitialState(
    GRID,
    Array.from({ length: 12 }, (_, i) => ({ x: i * 500, y: -400 })),
  );
  const g0 = getGroup(state, 0);
  state = drop(moveGroup(state, 1, g0.x, g0.y), 1).state;
  state = drop(moveGroup(state, 4, g0.x + 3, g0.y - 2), 4).state;
  return state;
}

describe('save mapping (spec §7)', () => {
  it('round-trips a board and camera', () => {
    const board = playedBoard();
    const saved = toSavedState('p1', board, { x: 1, y: 2, scale: 0.5 });
    expect(saved).toMatchObject({
      puzzleId: 'p1',
      schemaVersion: 1,
      camera: { x: 1, y: 2, scale: 0.5 },
    });
    expect(saved.groups.map((g) => g.id)).toEqual(
      [...saved.groups.map((g) => g.id)].sort((a, b) => a - b),
    );
    const restored = fromSavedState(GRID, JSON.parse(JSON.stringify(saved)) as PuzzleState);
    expect([...restored.groups.values()].sort((a, b) => a.id - b.id)).toEqual(
      [...board.groups.values()].sort((a, b) => a.id - b.id),
    );
    expect(restored.pieceGroup).toEqual(board.pieceGroup);
    expect(restored.maxZ).toBe(Math.max(...saved.groups.map((g) => g.z)));
  });

  it('rejects inconsistent saves', () => {
    const good = toSavedState('p1', playedBoard(), { x: 0, y: 0, scale: 1 });
    const bad = (mutate: (s: PuzzleState) => void) => {
      const s = JSON.parse(JSON.stringify(good)) as PuzzleState;
      mutate(s);
      return () => fromSavedState(GRID, s);
    };
    expect(bad((s) => ((s as { schemaVersion: number }).schemaVersion = 2))).toThrow(
      InvalidSaveError,
    );
    expect(bad((s) => s.groups.pop())).toThrow(/in no group/);
    expect(bad((s) => s.groups[1]!.pieces.push(0))).toThrow(/two groups/);
    expect(bad((s) => (s.groups[1]!.id = s.groups[0]!.id))).toThrow(/duplicate/);
    expect(bad((s) => (s.groups[0]!.rot = 5))).toThrow(/rotation/);
    expect(bad((s) => (s.groups[0]!.x = Number.NaN))).toThrow(/non-finite/);
    expect(bad((s) => s.groups[0]!.pieces.push(99))).toThrow(/unknown piece/);
    expect(bad((s) => (s.groups[0]!.pieces = []))).toThrow(/empty/);
  });
});
