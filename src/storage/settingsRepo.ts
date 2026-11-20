import { SETTINGS_KEY, type PicPuzzleDb } from './db';
import { DEFAULT_SETTINGS, type SettingsRepo } from './types';

export function createSettingsRepo(db: PicPuzzleDb): SettingsRepo {
  return {
    async get() {
      return { ...DEFAULT_SETTINGS, ...(await db.get('settings', SETTINGS_KEY)) };
    },
    async put(settings) {
      await db.put('settings', { ...settings }, SETTINGS_KEY);
    },
  };
}
