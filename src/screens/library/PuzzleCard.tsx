import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { formatRelative } from '../../i18n/format';
import { t } from '../../i18n/t';
import type { PuzzleMeta } from '../../storage';
import styles from './PuzzleCard.module.css';

interface PuzzleCardProps {
  meta: PuzzleMeta;
  thumb: Blob | undefined;
  now: number;
  onOpen(): void;
  onMore(): void;
}

/** Library card (spec §1.1): thumbnail, pieces, progress, last played, completed badge. */
export function PuzzleCard({ meta, thumb, now, onOpen, onMore }: PuzzleCardProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!thumb) return;
    const u = URL.createObjectURL(thumb);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [thumb]);

  const percent = Math.round(meta.progress * 100);
  const when = formatRelative(meta.updatedAt, now) ?? t('library.justNow');

  return (
    <article className={styles.card} data-testid="puzzle-card">
      <button
        type="button"
        className={styles.open}
        onClick={onOpen}
        aria-label={t('library.open', { title: meta.title })}
      >
        {url ? <img className={styles.thumb} src={url} alt="" /> : <div className={styles.thumb} />}
        <div className={styles.info}>
          <span className={styles.name}>{meta.title}</span>
          <span className={styles.meta}>
            <span>{t('library.pieces', { count: meta.rows * meta.cols })}</span>
            <span>{t('library.percent', { percent })}</span>
          </span>
          <ProgressBar value={meta.progress} label={t('library.progressLabel', { percent })} />
          <span className={styles.meta}>{t('library.lastPlayed', { when })}</span>
        </div>
      </button>
      {meta.completedAt !== undefined && (
        <span className={styles.badge} data-testid="completed-badge">
          {t('library.completed')}
        </span>
      )}
      <Button
        className={styles.more}
        variant="ghost"
        icon="more"
        iconOnly
        aria-label={t('library.more', { title: meta.title })}
        onClick={onMore}
      />
    </article>
  );
}
