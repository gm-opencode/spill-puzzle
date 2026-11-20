/**
 * The `picpuzzle` IndexedDB database (spec §7), opened with `idb`.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { upgrade } from './migrations';
import type { AppSettings, PuzzleMeta, PuzzleState } from './types';

export const DB_NAME = 'picpuzzle';
export const DB_VERSION = 1;
export const SETTINGS_KEY = 'app';

/**
 * How an image is stored: bytes as `ArrayBuffer`s rather than `Blob`s, because WebKit
 * refuses to store Blobs in IndexedDB in private/ephemeral sessions (decision #42).
 */
export interface StoredImage {
  id: string;
  data: ArrayBuffer;
  type: string;
  thumbData: ArrayBuffer;
  thumbType: string;
  width: number;
  height: number;
  mime: string;
  createdAt: number;
}

export interface PicPuzzleSchema extends DBSchema {
  images: { key: string; value: StoredImage };
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
