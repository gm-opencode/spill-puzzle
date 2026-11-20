/**
 * Initial scatter (FR-3.1, spec §6.6): place every piece in a seeded, jittered slot
 * around the board without covering it.
 */
import type { Grid } from '../geometry/grid';
import { piecePad } from '../geometry/outline';
import { mulberry32, type Rng } from '../geometry/rng';
import type { Rect } from '../geometry/types';
import type { Point } from './types';

/** Scatter area margin around the board as a fraction of `max(w, h)` (spec §6.6). */
export const SCATTER_MARGIN_FACTOR = 0.6;
/** Slot size as a multiple of `max(pw, ph)` (spec §6.6). */
export const SLOT_FACTOR = 1.35;
/**
 * XORed into the puzzle seed so the scatter's random stream is independent of the
 * piece-shape stream, which uses the plain seed.
 */
export const SCATTER_SEED_SALT = 0x5ca77e12;

export type ScatterGrid = Pick<Grid, 'rows' | 'cols' | 'pw' | 'ph' | 'width' | 'height'>;

export type SlotBand = 'top' | 'bottom' | 'left' | 'right';

/** A slot cell in world px. Always at least `SLOT_FACTOR · max(pw, ph)` on each side. */
export interface Slot extends Rect {
  band: SlotBand;
}

export interface ScatterOptions {
  /** Viewport is taller than wide: favour slots above and below the board 2:1. */
  portrait?: boolean;
  /** Overrides {@link SCATTER_MARGIN_FACTOR}. */
  marginFactor?: number;
}

export interface ScatterResult {
  /** World position of each piece's cell origin (unrotated top-left), indexed by piece id. */
  positions: Point[];
  /** Outer rectangle of the scatter area in world px (board included). For zoom to fit. */
  area: Rect;
  /** Number of slot rings used. */
  rings: number;
}

/** Side length of a square slot in world px. */
export function slotSize(grid: Pick<Grid, 'pw' | 'ph'>): number {
  return Math.max(grid.pw, grid.ph) * SLOT_FACTOR;
}

/**
 * Gap between the board and the first slot ring, in world px. Equal to the piece
 * texture padding, so not even a tab reaches the board.
 */
export function boardGap(grid: Pick<Grid, 'pw' | 'ph'>): number {
  return piecePad(grid);
}

/**
 * The board rectangle grown by the gap and `rings` slot rings, in world px.
 */
export function scatterArea(grid: ScatterGrid, rings: number): Rect {
  const g = boardGap(grid) + rings * slotSize(grid);
  return { x: -g, y: -g, width: grid.width + 2 * g, height: grid.height + 2 * g };
}

/**
 * All slots in `rings` rings around the board. Top and bottom bands span the full
 * width (corners included); left and right bands span the board's height. Slots in a
 * band are stretched evenly so they tile it with no leftover.
 */
export function scatterSlots(grid: ScatterGrid, rings: number): Slot[] {
  const s = slotSize(grid);
  const gap = boardGap(grid);
  const inner = { x: -gap, y: -gap, width: grid.width + 2 * gap, height: grid.height + 2 * gap };
  const slots: Slot[] = [];

  const outerWidth = inner.width + 2 * rings * s;
  const cols = Math.floor(outerWidth / s);
  const cw = outerWidth / cols;
  const sideRows = Math.floor(inner.height / s);
  const ch = sideRows > 0 ? inner.height / sideRows : 0;

  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < cols; i++) {
      const x = inner.x - rings * s + i * cw;
      slots.push({ band: 'top', x, y: inner.y - (k + 1) * s, width: cw, height: s });
      slots.push({ band: 'bottom', x, y: inner.y + inner.height + k * s, width: cw, height: s });
    }
    for (let j = 0; j < sideRows; j++) {
      const y = inner.y + j * ch;
      slots.push({ band: 'left', x: inner.x - (k + 1) * s, y, width: s, height: ch });
      slots.push({ band: 'right', x: inner.x + inner.width + k * s, y, width: s, height: ch });
    }
  }
  return slots;
}

/** In-place Fisher–Yates shuffle. */
export function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/**
 * Pick `count` slots, alternating between the above/below bands and the side bands
 * with the given weights (e.g. 2:1). When one list runs out the other fills the rest.
 */
export function pickSlots(
  vertical: readonly Slot[],
  side: readonly Slot[],
  count: number,
  weights: readonly [number, number],
): Slot[] {
  const out: Slot[] = [];
  let v = 0;
  let h = 0;
  while (out.length < count && (v < vertical.length || h < side.length)) {
    for (let i = 0; i < weights[0] && out.length < count && v < vertical.length; i++) {
      out.push(vertical[v++]!);
    }
    for (let i = 0; i < weights[1] && out.length < count && h < side.length; i++) {
      out.push(side[h++]!);
    }
  }
  return out;
}

/**
 * Scatter all pieces around the board (spec §6.6). Deterministic for `(grid, seed, options)`.
 *
 * Starts with as many rings as fit in `marginFactor · max(w, h)` (at least 1) and adds
 * rings until there is a slot for every piece. Each piece's cell stays inside its slot,
 * so pieces never overlap each other or the board.
 *
 * @param seed Puzzle seed (uint32).
 */
export function scatter(
  grid: ScatterGrid,
  seed: number,
  options: ScatterOptions = {},
): ScatterResult {
  const count = grid.rows * grid.cols;
  const margin =
    (options.marginFactor ?? SCATTER_MARGIN_FACTOR) * Math.max(grid.width, grid.height);
  let rings = Math.max(1, Math.floor(margin / slotSize(grid)));
  let slots = scatterSlots(grid, rings);
  while (slots.length < count) {
    rings++;
    slots = scatterSlots(grid, rings);
  }

  const rng = mulberry32((seed ^ SCATTER_SEED_SALT) >>> 0);
  const vertical = shuffle(
    slots.filter((s) => s.band === 'top' || s.band === 'bottom'),
    rng,
  );
  const side = shuffle(
    slots.filter((s) => s.band === 'left' || s.band === 'right'),
    rng,
  );
  const chosen = pickSlots(vertical, side, count, options.portrait ? [2, 1] : [1, 1]);
  const order = shuffle(
    Array.from({ length: count }, (_, i) => i),
    rng,
  );

  const positions: Point[] = new Array<Point>(count);
  order.forEach((pieceId, i) => {
    const slot = chosen[i]!;
    positions[pieceId] = {
      x: slot.x + rng() * (slot.width - grid.pw),
      y: slot.y + rng() * (slot.height - grid.ph),
    };
  });

  return { positions, area: scatterArea(grid, rings), rings };
}
