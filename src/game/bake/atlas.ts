/**
 * Shelf packing of piece textures into atlases (spec §5). Pure and deterministic.
 */

/** Size of one item to pack, in whole texture px. */
export interface PackItem {
  width: number;
  height: number;
}

/** Where an item ended up: atlas index and top-left position, in texture px. */
export interface AtlasFrame {
  atlas: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PackResult {
  /** Size of each atlas in px. Heights are trimmed to the used area. */
  atlases: Array<{ width: number; height: number }>;
  /** One frame per input item, in input order. */
  frames: AtlasFrame[];
}

/** Transparent gap between frames and around the atlas border, in px. Prevents texture bleeding. */
export const ATLAS_PADDING = 2;
/** Normal maximum atlas side, in px (spec §5). */
export const MAX_ATLAS_SIZE = 4096;
/** Maximum atlas side on low-memory devices (`deviceMemory < 4`), in px. */
export const MAX_ATLAS_SIZE_LOW_MEMORY = 2048;

/**
 * Maximum atlas side for a device (spec §5).
 * @param deviceMemory `navigator.deviceMemory` in GiB, or `undefined` (treated as 4).
 */
export function chooseAtlasSize(deviceMemory: number | undefined): number {
  return (deviceMemory ?? 4) < 4 ? MAX_ATLAS_SIZE_LOW_MEMORY : MAX_ATLAS_SIZE;
}

/**
 * Pack items into as few atlases as needed with simple shelf packing.
 *
 * Items are placed tallest first (ties keep input order) on shelves of width `W`,
 * where `W` is chosen so a single atlas comes out roughly square, capped at `maxSize`.
 * When a shelf would pass `maxSize` vertically, a new atlas starts.
 *
 * @param items Sizes in whole px.
 * @param maxSize Maximum atlas width and height, in px.
 * @param padding Gap between frames and at the atlas border, in px.
 * @throws {RangeError} if an item (plus padding) is larger than `maxSize`.
 */
export function packShelves(
  items: readonly PackItem[],
  maxSize: number,
  padding: number = ATLAS_PADDING,
): PackResult {
  if (!Number.isInteger(maxSize) || maxSize <= 0) {
    throw new RangeError(`packShelves: invalid max size ${maxSize}`);
  }
  let totalArea = 0;
  let widest = 0;
  for (const item of items) {
    if (
      !Number.isInteger(item.width) ||
      !Number.isInteger(item.height) ||
      item.width <= 0 ||
      item.height <= 0
    ) {
      throw new RangeError(`packShelves: invalid item ${item.width}×${item.height}`);
    }
    if (item.width + 2 * padding > maxSize || item.height + 2 * padding > maxSize) {
      throw new RangeError(
        `packShelves: item ${item.width}×${item.height} does not fit in ${maxSize}`,
      );
    }
    totalArea += (item.width + padding) * (item.height + padding);
    widest = Math.max(widest, item.width);
  }
  if (items.length === 0) return { atlases: [], frames: [] };

  // Aim for a square-ish single atlas; 10% slack for shelf waste. Round up to 64 px.
  const ideal = Math.ceil(Math.sqrt(totalArea * 1.1) / 64) * 64;
  const atlasWidth = Math.min(maxSize, Math.max(ideal, widest + 2 * padding));

  const order = items.map((_, i) => i).sort((a, b) => items[b]!.height - items[a]!.height || a - b);

  const frames: AtlasFrame[] = new Array<AtlasFrame>(items.length);
  const atlases: PackResult['atlases'] = [];
  let atlas = 0;
  let x = padding;
  let y = padding;
  let shelfHeight = 0;
  let usedWidth = 0; // right edge of the widest shelf, including padding
  let usedHeight = 0; // bottom edge of the lowest frame

  const closeAtlas = () => atlases.push({ width: usedWidth, height: usedHeight + padding });

  for (const index of order) {
    const { width, height } = items[index]!;
    if (x + width + padding > atlasWidth) {
      // Start a new shelf below the current one.
      y += shelfHeight + padding;
      x = padding;
      shelfHeight = 0;
    }
    if (y + height + padding > maxSize) {
      // Start a new atlas.
      closeAtlas();
      atlas++;
      x = padding;
      y = padding;
      shelfHeight = 0;
      usedWidth = 0;
      usedHeight = 0;
    }
    frames[index] = { atlas, x, y, width, height };
    x += width + padding;
    shelfHeight = Math.max(shelfHeight, height);
    usedWidth = Math.max(usedWidth, x);
    usedHeight = Math.max(usedHeight, y + height);
  }
  closeAtlas();

  return { atlases, frames };
}
