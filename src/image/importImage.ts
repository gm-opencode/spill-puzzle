/**
 * Image import pipeline (spec §2): decode with EXIF orientation, validate,
 * downscale, encode for storage, and make a thumbnail.
 *
 * The sizing and validation rules are small pure functions so they can be unit-tested.
 */

/** Shortest side below which an image is rejected (FR-1.5), in px. */
export const MIN_SIDE = 400;
/** Longest side of the stored image on normal devices, in px (spec §2.3). */
export const MAX_SIDE = 2048;
/** Longest side of the stored image on low-memory devices (`deviceMemory < 4`), in px. */
export const MAX_SIDE_LOW_MEMORY = 1600;
/** Longest side of the thumbnail, in px (spec §2.3). */
export const THUMB_SIDE = 320;
/** Encoder quality for the stored image. */
export const IMAGE_QUALITY = 0.9;
/** Encoder quality for the thumbnail. */
export const THUMB_QUALITY = 0.8;

export type ImageImportErrorCode = 'unsupported' | 'too-small' | 'encode-failed';

/** User-facing messages (spec §2.2, §11). They move to `t()` in Milestone 5. */
export const IMAGE_IMPORT_MESSAGES: Record<ImageImportErrorCode, string> = {
  unsupported: "This image format isn't supported on this device. Try a JPEG or PNG.",
  'too-small': 'Choose an image at least 400 px on each side.',
  'encode-failed': "This image couldn't be processed. Try another image.",
};

export class ImageImportError extends Error {
  readonly code: ImageImportErrorCode;

  constructor(code: ImageImportErrorCode, options?: { cause?: unknown }) {
    super(IMAGE_IMPORT_MESSAGES[code], options);
    this.name = 'ImageImportError';
    this.code = code;
  }
}

export interface ImportedImage {
  /** Normalised image for storage (WebP, or JPEG where WebP encoding is unsupported). */
  blob: Blob;
  /** Thumbnail, longest side {@link THUMB_SIDE} px. */
  thumbBlob: Blob;
  /** Width of `blob` in px, after orientation and downscaling. */
  width: number;
  /** Height of `blob` in px, after orientation and downscaling. */
  height: number;
  /** MIME type of `blob`. */
  mime: string;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Longest side for the stored image (spec §2.3).
 * @param deviceMemory `navigator.deviceMemory` in GiB, or `undefined` where unsupported (treated as 4).
 */
export function chooseMaxSide(deviceMemory: number | undefined): number {
  return (deviceMemory ?? 4) < 4 ? MAX_SIDE_LOW_MEMORY : MAX_SIDE;
}

/**
 * Scale `size` down proportionally so its longest side is at most `maxSide` px.
 * Never scales up. Results are rounded to whole px and are at least 1 px.
 */
export function fitWithin(size: Size, maxSide: number): Size {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxSide) return { width: size.width, height: size.height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * Validate decoded (oriented) image dimensions. Returns the error code, or `null` if valid.
 * The minimum applies to the shortest side of the original image (FR-1.5).
 */
export function validateDimensions(size: Size): ImageImportErrorCode | null {
  if (!(size.width > 0) || !(size.height > 0)) return 'unsupported';
  if (Math.min(size.width, size.height) < MIN_SIDE) return 'too-small';
  return null;
}

/** Things the pipeline needs from the environment. Injectable for tests. */
export interface ImportEnvironment {
  deviceMemory?: number;
}

function defaultEnvironment(): ImportEnvironment {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  // `deviceMemory` is Chromium-only and not in lib.dom.d.ts.
  const deviceMemory = (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
  return { deviceMemory };
}

/**
 * Import a user-picked image file (spec §2).
 * @throws {ImageImportError} with code `unsupported`, `too-small` or `encode-failed`.
 */
export async function importImage(
  file: Blob,
  env: ImportEnvironment = defaultEnvironment(),
): Promise<ImportedImage> {
  if (file.size === 0) throw new ImageImportError('unsupported');

  const source = await decodeImage(file);
  try {
    const original = { width: source.width, height: source.height };
    const invalid = validateDimensions(original);
    if (invalid) throw new ImageImportError(invalid);

    const size = fitWithin(original, chooseMaxSide(env.deviceMemory));
    const canvas = drawScaled(source.image, size);
    const { blob, mime } = await encode(canvas, IMAGE_QUALITY);

    const thumbSize = fitWithin(size, THUMB_SIDE);
    const thumbCanvas = drawScaled(canvas, thumbSize);
    const { blob: thumbBlob } = await encode(thumbCanvas, THUMB_QUALITY);

    return { blob, thumbBlob, width: size.width, height: size.height, mime };
  } finally {
    source.release();
  }
}

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

/**
 * Decode with EXIF orientation applied (FR-1.3). Falls back to an `<img>` element,
 * which modern browsers also orient, when `createImageBitmap` is missing or fails.
 */
async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path (e.g. Safari < 17 option support).
    }
  }
  if (typeof document === 'undefined') throw new ImageImportError('unsupported');

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      image: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw new ImageImportError('unsupported', { cause });
  }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function createCanvas(size: Size): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size.width, size.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  return canvas;
}

function drawScaled(image: CanvasImageSource, size: Size): AnyCanvas {
  const canvas = createCanvas(size);
  const ctx = canvas.getContext('2d') as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new ImageImportError('encode-failed');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, size.width, size.height);
  return canvas;
}

async function toBlob(canvas: AnyCanvas, type: string, quality: number): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    try {
      return await canvas.convertToBlob({ type, quality });
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** WebP if the browser can encode it (checked via the returned type), else JPEG (spec §2.3). */
async function encode(canvas: AnyCanvas, quality: number): Promise<{ blob: Blob; mime: string }> {
  for (const type of ['image/webp', 'image/jpeg']) {
    const blob = await toBlob(canvas, type, quality);
    if (blob && blob.type === type) return { blob, mime: type };
  }
  throw new ImageImportError('encode-failed');
}
