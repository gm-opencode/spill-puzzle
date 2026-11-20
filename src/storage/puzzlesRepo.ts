import type { PicPuzzleDb } from './db';
import type { PuzzlesRepo } from './types';

export function createPuzzlesRepo(db: PicPuzzleDb): PuzzlesRepo {
  return {
    async create(meta) {
      await db.add('puzzles', meta);
    },
    get: (id) => db.get('puzzles', id),
    async list() {
      const all = await db.getAllFromIndex('puzzles', 'updatedAt');
      return all.reverse();
    },
    getState: (puzzleId) => db.get('states', puzzleId),
    async saveProgress(meta, state) {
      const tx = db.transaction(['puzzles', 'states'], 'readwrite');
      await Promise.all([
        tx.objectStore('puzzles').put(meta),
        tx.objectStore('states').put(state),
        tx.done,
      ]);
    },
    async delete(id) {
      const tx = db.transaction(['puzzles', 'states', 'images'], 'readwrite');
      const puzzles = tx.objectStore('puzzles');
      const meta = await puzzles.get(id);
      await puzzles.delete(id);
      await tx.objectStore('states').delete(id);
      let imageDeleted = false;
      if (meta) {
        const users = await puzzles.index('imageId').count(meta.imageId);
        if (users === 0) {
          await tx.objectStore('images').delete(meta.imageId);
          imageDeleted = true;
        }
      }
      await tx.done;
      return { imageDeleted };
    },
  };
}
