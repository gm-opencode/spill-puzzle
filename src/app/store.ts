/**
 * App-wide UI state (Zustand), shared by screens (architecture §1).
 * Game state stays in `GameController`; this holds storage, settings and toasts.
 */
import { create } from 'zustand';
import { DEFAULT_SETTINGS, openStorage, type AppSettings, type Storage } from '../storage';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

interface AppStore {
  storage: Storage | null;
  settings: AppSettings;
  toasts: Toast[];
  /** A photo picked on the library screen, handed to the New screen. */
  pendingFile: File | null;
  init(): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  toast(message: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
  setPendingFile(file: File | null): void;
}

let nextToastId = 1;
/** How long a toast stays, in ms. */
export const TOAST_MS = 4500;

export const useAppStore = create<AppStore>((set, get) => ({
  storage: null,
  settings: { ...DEFAULT_SETTINGS },
  toasts: [],
  pendingFile: null,

  async init() {
    if (get().storage) return;
    const storage = await openStorage();
    const settings = await storage.settings.get().catch(() => ({ ...DEFAULT_SETTINGS }));
    set({ storage, settings });
  },

  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await get().storage?.settings.put(settings);
  },

  toast(message, kind = 'info') {
    const id = nextToastId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), TOAST_MS);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  setPendingFile(file) {
    set({ pendingFile: file });
  },
}));

/** The opened storage. Only call after `init()` has resolved (the app shell waits for it). */
export function getStorage(): Storage {
  const storage = useAppStore.getState().storage;
  if (!storage) throw new Error('Storage is not initialised');
  return storage;
}
