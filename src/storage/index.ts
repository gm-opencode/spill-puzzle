/**
 * Entry point for storage (AGENTS.md rule 5).
 */
import { openDatabase } from './db';
import { createImagesRepo } from './imagesRepo';
import { createMemoryStorage } from './memoryStorage';
import { createPuzzlesRepo } from './puzzlesRepo';
import { createSettingsRepo } from './settingsRepo';
import type { Storage } from './types';

export * from './types';

/**
 * Open IndexedDB-backed storage, or fall back to memory if IndexedDB is unavailable
 * (spec §11: "Play works without saving").
 */
export async function openStorage(name?: string): Promise<Storage> {
  try {
    const db = await openDatabase(name);
    return {
      persistent: true,
      images: createImagesRepo(db),
      puzzles: createPuzzlesRepo(db),
      settings: createSettingsRepo(db),
    };
  } catch (error) {
    console.warn('IndexedDB unavailable; progress will not be saved.', error);
    return createMemoryStorage();
  }
}

/**
 * Ask the browser to keep our data under storage pressure (FR-4.4).
 * Returns whether storage is persisted; `false` where the API is missing.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
