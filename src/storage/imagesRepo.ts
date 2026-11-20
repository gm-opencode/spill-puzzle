import type { PicPuzzleDb, StoredImage } from './db';
import type { ImageRecord, ImagesRepo } from './types';

/** Convert to the stored form. Runs before the transaction starts (it awaits Blob reads). */
export async function toStoredImage(record: ImageRecord): Promise<StoredImage> {
  const [data, thumbData] = await Promise.all([
    record.blob.arrayBuffer(),
    record.thumbBlob.arrayBuffer(),
  ]);
  return {
    id: record.id,
    data,
    type: record.blob.type,
    thumbData,
    thumbType: record.thumbBlob.type,
    width: record.width,
    height: record.height,
    mime: record.mime,
    createdAt: record.createdAt,
  };
}

export function fromStoredImage(stored: StoredImage): ImageRecord {
  return {
    id: stored.id,
    blob: new Blob([stored.data], { type: stored.type }),
    thumbBlob: new Blob([stored.thumbData], { type: stored.thumbType }),
    width: stored.width,
    height: stored.height,
    mime: stored.mime,
    createdAt: stored.createdAt,
  };
}

export function createImagesRepo(db: PicPuzzleDb): ImagesRepo {
  return {
    async put(record) {
      await db.put('images', await toStoredImage(record));
    },
    async get(id) {
      const stored = await db.get('images', id);
      return stored && fromStoredImage(stored);
    },
  };
}
