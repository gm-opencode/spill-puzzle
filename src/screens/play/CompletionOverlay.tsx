import { useEffect, useRef } from 'react';
import { navigate } from '../../app/router';
import { useAppStore } from '../../app/store';
import { Button } from '../../components/Button';
import { Confetti } from '../../components/Confetti';
import { PhotoPicker } from '../../components/PhotoPicker';
import { formatDuration } from '../../i18n/format';
import { t } from '../../i18n/t';
import styles from './PlayScreen.module.css';

interface CompletionOverlayProps {
  pieces: number;
  elapsedMs: number;
  /** Play the confetti (not when reopening an already completed puzzle). */
  celebrate: boolean;
  /** Save before leaving. */
  beforeLeave(): Promise<void>;
}

/** FR-3.9: time and piece count, "New puzzle" and "Library". The image stays visible behind. */
export function CompletionOverlay({
  pieces,
  elapsedMs,
  celebrate,
  beforeLeave,
}: CompletionOverlayProps) {
  const setPendingFile = useAppStore((s) => s.setPendingFile);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className={styles.overlay} data-testid="completion">
      {celebrate && <Confetti />}
      <section className={styles.panel} role="dialog" aria-labelledby="complete-title">
        <h2 id="complete-title" ref={heading} tabIndex={-1}>
          {t('complete.title')}
        </h2>
        <p data-testid="completion-stats">
          {t('complete.stats', { count: pieces, time: formatDuration(elapsedMs) })}
        </p>
        <PhotoPicker
          variant="primary"
          icon="image"
          block
          onPick={(file) => {
            void beforeLeave().then(() => {
              setPendingFile(file);
              navigate({ name: 'new' });
            });
          }}
        >
          {t('complete.newPuzzle')}
        </PhotoPicker>
        <Button block onClick={() => void beforeLeave().then(() => navigate({ name: 'library' }))}>
          {t('complete.library')}
        </Button>
      </section>
    </div>
  );
}
