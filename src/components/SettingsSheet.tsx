/** Settings (spec §1.4, FR-6.1): sound and haptics. */
import { useAppStore } from '../app/store';
import { t } from '../i18n/t';
import { Sheet } from './Sheet';
import styles from './SettingsSheet.module.css';

export function SettingsSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  return (
    <Sheet open={open} title={t('settings.title')} onClose={onClose}>
      <ul className={styles.list}>
        <li>
          <label className={styles.row}>
            <span>{t('settings.sound')}</span>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={settings.sound}
              onChange={(e) => void update({ sound: e.target.checked })}
            />
          </label>
        </li>
        <li>
          <label className={styles.row}>
            <span>
              {t('settings.haptics')}
              <span className={styles.hint}>{t('settings.hapticsHint')}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={settings.haptics}
              onChange={(e) => void update({ haptics: e.target.checked })}
            />
          </label>
        </li>
      </ul>
    </Sheet>
  );
}
