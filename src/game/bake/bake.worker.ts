/// <reference lib="webworker" />
/**
 * Bake worker (spec §5): bakes piece textures off the main thread with OffscreenCanvas.
 */
import { expose, transfer } from 'comlink';
import type { PieceShape } from '../geometry/outline';
import {
  bakePieces,
  type Bake2DContext,
  type BakeCanvasFactory,
  type BakeResult,
} from './bakePieces';

const offscreenFactory: BakeCanvasFactory<OffscreenCanvas> = {
  create(width, height) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d') as Bake2DContext | null;
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
    return { canvas, ctx };
  },
  toBitmap: (canvas) => canvas.transferToImageBitmap(),
};

export interface WorkerBakeRequest {
  image: ImageBitmap;
  shapes: PieceShape[];
  maxAtlasSize: number;
}

const api = {
  async bake(request: WorkerBakeRequest, onProgress?: (p: number) => void): Promise<BakeResult> {
    const { image, shapes, maxAtlasSize } = request;
    try {
      const result = await bakePieces(
        image,
        { width: image.width, height: image.height },
        shapes,
        offscreenFactory,
        { maxAtlasSize, onProgress },
      );
      return transfer(result, result.atlases);
    } finally {
      image.close();
    }
  },
};

export type BakeWorkerApi = typeof api;

expose(api);
