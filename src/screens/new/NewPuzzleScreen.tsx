/** New puzzle (spec §1.2): choose a photo, pick a difficulty, start. */
import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { getStorage, useAppStore } from '../../app/store';
import { Button } from '../../components/Button';
import { PhotoPicker } from '../../components/PhotoPicker';
import { computeGrid } from '../../game/geometry/grid';
import type { PuzzleMeta } from '../../game/model/save';
import { t } from '../../i18n/t';
import { ImageImportError, importImage, type ImportedImage } from '../../image/importImage';
import { isQuotaError, requestPersistentStorage } from '../../storage';
import { DifficultyPicker } from './DifficultyPicker';
import {
  DEFAULT_PRESET,
  difficultyOptions,
  isDesktop,
  randomSeed,
  titleFromFileName,
} from './difficulty';
import styles from './NewPuzzleScreen.module.css';

export function NewPuzzleScreen() {
  const pendingFile = useAppStore((s) => s.pendingFile);
  const setPendingFile = useAppStore((s) => s.setPendingFile);
  const toast = useAppStore((s) => s.toast);
  const [file, setFile] = useState<File | null>(null);
  const [imported, setImported] = useState<ImportedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(DEFAULT_PRESET);
  const options = useMemo(() => difficultyOptions(isDesktop()), []);

  async function load(next: File) {
    setFile(next);
    setImported(null);
    setError(null);
    setBusy(true);
    try {
      setImported(await importImage(next));
    } catch (e) {
      setError(e instanceof ImageImportError ? t(`image.${e.code}`) : t('image.unsupported'));
    } finally {
      setBusy(false);
    }
  }

  // A photo picked on the library screen.
  useEffect(() => {
    if (!pendingFile) return;
    setPendingFile(null);
    void load(pendingFile);
  }, [pendingFile, setPendingFile]);

  useEffect(() => {
    if (!imported) return;
    const url = URL.createObjectURL(imported.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imported]);

  const grid = imported ? computeGrid(imported.width, imported.height, count) : null;

  async function start() {
    if (!imported || !grid) return;
    setBusy(true);
    const storage = getStorage();
    const now = Date.now();
    const imageId = crypto.randomUUID();
    const meta: PuzzleMeta = {
      id: crypto.randomUUID(),
      imageId,
      title: titleFromFileName(file?.name, t('new.defaultTitle')),
      rows: grid.rows,
      cols: grid.cols,
      seed: randomSeed(),
      rotation: false,
      createdAt: now,
      updatedAt: now,
      elapsedMs: 0,
      progress: 0,
      schemaVersion: 1,
    };
    try {
      await storage.images.put({
        id: imageId,
        blob: imported.blob,
        thumbBlob: imported.thumbBlob,
        width: imported.width,
        height: imported.height,
        mime: imported.mime,
        createdAt: now,
      });
      await storage.puzzles.create(meta);
    } catch (e) {
      console.error('Creating the puzzle failed', e);
      setBusy(false);
      toast(isQuotaError(e) ? t('storage.quota') : t('play.loadFailed'), 'error');
      return;
    }
    // FR-4.4: ask once, after the first puzzle is created.
    const { settings, updateSettings } = useAppStore.getState();
    if (storage.persistent && !settings.persistRequested) {
      void requestPersistentStorage();
      void updateSettings({ persistRequested: true });
    }
    navigate({ name: 'play', id: meta.id }, { replace: true });
  }

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Button
          variant="ghost"
          icon="back"
          iconOnly
          aria-label={t('new.back')}
          onClick={() => navigate({ name: 'library' })}
        />
        <h1 className={styles.title}>{t('new.title')}</h1>
      </header>

      {!imported && !busy && (
        <section className={styles.choose}>
          {error && (
            <p className={styles.error} role="alert" data-testid="import-error">
              {error}
            </p>
          )}
          <PhotoPicker variant="primary" icon="image" onPick={(f) => void load(f)}>
            {t('new.choose')}
          </PhotoPicker>
          <p className={styles.hint}>{t('new.chooseHint')}</p>
        </section>
      )}

      {busy && !imported && (
        <p className={styles.hint} role="status">
          {t('new.importing')}
        </p>
      )}

      {imported && grid && (
        <>
          {previewUrl && <img className={styles.preview} src={previewUrl} alt={t('new.preview')} />}
          <DifficultyPicker
            options={options}
            value={count}
            onChange={setCount}
            summary={t('new.grid', {
              rows: grid.rows,
              cols: grid.cols,
              count: grid.rows * grid.cols,
            })}
          />
          <div className={styles.row}>
            <PhotoPicker variant="ghost" onPick={(f) => void load(f)} disabled={busy}>
              {t('new.changePhoto')}
            </PhotoPicker>
            <Button
              variant="primary"
              onClick={() => void start()}
              disabled={busy}
              data-testid="start-puzzle"
            >
              {t('new.start')}
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
