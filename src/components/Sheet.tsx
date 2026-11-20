/**
 * Modal sheet on a native `<dialog>`: focus is trapped and Esc closes it (NFR-7).
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from '../i18n/t';
import { Button } from './Button';
import styles from './Sheet.module.css';

interface SheetProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  /** Hide the close (×) button, e.g. for confirmations with their own buttons. */
  hideClose?: boolean;
  role?: 'dialog' | 'alertdialog';
}

export function Sheet({ open, title, onClose, children, hideClose, role }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      role={role}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {!hideClose && (
              <Button
                variant="ghost"
                icon="close"
                iconOnly
                aria-label={t('common.close')}
                onClick={onClose}
              />
            )}
          </div>
          <div className={styles.body}>{children}</div>
        </>
      )}
    </dialog>
  );
}
