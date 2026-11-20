/**
 * Piece texture baking (spec §5): clip each piece out of the source image, add a
 * bevel and a thin outline, and draw it into shelf-packed atlases.
 *
 * Shared by the worker (`OffscreenCanvas`) and the main-thread fallback (`<canvas>`).
 * It has no DOM or worker globals of its own: canvases come from `BakeCanvasFactory`.
 */
import type { PieceShape } from '../geometry/outline';
import type { PathCommand } from '../geometry/types';
import { packShelves, type AtlasFrame } from './atlas';

export type Bake2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Creates atlas canvases and turns them into transferable bitmaps. */
export interface BakeCanvasFactory<C> {
  create(width: number, height: number): { canvas: C; ctx: Bake2DContext };
  toBitmap(canvas: C): Promise<ImageBitmap> | ImageBitmap;
}

export interface BakeOptions {
  /** Maximum atlas width and height in px (spec §5). */
  maxAtlasSize: number;
  /** Called with progress in `[0, 1]`. */
  onProgress?: (progress: number) => void;
  /** Yield to the event loop after this many pieces (main-thread fallback, FR-2.5). 0 = never. */
  yieldEvery?: number;
}

/** One baked piece: where its texture is, and where that texture goes in the world. */
export interface BakedFrame extends AtlasFrame {
  /** World px of the texture's top-left corner (the piece bounds' origin). */
  worldX: number;
  worldY: number;
}

export interface BakeResult {
  /** One bitmap per atlas. The caller owns them and must `close()` them (NFR-6). */
  atlases: ImageBitmap[];
  /** Indexed by piece id. */
  frames: BakedFrame[];
}

/** Bevel and outline styling (spec §5 steps 3–4). */
export const BEVEL = {
  width: 2,
  light: 'rgba(255,255,255,0.35)',
  dark: 'rgba(0,0,0,0.35)',
  /** Offset of the light stroke, in px. Puts the highlight on the top-left inner edge. */
  lightOffset: 1,
  outline: 'rgba(0,0,0,0.25)',
} as const;

/** Texture size of a piece in whole px. */
export function frameSize(shape: Pick<PieceShape, 'bounds'>): { width: number; height: number } {
  return { width: Math.ceil(shape.bounds.width), height: Math.ceil(shape.bounds.height) };
}

/**
 * Bake every piece into atlases.
 *
 * @param image Source image; 1 image px = 1 world px (spec §3).
 * @param imageSize Source size in px (`image.width/height` aren't typed on every source).
 * @param shapes Piece shapes, indexed by piece id.
 */
export async function bakePieces<C>(
  image: CanvasImageSource,
  imageSize: { width: number; height: number },
  shapes: readonly PieceShape[],
  factory: BakeCanvasFactory<C>,
  options: BakeOptions,
): Promise<BakeResult> {
  const { maxAtlasSize, onProgress, yieldEvery = 0 } = options;
  const packing = packShelves(shapes.map(frameSize), maxAtlasSize);
  const targets = packing.atlases.map((a) => factory.create(a.width, a.height));

  const frames: BakedFrame[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i]!;
    const frame = packing.frames[i]!;
    const target = targets[frame.atlas]!;
    drawPiece(target.ctx, image, imageSize, shape, frame);
    frames.push({ ...frame, worldX: shape.bounds.x, worldY: shape.bounds.y });

    const done = i + 1;
    if (yieldEvery > 0 && done % yieldEvery === 0 && done < shapes.length) {
      onProgress?.(done / shapes.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } else if (onProgress && (done % 10 === 0 || done === shapes.length)) {
      onProgress(done / shapes.length);
    }
  }

  const atlases = await Promise.all(targets.map((t) => factory.toBitmap(t.canvas)));
  return { atlases, frames };
}

/** Draw one piece into its atlas frame. */
export function drawPiece(
  ctx: Bake2DContext,
  image: CanvasImageSource,
  imageSize: { width: number; height: number },
  shape: PieceShape,
  frame: AtlasFrame,
): void {
  const b = shape.bounds;
  ctx.save();
  // World → atlas px.
  ctx.translate(frame.x - b.x, frame.y - b.y);

  // The outline always lies inside the bounds (tested in outline.test.ts), so
  // clipping to it also keeps the piece inside its frame.
  tracePath(ctx, shape.outline, 0, 0);
  ctx.clip();

  // Source image, limited to the part under the frame.
  const sx = Math.max(0, Math.floor(b.x));
  const sy = Math.max(0, Math.floor(b.y));
  const ex = Math.min(imageSize.width, Math.ceil(b.x + frame.width));
  const ey = Math.min(imageSize.height, Math.ceil(b.y + frame.height));
  if (ex > sx && ey > sy) {
    ctx.drawImage(image, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
  }

  // Bevel: strokes are centred on a shifted copy of the outline and clipped to the
  // piece, so only the inner half of each stroke shows on the side it was shifted towards.
  ctx.lineWidth = BEVEL.width;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BEVEL.light;
  tracePath(ctx, shape.outline, BEVEL.lightOffset, BEVEL.lightOffset);
  ctx.stroke();
  ctx.strokeStyle = BEVEL.dark;
  tracePath(ctx, shape.outline, -BEVEL.lightOffset, -BEVEL.lightOffset);
  ctx.stroke();

  // Thin outline: a 2 px stroke clipped to the piece leaves 1 px inside.
  ctx.strokeStyle = BEVEL.outline;
  ctx.lineWidth = 2;
  tracePath(ctx, shape.outline, 0, 0);
  ctx.stroke();

  ctx.restore();
}

/** Replay path commands on a 2D context, offset by `(dx, dy)`. */
export function tracePath(
  ctx: Pick<Bake2DContext, 'beginPath' | 'moveTo' | 'lineTo' | 'bezierCurveTo' | 'closePath'>,
  commands: readonly PathCommand[],
  dx: number,
  dy: number,
): void {
  ctx.beginPath();
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        ctx.moveTo(c.x + dx, c.y + dy);
        break;
      case 'L':
        ctx.lineTo(c.x + dx, c.y + dy);
        break;
      case 'C':
        ctx.bezierCurveTo(c.x1 + dx, c.y1 + dy, c.x2 + dx, c.y2 + dy, c.x + dx, c.y + dy);
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  }
}
