import { Button } from '../../components/Button';
import { t } from '../../i18n/t';
import styles from './Toolbar.module.css';

/** Floating bottom toolbar (spec §1.3). Edges-only, scatter and ghost image are P1. */
export function Toolbar({ onPreview, onFit }: { onPreview(): void; onFit(): void }) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('play.menu')}>
      <Button
        variant="ghost"
        icon="image"
        iconOnly
        aria-label={t('play.preview')}
        title={t('play.preview')}
        onClick={onPreview}
      />
      <Button
        variant="ghost"
        icon="fit"
        iconOnly
        aria-label={t('play.zoomToFit')}
        title={t('play.zoomToFit')}
        onClick={onFit}
      />
    </div>
  );
}
