/**
 * Storage records and repository interfaces (spec §7). Screens and the game only
 * talk to these interfaces (AGENTS.md rule 5); `openStorage()` picks IndexedDB or the
 * in-memory fallback.
 */
import type { PuzzleMeta, PuzzleState } from '../game/model/save';

export type { PuzzleMeta, PuzzleState };

export interface ImageRecord {
  id: string;
  blob: Blob;
  thumbBlob: Blob;
  width: number;
  height: number;
  mime: string;
  createdAt: number;
}

export type Background = 'dark' | 'light' | 'felt' | 'wood';

export interface AppSettings {
  sound: boolean;
  haptics: boolean;
  /** P1 (FR-6.2); stored now so the schema doesn't change later. */
  background: Background;
  /** P1 (FR-6.3). */
  locale: string;
  /** `navigator.storage.persist()` has been requested (FR-4.4). */
  persistRequested: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  sound: true,
  haptics: true,
  background: 'dark',
  locale: 'en',
  persistRequested: false,
};

export interface ImagesRepo {
  put(record: ImageRecord): Promise<void>;
  get(id: string): Promise<ImageRecord | undefined>;
}

export interface PuzzlesRepo {
  /** Store a new puzzle definition (its image must already be stored). */
  create(meta: PuzzleMeta): Promise<void>;
  get(id: string): Promise<PuzzleMeta | undefined>;
  /** All puzzles, most recently updated first (spec §1.1). */
  list(): Promise<PuzzleMeta[]>;
  getState(puzzleId: string): Promise<PuzzleState | undefined>;
  /** Write the puzzle meta and its state in one transaction (spec §7 autosave). */
  saveProgress(meta: PuzzleMeta, state: PuzzleState): Promise<void>;
  /**
   * Delete a puzzle and its state, and its image if no other puzzle uses it (FR-4.3).
   * One transaction.
   */
  delete(id: string): Promise<{ imageDeleted: boolean }>;
}

export interface SettingsRepo {
  /** Stored settings merged over {@link DEFAULT_SETTINGS}. */
  get(): Promise<AppSettings>;
  put(settings: AppSettings): Promise<void>;
}

export interface Storage {
  images: ImagesRepo;
  puzzles: PuzzlesRepo;
  settings: SettingsRepo;
  /** False when IndexedDB is unavailable and data lives only in memory (spec §11). */
  persistent: boolean;
}

/** True for the browser's "storage full" errors (spec §7 quota errors). */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error) && !(typeof error === 'object' && error !== null)) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}
