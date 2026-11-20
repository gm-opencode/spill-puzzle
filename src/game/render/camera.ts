/**
 * Camera math (spec §6.5). Pure functions: no Pixi or DOM, so they are unit-tested.
 *
 * The camera is the world container's transform: `screen = world · scale + (x, y)`,
 * in CSS px.
 */
import type { Point, Rect } from '../geometry/types';

export interface Camera {
  /** Screen x of world x = 0, in CSS px. */
  x: number;
  /** Screen y of world y = 0, in CSS px. */
  y: number;
  /** CSS px per world px. */
  scale: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface CameraLimits {
  minScale: number;
  maxScale: number;
  /** World rectangle the viewport centre must stay inside while panning. */
  bounds: Rect;
}

/** Empty space kept around a fitted rectangle, in CSS px. */
export const FIT_PADDING = 16;
/** `maxScale` as a multiple of the fit-to-board scale (spec §6.5). */
export const MAX_ZOOM_FACTOR = 4;

/** Convert a screen point (CSS px) to world px. */
export function screenToWorld(camera: Camera, p: Point): Point {
  return { x: (p.x - camera.x) / camera.scale, y: (p.y - camera.y) / camera.scale };
}

/** Convert a world point to screen CSS px. */
export function worldToScreen(camera: Camera, p: Point): Point {
  return { x: p.x * camera.scale + camera.x, y: p.y * camera.scale + camera.y };
}

/** Scale at which `rect` fits in the viewport with `padding` CSS px around it. */
export function fitScale(rect: Rect, viewport: Viewport, padding: number = FIT_PADDING): number {
  const w = Math.max(1, viewport.width - 2 * padding);
  const h = Math.max(1, viewport.height - 2 * padding);
  return Math.min(w / rect.width, h / rect.height);
}

/** Camera that centres `rect` in the viewport at its fit scale. */
export function fitRect(rect: Rect, viewport: Viewport, padding: number = FIT_PADDING): Camera {
  const scale = fitScale(rect, viewport, padding);
  return centreOn(rect, viewport, scale);
}

/** Camera at `scale` with the centre of `rect` in the middle of the viewport. */
export function centreOn(rect: Rect, viewport: Viewport, scale: number): Camera {
  return {
    scale,
    x: viewport.width / 2 - (rect.x + rect.width / 2) * scale,
    y: viewport.height / 2 - (rect.y + rect.height / 2) * scale,
  };
}

/**
 * Zoom limits (spec §6.5): `minScale` fits the whole play area, `maxScale` is
 * 4 × the fit-to-board scale. If the play area is tiny, `maxScale` never drops below `minScale`.
 */
export function cameraLimits(board: Rect, playArea: Rect, viewport: Viewport): CameraLimits {
  const minScale = fitScale(playArea, viewport);
  const maxScale = Math.max(minScale, MAX_ZOOM_FACTOR * fitScale(board, viewport));
  return { minScale, maxScale, bounds: playArea };
}

/** Clamp `value` to `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp the scale to the limits and the translation so the viewport centre stays
 * inside `limits.bounds`.
 */
export function clampCamera(camera: Camera, viewport: Viewport, limits: CameraLimits): Camera {
  const scale = clamp(camera.scale, limits.minScale, limits.maxScale);
  // Keep the world point under the viewport centre when the scale is clamped.
  const centre = { x: viewport.width / 2, y: viewport.height / 2 };
  const world = screenToWorld(camera, centre);
  const b = limits.bounds;
  const wx = clamp(world.x, b.x, b.x + b.width);
  const wy = clamp(world.y, b.y, b.y + b.height);
  return { scale, x: centre.x - wx * scale, y: centre.y - wy * scale };
}

/**
 * Zoom by `factor` keeping the world point under `screenPoint` fixed (wheel and pinch).
 * The result is not clamped.
 */
export function zoomAt(camera: Camera, screenPoint: Point, factor: number): Camera {
  const world = screenToWorld(camera, screenPoint);
  const scale = camera.scale * factor;
  return { scale, x: screenPoint.x - world.x * scale, y: screenPoint.y - world.y * scale };
}

/** Camera that shows `world` at `screen` with the given scale. */
export function anchorAt(world: Point, screen: Point, scale: number): Camera {
  return { scale, x: screen.x - world.x * scale, y: screen.y - world.y * scale };
}

/**
 * Wheel delta → zoom factor. `deltaMode` 1 (lines) counts as 16 px per line.
 * Positive delta (scroll down) zooms out.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-clamp(px, -200, 200) * 0.0015);
}

/** Interpolate between cameras for animations. `t ∈ [0, 1]`. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    scale: a.scale + (b.scale - a.scale) * t,
  };
}

/** Smallest rectangle containing all the given rectangles. */
export function unionRects(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
