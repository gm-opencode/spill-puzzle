import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION } from '../../../src/storage/db';
import { createMemoryStorage } from '../../../src/storage/memoryStorage';
import {
  DEFAULT_SETTINGS,
  isQuotaError,
  openStorage,
  requestPersistentStorage,
  type ImageRecord,
  type PuzzleMeta,
  type PuzzleState,
  type Storage,
} from '../../../src/storage';

function image(id: string): ImageRecord {
  return {
    id,
    blob: new Blob(['img'], { type: 'image/webp' }),
    thumbBlob: new Blob(['thumb'], { type: 'image/webp' }),
    width: 800,
    height: 600,
    mime: 'image/webp',
    createdAt: 1,
  };
}

function meta(id: string, imageId: string, updatedAt: number): PuzzleMeta {
  return {
    id,
    imageId,
    title: `Puzzle ${id}`,
    rows: 3,
    cols: 4,
    seed: 42,
    rotation: false,
    createdAt: 1,
    updatedAt,
    elapsedMs: 0,
    progress: 0,
    schemaVersion: 1,
  };
}

function state(puzzleId: string, x: number): PuzzleState {
  return {
    puzzleId,
    groups: [{ id: 0, x, y: 2, rot: 0, z: 1, locked: false, pieces: [0] }],
    camera: { x: 0, y: 0, scale: 1 },
    schemaVersion: 1,
  };
}

const backends: Array<[string, () => Promise<Storage>]> = [
  ['IndexedDB', () => openStorage(`test-${Math.random()}`)],
  ['memory', async () => createMemoryStorage()],
];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe.each(backends)('storage contract (%s)', (name, open) => {
  it(`reports whether it persists`, async () => {
    expect((await open()).persistent).toBe(name === 'IndexedDB');
  });

  it('stores and reads images, including blobs', async () => {
    const s = await open();
    await s.images.put(image('img1'));
    const back = await s.images.get('img1');
    expect(back?.width).toBe(800);
    expect(await back?.blob.text()).toBe('img');
    expect(await s.images.get('missing')).toBeUndefined();
  });

  it('creates puzzles and lists them newest first', async () => {
    const s = await open();
    await s.images.put(image('img1'));
    await s.puzzles.create(meta('a', 'img1', 10));
    await s.puzzles.create(meta('b', 'img1', 30));
    await s.puzzles.create(meta('c', 'img1', 20));
    expect((await s.puzzles.list()).map((m) => m.id)).toEqual(['b', 'c', 'a']);
    expect((await s.puzzles.get('a'))?.title).toBe('Puzzle a');
    expect(await s.puzzles.get('zzz')).toBeUndefined();
    await expect(s.puzzles.create(meta('a', 'img1', 1))).rejects.toThrow();
  });

  it('saves meta and state together and reorders by updatedAt', async () => {
    const s = await open();
    await s.puzzles.create(meta('a', 'img1', 10));
    await s.puzzles.create(meta('b', 'img1', 20));
    expect(await s.puzzles.getState('a')).toBeUndefined();
    await s.puzzles.saveProgress({ ...meta('a', 'img1', 99), progress: 0.5 }, state('a', 7));
    expect((await s.puzzles.getState('a'))?.groups[0]?.x).toBe(7);
    expect((await s.puzzles.get('a'))?.progress).toBe(0.5);
    expect((await s.puzzles.list())[0]?.id).toBe('a');
  });

  it('returns copies, not live objects', async () => {
    const s = await open();
    const m = meta('a', 'img1', 10);
    await s.puzzles.create(m);
    m.title = 'changed';
    const read = await s.puzzles.get('a');
    expect(read?.title).toBe('Puzzle a');
    read!.title = 'changed again';
    expect((await s.puzzles.get('a'))?.title).toBe('Puzzle a');
  });

  it('deletes a puzzle, its state, and its image only when unused (FR-4.3)', async () => {
    const s = await open();
    await s.images.put(image('shared'));
    await s.images.put(image('solo'));
    await s.puzzles.create(meta('a', 'shared', 1));
    await s.puzzles.create(meta('b', 'shared', 2));
    await s.puzzles.create(meta('c', 'solo', 3));
    await s.puzzles.saveProgress(meta('a', 'shared', 4), state('a', 1));

    expect(await s.puzzles.delete('a')).toEqual({ imageDeleted: false });
    expect(await s.puzzles.get('a')).toBeUndefined();
    expect(await s.puzzles.getState('a')).toBeUndefined();
    expect(await s.images.get('shared')).toBeDefined();

    expect(await s.puzzles.delete('b')).toEqual({ imageDeleted: true });
    expect(await s.images.get('shared')).toBeUndefined();
    expect(await s.puzzles.delete('c')).toEqual({ imageDeleted: true });
    expect(await s.puzzles.delete('missing')).toEqual({ imageDeleted: false });
    expect(await s.puzzles.list()).toEqual([]);
  });

  it('returns default settings, then stored ones', async () => {
    const s = await open();
    expect(await s.settings.get()).toEqual(DEFAULT_SETTINGS);
    await s.settings.put({ ...DEFAULT_SETTINGS, sound: false });
    expect((await s.settings.get()).sound).toBe(false);
  });
});

describe('openStorage', () => {
  it('creates the v1 schema', async () => {
    await openStorage(DB_NAME);
    const db = await openDB(DB_NAME, DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(['images', 'puzzles', 'settings', 'states']);
    const tx = db.transaction('puzzles');
    expect([...tx.store.indexNames].sort()).toEqual(['imageId', 'updatedAt']);
    db.close();
  });

  it('keeps data across reopening', async () => {
    const a = await openStorage('reopen');
    await a.puzzles.create(meta('a', 'img', 1));
    const b = await openStorage('reopen');
    expect((await b.puzzles.get('a'))?.id).toBe('a');
  });

  it('falls back to memory when IndexedDB is missing (spec §11)', async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error -- simulate a browser without IndexedDB
    delete globalThis.indexedDB;
    try {
      const s = await openStorage();
      expect(s.persistent).toBe(false);
      await s.puzzles.create(meta('a', 'img', 1));
      expect((await s.puzzles.list()).length).toBe(1);
    } finally {
      globalThis.indexedDB = saved;
    }
  });
});

describe('helpers', () => {
  it('recognises quota errors', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError('QuotaExceededError')).toBe(false);
  });

  it('requests persistent storage where supported', async () => {
    const nav = globalThis.navigator as { storage?: unknown };
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { ...nav, storage: { persist: async () => true } },
        configurable: true,
      });
      expect(await requestPersistentStorage()).toBe(true);
      Object.defineProperty(globalThis, 'navigator', {
        value: { storage: { persist: async () => Promise.reject(new Error('no')) } },
        configurable: true,
      });
      expect(await requestPersistentStorage()).toBe(false);
      Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
      expect(await requestPersistentStorage()).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'navigator', original);
    }
  });
});
