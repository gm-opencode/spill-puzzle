/**
 * Groups: creation, moving, z-order, and drop with snap and multi-merge (spec §6.1, §6.3).
 * Pure functions over an immutable {@link BoardState}.
 */
import type { BoardState, Group, PieceGrid, PieceId, Point, QuarterTurns } from './types';

/** Snap distance as a fraction of the shorter piece side (spec §6.1). */
export const SNAP_FACTOR = 0.22;

/**
 * Snap distance in world px: `0.22 · min(pw, ph)`. Independent of zoom.
 */
export function snapThreshold(grid: Pick<PieceGrid, 'pw' | 'ph'>): number {
  return SNAP_FACTOR * Math.min(grid.pw, grid.ph);
}

/**
 * Rotate a vector by quarter turns clockwise in screen coordinates (y down).
 * @param v Vector in world px.
 * @param rot Quarter turns clockwise.
 */
export function rotateVec(v: Point, rot: QuarterTurns): Point {
  switch (rot) {
    case 0:
      return { x: v.x, y: v.y };
    case 1:
      return { x: -v.y, y: v.x };
    case 2:
      return { x: -v.x, y: -v.y };
    case 3:
      return { x: v.y, y: -v.x };
  }
}

/** Row and column of a piece. */
export function pieceCell(
  grid: Pick<PieceGrid, 'cols'>,
  id: PieceId,
): { row: number; col: number } {
  return { row: Math.floor(id / grid.cols), col: id % grid.cols };
}

/** Offset of a piece's cell origin from the puzzle origin, before rotation, in world px. */
export function pieceOffset(grid: PieceGrid, id: PieceId): Point {
  const { row, col } = pieceCell(grid, id);
  return { x: col * grid.pw, y: row * grid.ph };
}

/**
 * World position of piece `id`'s cell origin (its top-left when unrotated) in a group:
 * `(g.x, g.y) + rotate((c·pw, r·ph), g.rot)` (spec §6).
 */
export function piecePosition(
  grid: PieceGrid,
  group: Pick<Group, 'x' | 'y' | 'rot'>,
  id: PieceId,
): Point {
  const o = rotateVec(pieceOffset(grid, id), group.rot);
  return { x: group.x + o.x, y: group.y + o.y };
}

/**
 * Group origin that puts piece `id`'s cell origin at world point `p`. Inverse of
 * {@link piecePosition}.
 */
export function originForPiece(
  grid: PieceGrid,
  id: PieceId,
  p: Point,
  rot: QuarterTurns = 0,
): Point {
  const o = rotateVec(pieceOffset(grid, id), rot);
  return { x: p.x - o.x, y: p.y - o.y };
}

/** Grid neighbours (up, right, down, left order; border sides omitted). */
export function neighbours(grid: Pick<PieceGrid, 'rows' | 'cols'>, id: PieceId): PieceId[] {
  const { row, col } = pieceCell(grid, id);
  const out: PieceId[] = [];
  if (row > 0) out.push(id - grid.cols);
  if (col < grid.cols - 1) out.push(id + 1);
  if (row < grid.rows - 1) out.push(id + grid.cols);
  if (col > 0) out.push(id - 1);
  return out;
}

/**
 * Create the initial state: one group per piece, each at the given world position.
 *
 * @param grid Grid of the puzzle.
 * @param positions World position of each piece's cell origin, indexed by piece id
 *   (e.g. from `scatter()`). Group `i` holds piece `i`, with `z = i + 1`.
 * @param rotations Optional quarter turns per piece (rotation mode, P1). Defaults to 0.
 */
export function createInitialState(
  grid: PieceGrid,
  positions: readonly Point[],
  rotations?: readonly QuarterTurns[],
): BoardState {
  const count = grid.rows * grid.cols;
  if (positions.length !== count) {
    throw new RangeError(
      `createInitialState: expected ${count} positions, got ${positions.length}`,
    );
  }
  const groups = new Map<number, Group>();
  const pieceGroup: number[] = [];
  for (let id = 0; id < count; id++) {
    const rot = rotations?.[id] ?? 0;
    const origin = originForPiece(grid, id, positions[id]!, rot);
    groups.set(id, { id, x: origin.x, y: origin.y, rot, pieces: [id], z: id + 1, locked: false });
    pieceGroup.push(id);
  }
  return { grid, groups, pieceGroup, maxZ: count };
}

/** Look up a group, throwing if it doesn't exist. */
export function getGroup(state: BoardState, id: number): Group {
  const g = state.groups.get(id);
  if (!g) throw new RangeError(`Unknown group ${id}`);
  return g;
}

/** The group containing a piece. */
export function groupOfPiece(state: BoardState, piece: PieceId): Group {
  const id = state.pieceGroup[piece];
  if (id === undefined) throw new RangeError(`Unknown piece ${piece}`);
  return getGroup(state, id);
}

function withGroup(state: BoardState, group: Group, maxZ = state.maxZ): BoardState {
  const groups = new Map(state.groups);
  groups.set(group.id, group);
  return { ...state, groups, maxZ };
}

/**
 * Bring a group to the front: `z = ++maxZ` (spec §6.3, on drag start).
 * Returns the same state if the group is already on top.
 */
export function bringToFront(state: BoardState, id: number): BoardState {
  const g = getGroup(state, id);
  if (g.z === state.maxZ) return state;
  const z = state.maxZ + 1;
  return withGroup(state, { ...g, z }, z);
}

/** Move a group's origin to `(x, y)` in world px. */
export function moveGroup(state: BoardState, id: number, x: number, y: number): BoardState {
  const g = getGroup(state, id);
  if (g.x === x && g.y === y) return state;
  return withGroup(state, { ...g, x, y });
}

/**
 * Two groups fit if they have the same rotation, contain at least one pair of
 * grid-adjacent pieces, and their origins are closer than {@link snapThreshold} (spec §6.1).
 */
export function groupsFit(grid: PieceGrid, a: Group, b: Group): boolean {
  if (a.id === b.id || a.rot !== b.rot) return false;
  if (Math.hypot(a.x - b.x, a.y - b.y) >= snapThreshold(grid)) return false;
  const inB = new Set(b.pieces);
  return a.pieces.some((p) => neighbours(grid, p).some((n) => inB.has(n)));
}

/** Ids of groups that hold a grid neighbour of any piece in the group (spec §6.1 step 1). */
export function candidateGroups(state: BoardState, id: number): number[] {
  const g = getGroup(state, id);
  const out = new Set<number>();
  for (const p of g.pieces) {
    for (const n of neighbours(state.grid, p)) {
      const other = state.pieceGroup[n]!;
      if (other !== id) out.add(other);
    }
  }
  return [...out];
}

export interface DropResult {
  state: BoardState;
  /** Id of the group that now holds the dropped pieces. */
  groupId: number;
  /** Ids of the groups that were merged away (empty if nothing snapped). */
  absorbed: number[];
  /** True if at least one group snapped. */
  snapped: boolean;
  /** True if all pieces now form one group (spec §6.1 step 6). */
  completed: boolean;
}

/**
 * Drop a group (spec §6.1): merge it with every neighbouring group that fits.
 *
 * The merged group keeps the id, position and rotation of the **largest** group
 * involved. On a tie, an already-placed group wins over the dropped one, then the
 * lower id. Its `z` is the highest `z` of the merged groups.
 *
 * @param id The dropped group, already at its drop position (see {@link moveGroup}).
 */
export function drop(state: BoardState, id: number): DropResult {
  const dropped = getGroup(state, id);
  const fitting = candidateGroups(state, id)
    .map((g) => getGroup(state, g))
    .filter((g) => groupsFit(state.grid, dropped, g));

  if (fitting.length === 0) {
    return { state, groupId: id, absorbed: [], snapped: false, completed: isComplete(state) };
  }

  const all = [dropped, ...fitting];
  const winner = all.reduce((best, g) => (outranks(g, best, id) ? g : best));

  const pieces = all.flatMap((g) => g.pieces).sort((a, b) => a - b);
  const merged: Group = {
    ...winner,
    pieces,
    z: Math.max(...all.map((g) => g.z)),
  };

  const groups = new Map(state.groups);
  const pieceGroup = state.pieceGroup.slice();
  const absorbed: number[] = [];
  for (const g of all) {
    if (g.id === winner.id) continue;
    groups.delete(g.id);
    absorbed.push(g.id);
  }
  for (const p of pieces) pieceGroup[p] = winner.id;
  groups.set(winner.id, merged);

  const next: BoardState = { ...state, groups, pieceGroup };
  return {
    state: next,
    groupId: winner.id,
    absorbed,
    snapped: true,
    completed: isComplete(next),
  };
}

/**
 * Merge ranking (spec §6.1 step 3): more pieces wins; on a tie an already-placed
 * group beats the dropped one; then the lower id wins.
 */
function outranks(a: Group, b: Group, droppedId: number): boolean {
  if (a.pieces.length !== b.pieces.length) return a.pieces.length > b.pieces.length;
  if ((a.id === droppedId) !== (b.id === droppedId)) return b.id === droppedId;
  return a.id < b.id;
}

/** True when every piece is in one group (FR-3.9). */
export function isComplete(state: BoardState): boolean {
  return state.groups.size === 1;
}

/** Groups sorted bottom to top by `z` (render order). */
export function groupsByZ(state: BoardState): Group[] {
  return [...state.groups.values()].sort((a, b) => a.z - b.z);
}
