import { useAppStore } from '../app/store';
import { t } from '../i18n/t';
import { Button } from './Button';
import styles from './Toast.module.css';

/** Renders the store's toasts. Announced politely to screen readers. */
export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  return (
    <div className={styles.host} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[styles.toast, toast.kind === 'error' && styles.error]
            .filter(Boolean)
            .join(' ')}
          data-testid="toast"
        >
          <span className={styles.message}>{toast.message}</span>
          <Button
            variant="ghost"
            icon="close"
            iconOnly
            aria-label={t('common.dismiss')}
            onClick={() => dismiss(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
