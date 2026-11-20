import { describe, expect, it } from 'vitest';
import type { Camera } from '../../../../src/game/render/camera';
import {
  edgePanVelocity,
  EDGE_PAN_SPEED,
  InputMachine,
  isTap,
  type InputHost,
} from '../../../../src/game/render/input';
import type { Point } from '../../../../src/game/geometry/types';

/** Fake host: piece 7 belongs to group 3 at origin (100, 50); piece 9 is locked. */
class FakeHost implements InputHost {
  camera: Camera = { x: 0, y: 0, scale: 2 };
  origin: Point = { x: 100, y: 50 };
  readonly calls: string[] = [];

  getCamera() {
    return this.camera;
  }
  setCamera(c: Camera) {
    this.camera = c;
    this.calls.push('camera');
  }
  getViewport() {
    return { width: 800, height: 600 };
  }
  beginDrag(pieceId: number) {
    this.calls.push(`begin:${pieceId}`);
    return pieceId === 9 ? null : { groupId: 3, origin: { ...this.origin } };
  }
  moveDrag(groupId: number, o: Point) {
    this.origin = o;
    this.calls.push(`move:${groupId}`);
  }
  endDrag(groupId: number, o: Point) {
    this.origin = o;
    this.calls.push(`end:${groupId}`);
  }
  cancelDrag(groupId: number, o: Point) {
    this.origin = o;
    this.calls.push(`cancel:${groupId}`);
  }
  tap(pieceId: number) {
    this.calls.push(`tap:${pieceId}`);
  }
}

const makeHost = () => new FakeHost();

describe('tap and edge helpers', () => {
  it('detects taps (< 6 px and < 250 ms)', () => {
    expect(isTap(0, 0)).toBe(true);
    expect(isTap(5.9, 249)).toBe(true);
    expect(isTap(6, 100)).toBe(false);
    expect(isTap(1, 250)).toBe(false);
  });

  it('auto-pans faster closer to the edge', () => {
    const view = { width: 800, height: 600 };
    expect(edgePanVelocity({ x: 400, y: 300 }, view)).toEqual({ x: 0, y: 0 });
    expect(edgePanVelocity({ x: 0, y: 300 }, view).x).toBe(EDGE_PAN_SPEED);
    expect(edgePanVelocity({ x: 20, y: 300 }, view).x).toBe(EDGE_PAN_SPEED / 2);
    expect(edgePanVelocity({ x: 800, y: 300 }, view).x).toBe(-EDGE_PAN_SPEED);
    expect(edgePanVelocity({ x: 400, y: 590 }, view).y).toBeLessThan(0);
    expect(edgePanVelocity({ x: 10, y: 10 }, { width: 50, height: 50 })).toEqual({ x: 0, y: 0 });
  });
});

describe('InputMachine', () => {
  it('drags a group, keeping the grab offset, and drops it', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    // Pointer at screen (220, 120) = world (110, 60): 10/10 px from the origin.
    input.pointerDown(1, { x: 220, y: 120 }, 7, 0);
    expect(input.state).toBe('drag');
    input.pointerMove(1, { x: 320, y: 220 });
    expect(host.origin).toEqual({ x: 150, y: 100 }); // moved 50 world px (scale 2)
    input.pointerUp(1, { x: 320, y: 220 }, 500);
    expect(host.calls).toEqual(['begin:7', 'move:3', 'end:3']);
    expect(input.state).toBe('idle');
  });

  it('reports a tap on a quick press', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 220, y: 120 }, 7, 1000);
    input.pointerMove(1, { x: 223, y: 121 });
    input.pointerUp(1, { x: 223, y: 121 }, 1100);
    expect(host.calls).toContain('tap:7');
    expect(host.calls.at(-1)).toBe('end:3');
  });

  it('does not tap after a slow press or a real drag', () => {
    for (const [dx, t] of [
      [0, 400],
      [30, 100],
    ] as const) {
      const host = makeHost();
      const input = new InputMachine(host);
      input.pointerDown(1, { x: 0, y: 0 }, 7, 0);
      input.pointerMove(1, { x: dx, y: 0 });
      input.pointerUp(1, { x: dx, y: 0 }, t);
      expect(host.calls.some((c: string) => c.startsWith('tap'))).toBe(false);
    }
  });

  it('pans on empty space and on undraggable pieces', () => {
    for (const piece of [null, 9]) {
      const host = makeHost();
      const input = new InputMachine(host);
      input.pointerDown(1, { x: 100, y: 100 }, piece, 0);
      expect(input.state).toBe('pan');
      input.pointerMove(1, { x: 130, y: 90 });
      expect(host.camera).toMatchObject({ x: 30, y: -10, scale: 2 });
      input.pointerUp(1, { x: 130, y: 90 }, 50);
      expect(input.state).toBe('idle');
    }
  });

  it('taps a locked piece without dragging it', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 100, y: 100 }, 9, 0);
    input.pointerUp(1, { x: 100, y: 100 }, 50);
    expect(host.calls).toEqual(['begin:9', 'tap:9']);
  });

  it('cancels a short drag when a second finger lands, then pinch-zooms', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 200, y: 200 }, 7, 0);
    input.pointerMove(1, { x: 210, y: 200 }); // 10 px < 20 px
    input.pointerDown(2, { x: 400, y: 200 }, null, 50);
    expect(host.calls).toContain('cancel:3');
    expect(host.origin).toEqual({ x: 100, y: 50 }); // back at the start
    expect(input.state).toBe('pinch');

    // Fingers 210→400 (190 px apart) spread to 115→495 (380 px): scale doubles.
    const anchorScreen = { x: 305, y: 200 };
    const worldBefore = {
      x: (anchorScreen.x - host.camera.x) / 2,
      y: (anchorScreen.y - host.camera.y) / 2,
    };
    input.pointerMove(1, { x: 115, y: 200 });
    input.pointerMove(2, { x: 495, y: 200 });
    expect(host.camera.scale).toBeCloseTo(4, 9);
    // The world point under the midpoint stays under it.
    expect((anchorScreen.x - host.camera.x) / host.camera.scale).toBeCloseTo(worldBefore.x, 9);
    expect((anchorScreen.y - host.camera.y) / host.camera.scale).toBeCloseTo(worldBefore.y, 9);
  });

  it('keeps a long drag when a second finger lands', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 200, y: 200 }, 7, 0);
    input.pointerMove(1, { x: 260, y: 200 }); // 60 px
    input.pointerDown(2, { x: 400, y: 200 }, null, 50);
    expect(host.calls).toContain('end:3');
    expect(host.origin).toEqual({ x: 130, y: 50 });
  });

  it('continues as a pan when one pinch finger lifts', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 100, y: 100 }, null, 0);
    input.pointerDown(2, { x: 300, y: 100 }, null, 0);
    input.pointerUp(1, { x: 100, y: 100 }, 10);
    expect(input.state).toBe('pan');
    const before = { ...host.camera };
    input.pointerMove(2, { x: 310, y: 120 });
    expect(host.camera.x - before.x).toBeCloseTo(10, 9);
    expect(host.camera.y - before.y).toBeCloseTo(20, 9);
    input.pointerUp(2, { x: 310, y: 120 }, 20);
    expect(input.state).toBe('idle');
    expect(host.calls.some((c: string) => c.startsWith('tap'))).toBe(false);
  });

  it('ignores a third finger and unknown pointers', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 0, y: 0 }, null, 0);
    input.pointerDown(2, { x: 100, y: 0 }, null, 0);
    input.pointerDown(3, { x: 50, y: 50 }, 7, 0);
    expect(input.state).toBe('pinch');
    expect(host.calls).not.toContain('begin:7');
    input.pointerMove(42, { x: 0, y: 0 });
    input.pointerUp(42, { x: 0, y: 0 }, 0);
    input.pointerUp(3, { x: 50, y: 50 }, 0);
    expect(input.state).toBe('pinch');
  });

  it('zooms around the cursor on wheel', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.wheel({ x: 400, y: 300 }, -100, 0);
    expect(host.camera.scale).toBeGreaterThan(2);
    expect((400 - host.camera.x) / host.camera.scale).toBeCloseTo(200, 9);
  });

  it('auto-pans while dragging near the edge and the group follows', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 220, y: 120 }, 7, 0);
    input.pointerMove(1, { x: 5, y: 300 });
    const originBefore = { ...host.origin };
    input.tick(16);
    expect(host.camera.x).toBeGreaterThan(0);
    expect(host.origin.x).toBeLessThan(originBefore.x); // group moves left in the world
    input.tick(1000); // clamped to 50 ms
    expect(host.camera.x).toBeLessThan(EDGE_PAN_SPEED * 0.07);
  });

  it('does nothing on tick unless dragging near an edge', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.tick(16);
    input.pointerDown(1, { x: 220, y: 120 }, 7, 0);
    input.tick(16);
    expect(host.calls).toEqual(['begin:7']);
  });

  it('reset ends an active drag', () => {
    const host = makeHost();
    const input = new InputMachine(host);
    input.pointerDown(1, { x: 220, y: 120 }, 7, 0);
    input.reset();
    expect(host.calls.at(-1)).toBe('end:3');
    expect(input.state).toBe('idle');
    input.reset();
  });
});
