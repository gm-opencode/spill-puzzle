/**
 * Pixi application lifecycle (architecture §6): create, resize with the host, clamp
 * the device pixel ratio, destroy. Pixi is only reached through `GameController`,
 * which the UI loads with `import()`, so it stays out of the initial bundle (NFR-3).
 */
import { Application, Container } from 'pixi.js';
import type { Viewport } from './camera';

/** Spec §10: default dark play area. */
export const PLAY_BACKGROUND = '#1e1f24';
/** Architecture §6: render at most 2× device pixels. */
export const MAX_RESOLUTION = 2;

/** Thrown when no WebGL context can be created (spec §11). */
export class GraphicsUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Your browser doesn't support graphics acceleration", { cause });
    this.name = 'GraphicsUnavailableError';
  }
}

export interface Engine {
  app: Application;
  /** Holds the puzzle; its transform is the camera. */
  world: Container;
  /** Screen-space layer above the world (preview overlay). */
  overlay: Container;
  viewport(): Viewport;
  /** Called after the canvas is resized. Returns an unsubscribe function. */
  onResize(cb: (viewport: Viewport) => void): () => void;
  destroy(): void;
}

/** Create the Pixi app and attach its canvas to `host`, which must have a size. */
export async function createEngine(host: HTMLElement): Promise<Engine> {
  const app = new Application();
  try {
    await app.init({
      resizeTo: host,
      background: PLAY_BACKGROUND,
      resolution: Math.min(globalThis.devicePixelRatio || 1, MAX_RESOLUTION),
      autoDensity: true,
      antialias: false, // piece edges are anti-aliased when baked
      preference: 'webgl',
    });
  } catch (error) {
    throw new GraphicsUnavailableError(error);
  }

  const canvas = app.canvas;
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none'; // we handle pan and pinch ourselves
  canvas.style.userSelect = 'none';
  host.appendChild(canvas);

  const world = new Container({ sortableChildren: true, label: 'world' });
  const overlay = new Container({ label: 'overlay' });
  app.stage.addChild(world, overlay);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  const viewport = (): Viewport => ({ width: app.screen.width, height: app.screen.height });
  const listeners = new Set<(v: Viewport) => void>();
  const handleResize = () => listeners.forEach((cb) => cb(viewport()));
  app.renderer.on('resize', handleResize);

  return {
    app,
    world,
    overlay,
    viewport,
    onResize(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy() {
      listeners.clear();
      app.renderer.off('resize', handleResize);
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
