import type { PicPuzzleDb } from './db';
import type { ImagesRepo } from './types';

export function createImagesRepo(db: PicPuzzleDb): ImagesRepo {
  return {
    async put(record) {
      await db.put('images', record);
    },
    get: (id) => db.get('images', id),
  };
}
