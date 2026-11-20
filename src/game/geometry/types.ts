/** Shared geometry types. All coordinates are world px (= source image px) unless stated otherwise. */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A single drawing command with absolute coordinates.
 * `C` is a cubic Bézier: control points (x1, y1), (x2, y2), end point (x, y).
 */
export type PathCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' };
