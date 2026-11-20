/**
 * Saved-game types and mapping (spec §7). Pure: storage repos (M5) persist these
 * objects; the controller converts them to and from a {@link BoardState}.
 */
import type { BoardState, Group, PieceGrid, QuarterTurns } from './types';

export const SCHEMA_VERSION = 1;

/** Puzzle definition (spec §7, `puzzles` store). */
export interface PuzzleMeta {
  id: string;
  imageId: string;
  title: string;
  rows: number;
  cols: number;
  seed: number;
  crop?: { x: number; y: number; w: number; h: number };
  rotation: boolean;
  createdAt: number;
  updatedAt: number;
  elapsedMs: number;
  /** `0..1` = (pieces − groupCount) / (pieces − 1). */
  progress: number;
  completedAt?: number;
  schemaVersion: 1;
}

export interface SavedGroup {
  id: number;
  x: number;
  y: number;
  rot: number;
  z: number;
  locked: boolean;
  pieces: number[];
}

export interface SavedCamera {
  x: number;
  y: number;
  scale: number;
}

/** Progress of one puzzle (spec §7, `states` store). */
export interface PuzzleState {
  puzzleId: string;
  groups: SavedGroup[];
  camera: SavedCamera;
  schemaVersion: 1;
}

export class InvalidSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSaveError';
  }
}

/** Snapshot a board and camera for saving. Groups are listed by id. */
export function toSavedState(
  puzzleId: string,
  board: BoardState,
  camera: SavedCamera,
): PuzzleState {
  const groups = [...board.groups.values()]
    .sort((a, b) => a.id - b.id)
    .map((g) => ({
      id: g.id,
      x: g.x,
      y: g.y,
      rot: g.rot,
      z: g.z,
      locked: g.locked,
      pieces: [...g.pieces],
    }));
  return {
    puzzleId,
    groups,
    camera: { x: camera.x, y: camera.y, scale: camera.scale },
    schemaVersion: SCHEMA_VERSION,
  };
}

function isQuarterTurns(n: number): n is QuarterTurns {
  return n === 0 || n === 1 || n === 2 || n === 3;
}

/**
 * Rebuild a board from a saved state, checking that it is consistent with the grid:
 * finite numbers, valid rotations, unique group ids, and every piece in exactly one group.
 *
 * @throws {InvalidSaveError} if the save doesn't match the grid or is malformed.
 */
export function fromSavedState(grid: PieceGrid, saved: PuzzleState): BoardState {
  if (saved.schemaVersion !== SCHEMA_VERSION) {
    throw new InvalidSaveError(`Unsupported schema version ${String(saved.schemaVersion)}`);
  }
  const count = grid.rows * grid.cols;
  const pieceGroup: number[] = new Array<number>(count).fill(-1);
  const groups = new Map<number, Group>();
  let maxZ = 0;

  for (const g of saved.groups) {
    if (!Number.isInteger(g.id) || groups.has(g.id)) {
      throw new InvalidSaveError(`Bad or duplicate group id ${g.id}`);
    }
    if (![g.x, g.y, g.z].every(Number.isFinite)) {
      throw new InvalidSaveError(`Group ${g.id} has a non-finite position or z`);
    }
    if (!isQuarterTurns(g.rot)) throw new InvalidSaveError(`Group ${g.id} has rotation ${g.rot}`);
    if (g.pieces.length === 0) throw new InvalidSaveError(`Group ${g.id} is empty`);
    for (const p of g.pieces) {
      if (!Number.isInteger(p) || p < 0 || p >= count) {
        throw new InvalidSaveError(`Group ${g.id} has unknown piece ${p}`);
      }
      if (pieceGroup[p] !== -1) throw new InvalidSaveError(`Piece ${p} is in two groups`);
      pieceGroup[p] = g.id;
    }
    groups.set(g.id, {
      id: g.id,
      x: g.x,
      y: g.y,
      rot: g.rot,
      z: g.z,
      locked: g.locked === true,
      pieces: [...g.pieces].sort((a, b) => a - b),
    });
    maxZ = Math.max(maxZ, g.z);
  }
  const missing = pieceGroup.indexOf(-1);
  if (missing !== -1) throw new InvalidSaveError(`Piece ${missing} is in no group`);

  return { grid, groups, pieceGroup, maxZ };
}
