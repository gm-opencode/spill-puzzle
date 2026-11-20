/**
 * The `picpuzzle` IndexedDB database (spec §7), opened with `idb`.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { upgrade } from './migrations';
import type { AppSettings, ImageRecord, PuzzleMeta, PuzzleState } from './types';

export const DB_NAME = 'picpuzzle';
export const DB_VERSION = 1;
export const SETTINGS_KEY = 'app';

export interface PicPuzzleSchema extends DBSchema {
  images: { key: string; value: ImageRecord };
  puzzles: {
    key: string;
    value: PuzzleMeta;
    indexes: { updatedAt: number; imageId: string };
  };
  states: { key: string; value: PuzzleState };
  settings: { key: string; value: Partial<AppSettings> };
}

export type PicPuzzleDb = IDBPDatabase<PicPuzzleSchema>;

/**
 * Open (and create or migrate) the database.
 * @throws if IndexedDB is missing or refuses to open (e.g. some private modes).
 */
export async function openDatabase(name: string = DB_NAME): Promise<PicPuzzleDb> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
  return openDB<PicPuzzleSchema>(name, DB_VERSION, { upgrade });
}
