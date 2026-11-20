import { describe, expect, it } from 'vitest';
import { computeGrid, type Grid } from '../../../../src/game/geometry/grid';
import { mulberry32 } from '../../../../src/game/geometry/rng';
import type { Rect } from '../../../../src/game/geometry/types';
import { createInitialState, piecePosition, getGroup } from '../../../../src/game/model/groups';
import {
  boardGap,
  pickSlots,
  scatter,
  scatterArea,
  scatterSlots,
  shuffle,
  slotSize,
  type Slot,
} from '../../../../src/game/model/scatter';

const EPS = 1e-9;

function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPS &&
    b.x < a.x + a.width - EPS &&
    a.y < b.y + b.height - EPS &&
    b.y < a.y + a.height - EPS
  );
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.width <= outer.x + outer.width + EPS &&
    inner.y + inner.height <= outer.y + outer.height + EPS
  );
}

const CASES: Array<[number, number, number]> = [
  [2048, 1536, 12],
  [2048, 1536, 48],
  [1536, 2048, 150],
  [2048, 1152, 300],
  [2048, 1536, 500],
  [2048, 878, 96],
];

describe('scatter (spec §6.6)', () => {
  it.each(CASES)('%i×%i, %i pieces: nothing covers the board or overlaps', (w, h, n) => {
    const grid = computeGrid(w, h, n);
    for (const portrait of [false, true]) {
      const { positions, area } = scatter(grid, 42, { portrait });
      expect(positions).toHaveLength(grid.rows * grid.cols);
      const board: Rect = { x: 0, y: 0, width: w, height: h };
      const pad = boardGap(grid);
      const cells = positions.map((p) => ({ x: p.x, y: p.y, width: grid.pw, height: grid.ph }));
      for (const cell of cells) {
        expect(intersects(cell, board)).toBe(false);
        // Even the texture bounds (tabs included) stay off the board.
        const bounds = {
          x: cell.x - pad,
          y: cell.y - pad,
          width: cell.width + 2 * pad,
          height: cell.height + 2 * pad,
        };
        expect(intersects(bounds, board)).toBe(false);
        expect(contains(area, cell)).toBe(true);
      }
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          expect(intersects(cells[i]!, cells[j]!)).toBe(false);
        }
      }
    }
  });

  it('is deterministic per seed', () => {
    const grid = computeGrid(2048, 1536, 150);
    expect(scatter(grid, 7)).toEqual(scatter(grid, 7));
    expect(scatter(grid, 7)).not.toEqual(scatter(grid, 8));
    expect(scatter(grid, 7, { portrait: true })).toEqual(scatter(grid, 7, { portrait: true }));
  });

  it('favours slots above and below the board 2:1 on portrait screens', () => {
    const grid = computeGrid(2048, 1536, 150);
    const count = (portrait: boolean) => {
      const { positions } = scatter(grid, 3, { portrait });
      let vertical = 0;
      for (const p of positions) if (p.y + grid.ph <= 0 || p.y >= grid.height) vertical++;
      return { vertical, side: positions.length - vertical };
    };
    const portrait = count(true);
    expect(portrait.vertical / portrait.side).toBeCloseTo(2, 1);
    const landscape = count(false);
    expect(landscape.vertical / landscape.side).toBeCloseTo(1, 1);
  });

  it('adds rings when the margin has too few slots', () => {
    const grid = computeGrid(2048, 1536, 500);
    const tight = scatter(grid, 1, { marginFactor: 0 });
    expect(tight.rings).toBeGreaterThan(1);
    expect(scatterSlots(grid, tight.rings).length).toBeGreaterThanOrEqual(500);
    expect(scatterSlots(grid, tight.rings - 1).length).toBeLessThan(500);
    expect(tight.area).toEqual(scatterArea(grid, tight.rings));
  });

  it('feeds createInitialState', () => {
    const grid = computeGrid(2048, 1536, 48);
    const { positions } = scatter(grid, 11);
    const state = createInitialState(grid, positions);
    positions.forEach((p, id) => {
      const q = piecePosition(grid, getGroup(state, id), id);
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    });
  });
});

describe('scatterSlots', () => {
  it('builds non-overlapping slots of at least the slot size, outside the board gap', () => {
    const grid: Grid = computeGrid(1536, 2048, 96);
    const s = slotSize(grid);
    const gap = boardGap(grid);
    const keepOut = {
      x: -gap,
      y: -gap,
      width: grid.width + 2 * gap,
      height: grid.height + 2 * gap,
    };
    for (const rings of [1, 2, 4]) {
      const slots = scatterSlots(grid, rings);
      const area = scatterArea(grid, rings);
      for (const slot of slots) {
        expect(slot.width).toBeGreaterThanOrEqual(s - EPS);
        expect(slot.height).toBeGreaterThanOrEqual(s - EPS);
        expect(intersects(slot, keepOut)).toBe(false);
        expect(contains(area, slot)).toBe(true);
      }
      for (let i = 0; i < slots.length; i++) {
        for (let j = i + 1; j < slots.length; j++) {
          expect(intersects(slots[i]!, slots[j]!)).toBe(false);
        }
      }
    }
  });

  it('has no side slots when the board is shorter than a slot', () => {
    const grid = { rows: 2, cols: 20, pw: 100, ph: 10, width: 2000, height: 20 };
    const slots = scatterSlots(grid, 1);
    expect(slots.every((s) => s.band === 'top' || s.band === 'bottom')).toBe(true);
  });
});

describe('helpers', () => {
  it('shuffle returns a permutation', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(items.slice(), mulberry32(1));
    expect(out.slice().sort((a, b) => a - b)).toEqual(items);
    expect(out).not.toEqual(items);
  });

  it('pickSlots alternates by weight and falls back when one list runs out', () => {
    const mk = (band: Slot['band'], n: number): Slot[] =>
      Array.from({ length: n }, (_, i) => ({ band, x: i, y: 0, width: 1, height: 1 }));
    const v = mk('top', 10);
    const h = mk('left', 2);
    const picked = pickSlots(v, h, 9, [2, 1]);
    expect(picked.map((s) => s.band)).toEqual([
      'top',
      'top',
      'left',
      'top',
      'top',
      'left',
      'top',
      'top',
      'top',
    ]);
    expect(pickSlots(v, h, 50, [1, 1])).toHaveLength(12);
  });
});
