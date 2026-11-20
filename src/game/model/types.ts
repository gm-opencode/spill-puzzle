/**
 * Game state model (spec §6). All positions are world px (= source image px).
 *
 * Everything is groups: every piece belongs to exactly one group, and a loose piece
 * is a group of size 1. A group stores where the puzzle origin `(0, 0)` would be for
 * it, so pieces inside a group can never be misaligned (decision #2).
 */
import type { Grid } from '../geometry/grid';
import type { Point } from '../geometry/types';

/** `r * cols + c`. */
export type PieceId = number;

/** Quarter turns clockwise. Always 0 while rotation mode (P1) is off. */
export type QuarterTurns = 0 | 1 | 2 | 3;

/** The grid facts the model needs. */
export type PieceGrid = Pick<Grid, 'rows' | 'cols' | 'pw' | 'ph'>;

export interface Group {
  readonly id: number;
  /** World x of the puzzle origin for this group, in world px. */
  readonly x: number;
  /** World y of the puzzle origin for this group, in world px. */
  readonly y: number;
  readonly rot: QuarterTurns;
  /** Sorted ascending. */
  readonly pieces: readonly PieceId[];
  /** Draw order; higher is on top. */
  readonly z: number;
  /** Snapped to the board (P1, FR-3.11). Always false in the MVP. */
  readonly locked: boolean;
}

/**
 * Immutable board state. Functions in `groups.ts` return a new state and share
 * unchanged groups with the old one.
 */
export interface BoardState {
  readonly grid: PieceGrid;
  /** Groups by id. */
  readonly groups: ReadonlyMap<number, Group>;
  /** Group id of each piece, indexed by piece id. */
  readonly pieceGroup: readonly number[];
  /** Highest `z` handed out so far. */
  readonly maxZ: number;
}

export type { Point };
