/**
 * In-memory storage with the same behaviour as the IndexedDB repos. Used when
 * IndexedDB is unavailable (spec §11): play works, nothing survives a reload.
 */
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type ImageRecord,
  type PuzzleMeta,
  type PuzzleState,
  type Storage,
} from './types';

export function createMemoryStorage(): Storage {
  const images = new Map<string, ImageRecord>();
  const puzzles = new Map<string, PuzzleMeta>();
  const states = new Map<string, PuzzleState>();
  let settings: AppSettings = { ...DEFAULT_SETTINGS };

  return {
    persistent: false,
    images: {
      async put(record) {
        images.set(record.id, { ...record });
      },
      async get(id) {
        const r = images.get(id);
        return r && { ...r };
      },
    },
    puzzles: {
      async create(meta) {
        if (puzzles.has(meta.id)) throw new Error(`Puzzle ${meta.id} already exists`);
        puzzles.set(meta.id, structuredClone(meta));
      },
      async get(id) {
        const m = puzzles.get(id);
        return m && structuredClone(m);
      },
      async list() {
        return [...puzzles.values()]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((m) => structuredClone(m));
      },
      async getState(id) {
        const s = states.get(id);
        return s && structuredClone(s);
      },
      async saveProgress(meta, state) {
        puzzles.set(meta.id, structuredClone(meta));
        states.set(state.puzzleId, structuredClone(state));
      },
      async delete(id) {
        const meta = puzzles.get(id);
        puzzles.delete(id);
        states.delete(id);
        if (!meta) return { imageDeleted: false };
        const used = [...puzzles.values()].some((p) => p.imageId === meta.imageId);
        if (used) return { imageDeleted: false };
        images.delete(meta.imageId);
        return { imageDeleted: true };
      },
    },
    settings: {
      async get() {
        return { ...settings };
      },
      async put(next) {
        settings = { ...next };
      },
    },
  };
}
