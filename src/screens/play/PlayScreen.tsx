/**
 * Play (spec §1.3): hosts the `GameController`, autosaves (FR-4.1), keeps the timer
 * (FR-3.8), resumes (FR-4.2) and handles load errors (spec §11).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { onFlush } from '../../app/lifecycle';
import { navigate } from '../../app/router';
import { getStorage, useAppStore } from '../../app/store';
import { playChime, playSnap, unlockAudio, vibrate } from '../../audio/sfx';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { SettingsSheet } from '../../components/SettingsSheet';
import type { GameController, GameProgress } from '../../game/GameController';
import type { Grid } from '../../game/geometry/grid';
import type { PuzzleMeta, PuzzleState } from '../../game/model/save';
import { formatDuration } from '../../i18n/format';
import { t, type MessageKey } from '../../i18n/t';
import { isQuotaError } from '../../storage';
import { CompletionOverlay } from './CompletionOverlay';
import styles from './PlayScreen.module.css';
import { Autosave, PlayTimer } from './session';
import { Toolbar } from './Toolbar';

/** Test-only handle (MODE === 'test'), used by the Playwright specs. */
export interface TestGameHandle {
  grid: Pick<Grid, 'rows' | 'cols' | 'pw' | 'ph'>;
  solveAllButOne(): void;
  getState(): PuzzleState;
  getProgress(): GameProgress;
}

declare global {
  interface Window {
    __game?: TestGameHandle;
  }
}

/** Room taken by the top bar and the floating toolbar, in CSS px. */
function chromeInsets() {
  const top = document.querySelector<HTMLElement>('[data-chrome="top"]')?.offsetHeight ?? 56;
  return { top, right: 0, bottom: 72, left: 0 };
}

/** Zoom factor of the +/- buttons and keys. */
const ZOOM_STEP = 1.4;

/**
 * Desktop shortcuts (spec §12): `+`/`-` zoom, `0` fit, `P` preview, `Esc` closes the
 * preview, Space + drag pans. Ignored while typing or while a dialog is open.
 */
function usePlayShortcuts(getController: () => GameController | null) {
  useEffect(() => {
    const ignore = (e: KeyboardEvent) =>
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      document.querySelector('dialog[open]') !== null ||
      (e.target instanceof HTMLElement && e.target.closest('input, select, textarea') !== null);

    const down = (e: KeyboardEvent) => {
      const c = getController();
      if (!c || ignore(e)) return;
      switch (e.key) {
        case '+':
        case '=':
          c.zoomBy(ZOOM_STEP);
          break;
        case '-':
        case '_':
          c.zoomBy(1 / ZOOM_STEP);
          break;
        case '0':
          c.zoomToFit();
          break;
        case 'p':
        case 'P':
          c.togglePreview();
          break;
        case 'Escape':
          if (!c.previewVisible) return;
          c.togglePreview();
          break;
        case ' ':
          // Don't let Space activate a focused button while used for panning.
          if (e.target instanceof HTMLButtonElement) return;
          c.setPanMode(true);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') getController()?.setPanMode(false);
    };
    const blur = () => getController()?.setPanMode(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [getController]);
}

type Phase =
  | { kind: 'loading'; progress: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: MessageKey };

interface Session {
  controller: GameController;
  meta: PuzzleMeta;
  timer: PlayTimer;
  autosave: Autosave;
}

export function PlayScreen({ puzzleId }: { puzzleId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading', progress: 0 });
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState<GameProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [completion, setCompletion] = useState<{ celebrate: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const toast = useAppStore((s) => s.toast);
  usePlayShortcuts(useCallback(() => sessionRef.current?.controller ?? null, []));

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const storage = getStorage();

    const fail = (message: MessageKey) => !cancelled && setPhase({ kind: 'error', message });
    const notFound = () => {
      toast(t('play.notFound'), 'error');
      navigate({ name: 'library' }, { replace: true });
    };

    async function createController(meta: PuzzleMeta, image: Blob, state?: PuzzleState) {
      const host = hostRef.current!;
      const { GameController } = await import('../../game/GameController');
      const { InvalidSaveError } = await import('../../game/model/save');
      const { GraphicsUnavailableError } = await import('../../game/render/engine');
      const { defaultAtlasSize } = await import('../../game/bake/bakeClient');
      const onProgress = (p: number) => !cancelled && setPhase({ kind: 'loading', progress: p });
      let saved = state;
      let maxAtlasSize: number | undefined;
      for (let attempt = 0; ; attempt++) {
        try {
          return await GameController.create(host, meta, image, saved, onProgress, {
            maxAtlasSize,
            insets: chromeInsets(),
          });
        } catch (error) {
          if (error instanceof GraphicsUnavailableError) throw error;
          if (error instanceof InvalidSaveError && saved) {
            console.warn('Saved state is invalid; starting fresh.', error);
            toast(t('play.stateReset'), 'error');
            saved = undefined;
            continue;
          }
          // Spec §11: probably out of memory while baking. Retry once with half the atlas.
          if (attempt === 0) {
            console.warn('Creating the puzzle failed; retrying with smaller atlases.', error);
            maxAtlasSize = Math.floor(defaultAtlasSize() / 2);
            continue;
          }
          throw Object.assign(new Error('bake failed'), { cause: error, bakeFailed: true });
        }
      }
    }

    async function load() {
      const meta = await storage.puzzles.get(puzzleId);
      const image = meta && (await storage.images.get(meta.imageId));
      if (cancelled) return;
      if (!meta || !image) return notFound();
      setTitle(meta.title);
      const state = await storage.puzzles.getState(puzzleId);

      let controller: GameController;
      try {
        controller = await createController(meta, image.blob, state);
      } catch (error) {
        console.error(error);
        const name = (error as { name?: string }).name;
        return fail(
          name === 'GraphicsUnavailableError'
            ? 'play.webgl'
            : (error as { bakeFailed?: boolean }).bakeFailed
              ? 'play.bakeFailed'
              : 'play.loadFailed',
        );
      }
      if (cancelled) {
        controller.destroy();
        return;
      }

      const timer = new PlayTimer(meta.elapsedMs);
      const session: Session = { controller, meta, timer, autosave: null! };
      let quotaWarned = false;
      session.autosave = new Autosave(
        async () => {
          const p = controller.getProgress();
          const now = Date.now();
          session.meta = {
            ...session.meta,
            updatedAt: now,
            elapsedMs: Math.round(timer.elapsedMs),
            progress: p.fraction,
            ...(p.complete && session.meta.completedAt === undefined ? { completedAt: now } : {}),
          };
          await storage.puzzles.saveProgress(session.meta, controller.getState());
        },
        (error) => {
          console.error('Autosave failed', error);
          if (isQuotaError(error) && !quotaWarned) {
            quotaWarned = true;
            toast(t('storage.quota'), 'error');
          }
        },
      );
      sessionRef.current = session;
      cleanups.push(
        onFlush(async () => {
          if (timer.running) session.autosave.markDirty();
          await session.autosave.flush();
        }),
      );

      const initial = controller.getProgress();
      setProgress(initial);
      setElapsed(timer.elapsedMs);
      setPhase({ kind: 'ready' });
      if (initial.complete) {
        setCompletion({ celebrate: false });
      } else if (document.visibilityState === 'visible') {
        timer.start();
      }

      cleanups.push(
        controller.on('change', () => {
          setProgress(controller.getProgress());
          session.autosave.schedule();
        }),
        controller.on('snap', () => {
          const s = useAppStore.getState().settings;
          if (s.sound) playSnap();
          if (s.haptics) vibrate();
        }),
        controller.on('drag', setDragging),
        controller.on('complete', () => {
          timer.pause();
          setElapsed(timer.elapsedMs);
          session.autosave.markDirty();
          void session.autosave.flush();
          if (useAppStore.getState().settings.sound) playChime();
          controller.zoomToFit();
          setCompletion({ celebrate: true });
        }),
      );

      if (import.meta.env.MODE === 'test') {
        window.__game = {
          grid: {
            rows: meta.rows,
            cols: meta.cols,
            pw: image.width / meta.cols,
            ph: image.height / meta.rows,
          },
          solveAllButOne: () => controller.testSolveAllButOne(),
          getState: () => controller.getState(),
          getProgress: () => controller.getProgress(),
        };
        cleanups.push(() => delete window.__game);
      }
    }

    // Timer display, visibility and page lifecycle.
    const tick = setInterval(() => {
      const s = sessionRef.current;
      if (s?.timer.running) setElapsed(s.timer.elapsedMs);
    }, 1000);
    const onVisibility = () => {
      const s = sessionRef.current;
      if (!s) return;
      if (document.visibilityState === 'hidden') {
        if (s.timer.running) {
          s.timer.pause();
          s.autosave.markDirty();
        }
        void s.autosave.flush();
      } else if (!s.controller.getProgress().complete) {
        s.timer.start();
      }
    };
    const onPageHide = () => {
      const s = sessionRef.current;
      if (!s) return;
      s.timer.pause();
      s.autosave.markDirty();
      void s.autosave.flush();
    };
    const onFirstGesture = () => unlockAudio();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pointerdown', onFirstGesture, { once: true });

    void load().catch((error: unknown) => {
      console.error(error);
      fail('play.loadFailed');
    });

    return () => {
      cancelled = true;
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pointerdown', onFirstGesture);
      for (const off of cleanups) off();
      const s = sessionRef.current;
      sessionRef.current = null;
      if (s) {
        if (s.timer.running) s.autosave.markDirty();
        s.timer.pause();
        // The save reads the board synchronously, and getState() only reads plain data,
        // so destroying the controller right after is safe.
        void s.autosave.flush().finally(() => s.autosave.dispose());
        s.controller.destroy();
      }
    };
  }, [puzzleId, toast]);

  /** Save now; used before navigating away. */
  const flush = async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (s.timer.running) s.autosave.markDirty();
    await s.autosave.flush();
  };

  const back = () => void flush().then(() => navigate({ name: 'library' }));

  return (
    <div className={styles.screen}>
      <div ref={hostRef} className={styles.host} data-testid="play-host" />

      <header className={styles.topbar} data-chrome="top" data-dragging={dragging}>
        <Button variant="ghost" icon="back" iconOnly aria-label={t('play.back')} onClick={back} />
        <div className={styles.title}>
          <span className={styles.name}>{title}</span>
          {progress && (
            <span className={styles.stats}>
              <span
                data-testid="play-progress"
                aria-label={t('play.progressLabel', {
                  connected: progress.connected,
                  total: progress.total,
                })}
              >
                {t('play.progress', { connected: progress.connected, total: progress.total })}
              </span>
              {' · '}
              <span aria-label={t('play.timer')} data-testid="play-timer">
                {formatDuration(elapsed)}
              </span>
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          icon="more"
          iconOnly
          aria-label={t('play.menu')}
          onClick={() => setMenuOpen(true)}
        />
      </header>

      {phase.kind === 'ready' && !completion && (
        <Toolbar
          onPreview={() => sessionRef.current?.controller.togglePreview()}
          onFit={() => sessionRef.current?.controller.zoomToFit()}
          onZoomIn={() => sessionRef.current?.controller.zoomBy(ZOOM_STEP)}
          onZoomOut={() => sessionRef.current?.controller.zoomBy(1 / ZOOM_STEP)}
        />
      )}

      {phase.kind === 'loading' && (
        <div className={styles.overlay}>
          <div className={styles.panel} role="status">
            <p>{t('play.generating')}</p>
            <ProgressBar value={phase.progress} label={t('play.generating')} />
          </div>
        </div>
      )}

      {phase.kind === 'error' && (
        <div className={styles.overlay}>
          <div className={styles.panel} role="alert" data-testid="play-error">
            <p>{t(phase.message)}</p>
            <Button variant="primary" onClick={() => navigate({ name: 'library' })}>
              {t('play.back')}
            </Button>
          </div>
        </div>
      )}

      {completion && progress && (
        <CompletionOverlay
          pieces={progress.total}
          elapsedMs={elapsed}
          celebrate={completion.celebrate}
          beforeLeave={flush}
        />
      )}

      <SettingsSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  );
}
