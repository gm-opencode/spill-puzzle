/** Library (spec §1.1, FR-4.2, FR-4.3). */
import { useCallback, useEffect, useState } from 'react';
import { navigate } from '../../app/router';
import { getStorage, useAppStore } from '../../app/store';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PhotoPicker } from '../../components/PhotoPicker';
import { SettingsSheet } from '../../components/SettingsSheet';
import { Sheet } from '../../components/Sheet';
import { t } from '../../i18n/t';
import type { PuzzleMeta } from '../../storage';
import styles from './LibraryScreen.module.css';
import { PuzzleCard } from './PuzzleCard';

interface Entry {
  meta: PuzzleMeta;
  thumb: Blob | undefined;
}

export function LibraryScreen() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<PuzzleMeta | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PuzzleMeta | null>(null);
  const setPendingFile = useAppStore((s) => s.setPendingFile);
  const toast = useAppStore((s) => s.toast);

  const load = useCallback(async () => {
    const storage = getStorage();
    const metas = await storage.puzzles.list();
    const thumbs = await Promise.all(metas.map((m) => storage.images.get(m.imageId)));
    setEntries(metas.map((meta, i) => ({ meta, thumb: thumbs[i]?.thumbBlob })));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = (file: File) => {
    setPendingFile(file);
    navigate({ name: 'new' });
  };

  async function remove(meta: PuzzleMeta) {
    setConfirmDelete(null);
    await getStorage().puzzles.delete(meta.id);
    toast(t('library.deleted'));
    await load();
  }

  const now = Date.now();

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('app.name')}</h1>
        <div className={styles.actions}>
          {entries && entries.length > 0 && (
            <PhotoPicker variant="primary" icon="plus" onPick={pick}>
              {t('library.newPuzzle')}
            </PhotoPicker>
          )}
          <Button
            variant="ghost"
            icon="settings"
            iconOnly
            aria-label={t('library.settings')}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      {entries && entries.length === 0 && (
        <section className={styles.empty} data-testid="empty-state">
          <EmptyIllustration />
          <h2>{t('library.empty.title')}</h2>
          <p>{t('library.empty.body')}</p>
          <PhotoPicker variant="primary" icon="image" onPick={pick}>
            {t('library.empty.cta')}
          </PhotoPicker>
        </section>
      )}

      {entries && entries.length > 0 && (
        <>
          <h2 className="visually-hidden">{t('library.heading')}</h2>
          <ul className={styles.grid}>
            {entries.map(({ meta, thumb }) => (
              <li key={meta.id}>
                <PuzzleCard
                  meta={meta}
                  thumb={thumb}
                  now={now}
                  onOpen={() => navigate({ name: 'play', id: meta.id })}
                  onMore={() => setActionsFor(meta)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={actionsFor !== null}
        title={actionsFor?.title ?? ''}
        onClose={() => setActionsFor(null)}
      >
        <div className={styles.sheetActions}>
          <Button
            variant="danger"
            icon="trash"
            block
            onClick={() => {
              setConfirmDelete(actionsFor);
              setActionsFor(null);
            }}
          >
            {t('library.delete')}
          </Button>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('library.deleteTitle')}
        body={t('library.deleteBody', { title: confirmDelete?.title ?? '' })}
        confirmLabel={t('library.delete')}
        danger
        onConfirm={() => confirmDelete && void remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

/** A few tilted pieces: decorative only. */
function EmptyIllustration() {
  const piece =
    'M10 10h22a7 7 0 1 1 12 0h22v22a7 7 0 1 0 0 12v22H44a7 7 0 1 1-12 0H10V44a7 7 0 1 0 0-12z';
  return (
    <svg width="168" height="120" viewBox="0 0 168 120" aria-hidden="true">
      <path d={piece} fill="#7c9cff" transform="translate(6 30) rotate(-10 38 38)" />
      <path d={piece} fill="#f2b65a" transform="translate(52 8) rotate(6 38 38)" opacity="0.95" />
      <path d={piece} fill="#5fd0a6" transform="translate(92 34) rotate(14 38 38)" opacity="0.9" />
    </svg>
  );
}
