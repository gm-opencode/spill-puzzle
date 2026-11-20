/**
 * Main-thread entry point for baking (spec §5). Uses the worker when OffscreenCanvas
 * is available, otherwise bakes on the main thread in batches of 10 pieces (FR-2.5).
 */
import { proxy, releaseProxy, transfer, wrap } from 'comlink';
import type { PieceShape } from '../geometry/outline';
import { chooseAtlasSize } from './atlas';
import type { BakeWorkerApi } from './bake.worker';
import {
  bakePieces,
  type Bake2DContext,
  type BakeCanvasFactory,
  type BakeResult,
} from './bakePieces';

export type BakeMode = 'worker' | 'main-thread';

export interface BakeRequestOptions {
  /** Maximum atlas side in px. Defaults to {@link chooseAtlasSize} for this device. */
  maxAtlasSize?: number;
  /** Progress in `[0, 1]`. */
  onProgress?: (progress: number) => void;
  /** Skip the worker (for testing the fallback). */
  forceMainThread?: boolean;
}

export interface BakeOutcome extends BakeResult {
  mode: BakeMode;
  /** Wall-clock bake time in ms. */
  durationMs: number;
}

/** Main-thread batch size (spec §5). */
export const MAIN_THREAD_BATCH = 10;

function deviceMemory(): number | undefined {
  // `deviceMemory` is Chromium-only and not in lib.dom.d.ts.
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}

/** True if the worker path can run: module workers plus OffscreenCanvas with a 2D context. */
export function supportsWorkerBaking(): boolean {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
  try {
    return new OffscreenCanvas(1, 1).getContext('2d') !== null;
  } catch {
    return false;
  }
}

/**
 * Bake all piece textures into atlases.
 * The caller owns the returned bitmaps; release them with {@link disposeBakeResult}.
 *
 * @param image Normalised source image (1 px = 1 world px). Not consumed: a copy goes to the worker.
 * @param shapes Piece shapes indexed by piece id.
 */
export async function bakeAtlases(
  image: ImageBitmap,
  shapes: PieceShape[],
  options: BakeRequestOptions = {},
): Promise<BakeOutcome> {
  const maxAtlasSize = options.maxAtlasSize ?? chooseAtlasSize(deviceMemory());
  const start = performance.now();

  if (!options.forceMainThread && supportsWorkerBaking()) {
    try {
      const result = await bakeInWorker(image, shapes, maxAtlasSize, options.onProgress);
      return { ...result, mode: 'worker', durationMs: performance.now() - start };
    } catch (error) {
      console.warn('Worker baking failed; falling back to the main thread.', error);
    }
  }

  const result = await bakePieces(
    image,
    { width: image.width, height: image.height },
    shapes,
    domCanvasFactory,
    { maxAtlasSize, onProgress: options.onProgress, yieldEvery: MAIN_THREAD_BATCH },
  );
  return { ...result, mode: 'main-thread', durationMs: performance.now() - start };
}

/** Free the atlas bitmaps (NFR-6). */
export function disposeBakeResult(result: Pick<BakeResult, 'atlases'>): void {
  for (const bitmap of result.atlases) bitmap.close();
}

async function bakeInWorker(
  image: ImageBitmap,
  shapes: PieceShape[],
  maxAtlasSize: number,
  onProgress?: (p: number) => void,
): Promise<BakeResult> {
  const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
  const remote = wrap<BakeWorkerApi>(worker);
  try {
    const copy = await createImageBitmap(image);
    const progress = onProgress ? proxy(onProgress) : undefined;
    return await remote.bake(transfer({ image: copy, shapes, maxAtlasSize }, [copy]), progress);
  } finally {
    remote[releaseProxy]();
    worker.terminate();
  }
}

const domCanvasFactory: BakeCanvasFactory<HTMLCanvasElement> = {
  create(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d') as Bake2DContext | null;
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    return { canvas, ctx };
  },
  async toBitmap(canvas) {
    const bitmap = await createImageBitmap(canvas);
    // Release the canvas backing store right away (iOS keeps it otherwise).
    canvas.width = 0;
    canvas.height = 0;
    return bitmap;
  },
};
