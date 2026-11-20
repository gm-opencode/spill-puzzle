/**
 * Pointer input state machine (spec §6.4): drag a group, pan, pinch, wheel zoom,
 * edge auto-pan and tap detection.
 *
 * It holds no Pixi objects. The binding feeds it pointer events with the piece under
 * the pointer (from Pixi's polygon hit test), and it calls back into an
 * {@link InputHost} for camera changes and drags. That keeps it unit-testable.
 * All coordinates are screen CSS px unless named `world`.
 */
import type { Point } from '../geometry/types';
import {
  anchorAt,
  screenToWorld,
  wheelZoomFactor,
  zoomAt,
  type Camera,
  type Viewport,
} from './camera';

/** A tap is a press shorter than this… (spec §6.2) */
export const TAP_MAX_MS = 250;
/** …that moved less than this, in CSS px. */
export const TAP_MAX_MOVE = 6;
/** A drag interrupted by a second finger is kept if it moved more than this (spec §6.4). */
export const PINCH_KEEP_DRAG_PX = 20;
/** Auto-pan starts this close to the viewport edge while dragging (spec §6.4). */
export const EDGE_ZONE_PX = 40;
/** Auto-pan speed at the very edge, in CSS px per second. */
export const EDGE_PAN_SPEED = 600;

export interface DragStart {
  groupId: number;
  /** Group origin in world px at drag start. */
  origin: Point;
}

/** What the input machine needs from the game. */
export interface InputHost {
  getCamera(): Camera;
  /** Apply (and clamp) a camera. */
  setCamera(camera: Camera): void;
  getViewport(): Viewport;
  /**
   * Start dragging the group that holds `pieceId`: bring it to the front and lift it.
   * Return `null` if it can't be dragged (e.g. locked, P1); the pointer then pans.
   * @param grabWorld Pointer position in world px.
   */
  beginDrag(pieceId: number, grabWorld: Point): DragStart | null;
  /** Move the dragged group's origin (visual only; no snapping). */
  moveDrag(groupId: number, origin: Point): void;
  /** Commit the drag at `origin` and run the snap check. */
  endDrag(groupId: number, origin: Point): void;
  /** Abort the drag and return the group to `origin` (its drag-start position). */
  cancelDrag(groupId: number, origin: Point): void;
  /** A tap on a piece (spec §6.2). Rotation mode is P1; in the MVP this does nothing. */
  tap(pieceId: number): void;
}

type Mode =
  | { kind: 'idle' }
  | {
      kind: 'drag';
      pointerId: number;
      pieceId: number;
      groupId: number;
      /** Pointer minus group origin, in world px. */
      grabOffset: Point;
      startOrigin: Point;
      startScreen: Point;
      startTime: number;
      maxMove: number;
    }
  | {
      kind: 'pan';
      pointerId: number;
      last: Point;
      startScreen: Point;
      startTime: number;
      pieceId: number | null;
      maxMove: number;
    }
  | {
      kind: 'pinch';
      ids: [number, number];
      startDist: number;
      startScale: number;
      anchorWorld: Point;
    };

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * True if a press counts as a tap (spec §6.2).
 * @param movedPx Largest distance from the press point, in CSS px.
 * @param durationMs Press duration.
 */
export function isTap(movedPx: number, durationMs: number): boolean {
  return movedPx < TAP_MAX_MOVE && durationMs < TAP_MAX_MS;
}

/**
 * Auto-pan velocity for a pointer near the viewport edge, in CSS px per second.
 * The camera moves towards the edge the pointer is near, faster the closer it is.
 * Returns the camera translation velocity (negative x = world scrolls left).
 */
export function edgePanVelocity(p: Point, viewport: Viewport): Point {
  const axis = (pos: number, size: number): number => {
    if (size <= 2 * EDGE_ZONE_PX) return 0;
    if (pos < EDGE_ZONE_PX) return EDGE_PAN_SPEED * (1 - Math.max(0, pos) / EDGE_ZONE_PX);
    const fromEnd = size - pos;
    if (fromEnd < EDGE_ZONE_PX) return -EDGE_PAN_SPEED * (1 - Math.max(0, fromEnd) / EDGE_ZONE_PX);
    return 0;
  };
  return { x: axis(p.x, viewport.width), y: axis(p.y, viewport.height) };
}

export class InputMachine {
  private readonly pointers = new Map<number, Point>();
  private mode: Mode = { kind: 'idle' };

  constructor(private readonly host: InputHost) {}

  /** Current mode, for tests and the renderer (e.g. hide UI while dragging). */
  get state(): Mode['kind'] {
    return this.mode.kind;
  }

  /**
   * @param pieceId Piece under the pointer, or `null` for empty space.
   * @param time Event timestamp in ms.
   */
  pointerDown(pointerId: number, p: Point, pieceId: number | null, time: number): void {
    this.pointers.set(pointerId, { ...p });

    if (this.pointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2 || this.mode.kind !== 'idle') return;

    if (pieceId !== null) {
      const world = screenToWorld(this.host.getCamera(), p);
      const start = this.host.beginDrag(pieceId, world);
      if (start) {
        this.mode = {
          kind: 'drag',
          pointerId,
          pieceId,
          groupId: start.groupId,
          grabOffset: { x: world.x - start.origin.x, y: world.y - start.origin.y },
          startOrigin: { ...start.origin },
          startScreen: { ...p },
          startTime: time,
          maxMove: 0,
        };
        return;
      }
    }
    this.mode = {
      kind: 'pan',
      pointerId,
      last: { ...p },
      startScreen: { ...p },
      startTime: time,
      pieceId,
      maxMove: 0,
    };
  }

  pointerMove(pointerId: number, p: Point): void {
    if (!this.pointers.has(pointerId)) return;
    this.pointers.set(pointerId, { ...p });
    const m = this.mode;

    if (m.kind === 'drag' && m.pointerId === pointerId) {
      m.maxMove = Math.max(m.maxMove, dist(p, m.startScreen));
      this.host.moveDrag(m.groupId, this.dragOrigin(m, p));
    } else if (m.kind === 'pan' && m.pointerId === pointerId) {
      m.maxMove = Math.max(m.maxMove, dist(p, m.startScreen));
      const cam = this.host.getCamera();
      this.host.setCamera({ ...cam, x: cam.x + p.x - m.last.x, y: cam.y + p.y - m.last.y });
      m.last = { ...p };
    } else if (m.kind === 'pinch') {
      const a = this.pointers.get(m.ids[0]);
      const b = this.pointers.get(m.ids[1]);
      if (!a || !b) return;
      const scale = m.startScale * (dist(a, b) / m.startDist);
      // Keep the world point that was under the fingers' midpoint under the new midpoint.
      this.host.setCamera(anchorAt(m.anchorWorld, mid(a, b), scale));
    }
  }

  /** Pointer released (or cancelled). */
  pointerUp(pointerId: number, p: Point, time: number): void {
    if (!this.pointers.has(pointerId)) return;
    this.pointers.set(pointerId, { ...p });
    const m = this.mode;

    if (m.kind === 'drag' && m.pointerId === pointerId) {
      m.maxMove = Math.max(m.maxMove, dist(p, m.startScreen));
      const origin = this.dragOrigin(m, p);
      if (isTap(m.maxMove, time - m.startTime)) this.host.tap(m.pieceId);
      this.host.endDrag(m.groupId, origin);
      this.mode = { kind: 'idle' };
    } else if (m.kind === 'pan' && m.pointerId === pointerId) {
      if (m.pieceId !== null && isTap(m.maxMove, time - m.startTime)) this.host.tap(m.pieceId);
      this.mode = { kind: 'idle' };
    } else if (m.kind === 'pinch' && m.ids.includes(pointerId)) {
      // Continue as a pan with the remaining finger, without a jump.
      this.pointers.delete(pointerId);
      const [restId] = [...this.pointers.keys()];
      const rest = restId === undefined ? undefined : this.pointers.get(restId);
      this.mode =
        restId !== undefined && rest
          ? {
              kind: 'pan',
              pointerId: restId,
              last: { ...rest },
              startScreen: { ...rest },
              startTime: time,
              pieceId: null,
              maxMove: Infinity, // never a tap
            }
          : { kind: 'idle' };
      return;
    }
    this.pointers.delete(pointerId);
  }

  /** Mouse wheel or trackpad pinch (Ctrl+wheel): zoom around the cursor. */
  wheel(p: Point, deltaY: number, deltaMode: number): void {
    const cam = this.host.getCamera();
    this.host.setCamera(zoomAt(cam, p, wheelZoomFactor(deltaY, deltaMode)));
  }

  /**
   * Per-frame update: auto-pan while a drag is near the viewport edge.
   * @param dtMs Time since the last frame.
   */
  tick(dtMs: number): void {
    const m = this.mode;
    if (m.kind !== 'drag') return;
    const p = this.pointers.get(m.pointerId);
    if (!p) return;
    const v = edgePanVelocity(p, this.host.getViewport());
    if (v.x === 0 && v.y === 0) return;
    const dt = Math.min(dtMs, 50) / 1000;
    const cam = this.host.getCamera();
    this.host.setCamera({ ...cam, x: cam.x + v.x * dt, y: cam.y + v.y * dt });
    // The world moved under a still pointer, so the group follows it.
    this.host.moveDrag(m.groupId, this.dragOrigin(m, p));
  }

  /** Drop everything, e.g. when the controller is destroyed or the page is hidden. */
  reset(): void {
    const m = this.mode;
    if (m.kind === 'drag') {
      const p = this.pointers.get(m.pointerId);
      this.host.endDrag(m.groupId, p ? this.dragOrigin(m, p) : m.startOrigin);
    }
    this.pointers.clear();
    this.mode = { kind: 'idle' };
  }

  private dragOrigin(m: Extract<Mode, { kind: 'drag' }>, p: Point): Point {
    const world = screenToWorld(this.host.getCamera(), p);
    return { x: world.x - m.grabOffset.x, y: world.y - m.grabOffset.y };
  }

  private startPinch(): void {
    const m = this.mode;
    if (m.kind === 'drag') {
      // Spec §6.4: a second finger cancels the drag, unless it already moved > 20 px.
      const p = this.pointers.get(m.pointerId) ?? m.startScreen;
      const moved = Math.max(m.maxMove, dist(p, m.startScreen));
      if (moved > PINCH_KEEP_DRAG_PX) this.host.endDrag(m.groupId, this.dragOrigin(m, p));
      else this.host.cancelDrag(m.groupId, m.startOrigin);
    }
    const [ida, idb] = [...this.pointers.keys()] as [number, number];
    const a = this.pointers.get(ida)!;
    const b = this.pointers.get(idb)!;
    const cam = this.host.getCamera();
    this.mode = {
      kind: 'pinch',
      ids: [ida, idb],
      startDist: Math.max(1, dist(a, b)),
      startScale: cam.scale,
      anchorWorld: screenToWorld(cam, mid(a, b)),
    };
  }
}
