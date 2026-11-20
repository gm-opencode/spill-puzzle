/**
 * Service worker registration and the update prompt (FR-5.2, FR-5.3, spec §8).
 */
import { registerSW } from 'virtual:pwa-register';
import { t } from '../i18n/t';
import { flushAll } from './lifecycle';
import { useAppStore } from './store';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      useAppStore.getState().toast(t('pwa.updateAvailable'), 'info', {
        sticky: true,
        action: {
          label: t('pwa.reload'),
          run: async () => {
            await flushAll();
            await updateSW(true);
          },
        },
      });
    },
    onRegisterError(error: unknown) {
      console.error('Service worker registration failed', error);
    },
  });
}
