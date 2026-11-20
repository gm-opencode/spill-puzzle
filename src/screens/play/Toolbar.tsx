import { Button } from '../../components/Button';
import { t } from '../../i18n/t';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  onPreview(): void;
  onFit(): void;
  onZoomIn(): void;
  onZoomOut(): void;
}

/**
 * Floating bottom toolbar (spec §1.3, FR-3.6, FR-3.7). Edges-only, scatter and ghost
 * image are P1. Shortcuts (spec §12) are shown in the tooltips.
 */
export function Toolbar({ onPreview, onFit, onZoomIn, onZoomOut }: ToolbarProps) {
  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('play.tools')}>
      <Button
        variant="ghost"
        icon="minus"
        iconOnly
        aria-label={t('play.zoomOut')}
        title={`${t('play.zoomOut')} (−)`}
        onClick={onZoomOut}
      />
      <Button
        variant="ghost"
        icon="fit"
        iconOnly
        aria-label={t('play.zoomToFit')}
        title={`${t('play.zoomToFit')} (0)`}
        onClick={onFit}
      />
      <Button
        variant="ghost"
        icon="plus"
        iconOnly
        aria-label={t('play.zoomIn')}
        title={`${t('play.zoomIn')} (+)`}
        onClick={onZoomIn}
      />
      <Button
        variant="ghost"
        icon="image"
        iconOnly
        aria-label={t('play.preview')}
        title={`${t('play.preview')} (P)`}
        onClick={onPreview}
      />
    </div>
  );
}
