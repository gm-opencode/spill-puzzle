import { describe, expect, it } from 'vitest';
import {
  anchorAt,
  cameraLimits,
  centreOn,
  clampCamera,
  fitRect,
  fitScale,
  FIT_PADDING,
  lerpCamera,
  screenToWorld,
  unionRects,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
} from '../../../../src/game/render/camera';

const VIEW = { width: 800, height: 600 };
const BOARD = { x: 0, y: 0, width: 2048, height: 1536 };
const AREA = { x: -1500, y: -1500, width: 5048, height: 4536 };

describe('camera', () => {
  it('converts between screen and world', () => {
    const cam = { x: 100, y: -50, scale: 0.5 };
    const w = { x: 300, y: 400 };
    expect(worldToScreen(cam, w)).toEqual({ x: 250, y: 150 });
    expect(screenToWorld(cam, worldToScreen(cam, w))).toEqual(w);
  });

  it('fits and centres a rectangle with padding', () => {
    const cam = fitRect(BOARD, VIEW);
    expect(cam.scale).toBeCloseTo(Math.min(768 / 2048, 568 / 1536), 12);
    const centre = worldToScreen(cam, { x: 1024, y: 768 });
    expect(centre.x).toBeCloseTo(400, 9);
    expect(centre.y).toBeCloseTo(300, 9);
    // The fitted rect is inside the padded viewport.
    const tl = worldToScreen(cam, { x: 0, y: 0 });
    expect(tl.x).toBeGreaterThanOrEqual(FIT_PADDING - 1e-9);
    expect(tl.y).toBeGreaterThanOrEqual(FIT_PADDING - 1e-9);
  });

  it('never uses a negative fit size on tiny viewports', () => {
    expect(fitScale(BOARD, { width: 10, height: 10 })).toBeGreaterThan(0);
  });

  it('limits zoom between fit-the-play-area and 4 × fit-the-board (spec §6.5)', () => {
    const limits = cameraLimits(BOARD, AREA, VIEW);
    expect(limits.minScale).toBeCloseTo(fitScale(AREA, VIEW), 12);
    expect(limits.maxScale).toBeCloseTo(4 * fitScale(BOARD, VIEW), 12);
    const tiny = cameraLimits(BOARD, { x: 0, y: 0, width: 10, height: 10 }, VIEW);
    expect(tiny.maxScale).toBeGreaterThanOrEqual(tiny.minScale);
  });

  it('clamps scale and keeps the viewport centre inside the bounds', () => {
    const limits = cameraLimits(BOARD, AREA, VIEW);
    const zoomedOut = clampCamera({ x: 0, y: 0, scale: 0.001 }, VIEW, limits);
    expect(zoomedOut.scale).toBe(limits.minScale);
    const zoomedIn = clampCamera({ x: 0, y: 0, scale: 100 }, VIEW, limits);
    expect(zoomedIn.scale).toBe(limits.maxScale);

    const farAway = clampCamera(
      centreOn({ x: 1e6, y: -1e6, width: 1, height: 1 }, VIEW, 0.5),
      VIEW,
      limits,
    );
    const centre = screenToWorld(farAway, { x: 400, y: 300 });
    expect(centre.x).toBeCloseTo(AREA.x + AREA.width, 9);
    expect(centre.y).toBeCloseTo(AREA.y, 9);

    const fine = fitRect(BOARD, VIEW);
    expect(clampCamera(fine, VIEW, limits)).toEqual(fine);
  });

  it('zooms around a screen point', () => {
    const cam = { x: 10, y: 20, scale: 1 };
    const p = { x: 300, y: 200 };
    const before = screenToWorld(cam, p);
    const z = zoomAt(cam, p, 2);
    expect(z.scale).toBe(2);
    expect(screenToWorld(z, p)).toEqual(before);
  });

  it('anchors a world point at a screen point', () => {
    const cam = anchorAt({ x: 5, y: 7 }, { x: 100, y: 50 }, 3);
    expect(worldToScreen(cam, { x: 5, y: 7 })).toEqual({ x: 100, y: 50 });
  });

  it('turns wheel deltas into zoom factors', () => {
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(0, 0)).toBe(1);
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48, 0), 12);
    expect(wheelZoomFactor(1, 2)).toBeCloseTo(wheelZoomFactor(200, 0), 12);
    expect(wheelZoomFactor(1e6, 0)).toBe(wheelZoomFactor(200, 0)); // clamped
  });

  it('interpolates cameras', () => {
    const a = { x: 0, y: 0, scale: 1 };
    const b = { x: 10, y: -10, scale: 3 };
    expect(lerpCamera(a, b, 0)).toEqual(a);
    expect(lerpCamera(a, b, 1)).toEqual(b);
    expect(lerpCamera(a, b, 0.5)).toEqual({ x: 5, y: -5, scale: 2 });
  });

  it('unions rectangles', () => {
    expect(unionRects([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: -5, y: 5, width: 2, height: 20 },
      ]),
    ).toEqual({ x: -5, y: 0, width: 15, height: 25 });
  });
});
