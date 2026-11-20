import { describe, expect, it } from 'vitest';
import { createInitialState, drop, getGroup, moveGroup } from '../../../../src/game/model/groups';
import {
  boardProgress,
  connectedPieces,
  progressFraction,
} from '../../../../src/game/model/progress';

describe('progressFraction (spec §7)', () => {
  it('is (pieces - groups) / (pieces - 1)', () => {
    expect(progressFraction(48, 48)).toBe(0);
    expect(progressFraction(48, 1)).toBe(1);
    expect(progressFraction(5, 3)).toBe(0.5);
  });

  it('is 1 for a single piece', () => {
    expect(progressFraction(1, 1)).toBe(1);
  });
});

describe('board progress', () => {
  it('counts merges and connected pieces', () => {
    const grid = { rows: 2, cols: 3, pw: 10, ph: 10 };
    let state = createInitialState(
      grid,
      Array.from({ length: 6 }, (_, i) => ({ x: i * 1000, y: 0 })),
    );
    expect(boardProgress(state)).toBe(0);
    expect(connectedPieces(state)).toBe(0);
    const g0 = getGroup(state, 0);
    state = drop(moveGroup(state, 1, g0.x, g0.y), 1).state;
    expect(boardProgress(state)).toBe(1 / 5);
    expect(connectedPieces(state)).toBe(2);
    state = drop(moveGroup(state, 2, g0.x, g0.y), 2).state;
    expect(connectedPieces(state)).toBe(3);
    expect(boardProgress(state)).toBe(2 / 5);
  });
});
