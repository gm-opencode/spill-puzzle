/**
 * Progress (FR-3.8, spec §7).
 */
import type { BoardState } from './types';

/**
 * Progress in `[0, 1]`: `(pieces - groupCount) / (pieces - 1)` (spec §7).
 * Each successful merge of two groups adds `1 / (pieces - 1)`.
 *
 * @param pieces Total pieces (≥ 1).
 * @param groupCount Current number of groups (1..pieces).
 */
export function progressFraction(pieces: number, groupCount: number): number {
  if (pieces <= 1) return 1;
  return (pieces - groupCount) / (pieces - 1);
}

/** Progress of a board state. */
export function boardProgress(state: BoardState): number {
  return progressFraction(state.pieceGroup.length, state.groups.size);
}

/**
 * Pieces that are joined to at least one other piece, for the "23 / 48" display
 * (spec §1.3). Equals the total when the puzzle is complete.
 */
export function connectedPieces(state: BoardState): number {
  let n = 0;
  for (const g of state.groups.values()) if (g.pieces.length > 1) n += g.pieces.length;
  return n;
}
