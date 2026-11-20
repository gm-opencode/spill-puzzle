/**
 * Schema migrations, keyed by version (spec §7). Add a `if (oldVersion < N)` block per
 * new version; never edit an old block.
 */
import type { IDBPDatabase } from 'idb';
import type { PicPuzzleSchema } from './db';

export function upgrade(db: IDBPDatabase<PicPuzzleSchema>, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('images', { keyPath: 'id' });
    const puzzles = db.createObjectStore('puzzles', { keyPath: 'id' });
    puzzles.createIndex('updatedAt', 'updatedAt');
    puzzles.createIndex('imageId', 'imageId');
    db.createObjectStore('states', { keyPath: 'puzzleId' });
    db.createObjectStore('settings');
  }
}
