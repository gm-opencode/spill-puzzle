/**
 * Dev-only page at `#/debug/play` (Milestone 4): turn a photo into a playable puzzle.
 * Exposes `window.__debugPlay` (dev builds only) so E2E tests can locate pieces.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameController, GameProgress } from '../game/GameController';
import { computeGrid, type Grid } from '../game/geometry';
import type { PuzzleMeta, PuzzleState } from '../game/model/save';
import { ImageImportError, importImage, type ImportedImage } from '../image/importImage';

const PIECE_COUNTS = [12, 24, 48, 96, 150, 300, 500];

export interface DebugPlayHandle {
  grid: Pick<Grid, 'rows' | 'cols' | 'pw' | 'ph' | 'width' | 'height'>;
  getState(): PuzzleState;
  getProgress(): GameProgress;
  snaps: number;
  completed: boolean;
}

declare global {
  interface Window {
    __debugPlay?: DebugPlayHandle;
  }
}

function makeMeta(grid: Grid, seed: number): PuzzleMeta {
  const now = Date.now();
  return {
    id: 'debug',
    imageId: 'debug',
    title: 'Debug puzzle',
    rows: grid.rows,
    cols: grid.cols,
    seed,
    rotation: false,
    createdAt: now,
    updatedAt: now,
    elapsedMs: 0,
    progress: 0,
    schemaVersion: 1,
  };
}

export default function PlayDebug() {
  const [image, setImage] = useState<ImportedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(12);
  const [seed, setSeed] = useState(1);
  const [loading, setLoading] = useState<number | null>(null);
  const [progress, setProgress] = useState<GameProgress | null>(null);
  const [snaps, setSnaps] = useState(0);
  const [startMs, setStartMs] = useState<number | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<GameController | null>(null);

  useEffect(() => () => stop(), []);

  function stop() {
    controllerRef.current?.destroy();
    controllerRef.current = null;
    delete window.__debugPlay;
    setProgress(null);
  }

  async function load(file: Blob) {
    setError(null);
    try {
      setImage(await importImage(file));
    } catch (e) {
      setError(e instanceof ImageImportError ? e.message : String(e));
    }
  }

  async function start() {
    const host = hostRef.current;
    if (!image || !host) return;
    stop();
    setSnaps(0);
    setLoading(0);
    try {
      const grid = computeGrid(image.width, image.height, count);
      const t0 = performance.now();
      const { GameController } = await import('../game/GameController');
      const controller = await GameController.create(
        host,
        makeMeta(grid, seed),
        image.blob,
        undefined,
        setLoading,
      );
      console.info(`[debug/play] ready in ${(performance.now() - t0).toFixed(0)} ms`);
      controllerRef.current = controller;
      const handle: DebugPlayHandle = {
        grid,
        getState: () => controller.getState(),
        getProgress: () => controller.getProgress(),
        snaps: 0,
        completed: false,
      };
      window.__debugPlay = handle;
      setProgress(controller.getProgress());
      setStartMs(Date.now());
      controller.on('change', () => setProgress(controller.getProgress()));
      controller.on('snap', () => {
        handle.snaps++;
        setSnaps(handle.snaps);
      });
      controller.on('complete', () => {
        handle.completed = true;
        setProgress(controller.getProgress());
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  const elapsed = startMs && progress?.complete ? ((Date.now() - startMs) / 1000).toFixed(0) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          padding: 8,
          fontSize: 14,
        }}
      >
        <strong>Debug: play</strong>
        <input
          type="file"
          accept="image/*"
          data-testid="file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
          }}
        />
        <button
          type="button"
          data-testid="sample-button"
          onClick={() =>
            void fetch('/tests/fixtures/portrait.png')
              .then((r) => r.blob())
              .then(load)
          }
        >
          Sample image
        </button>
        <label>
          Pieces{' '}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {PIECE_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seed{' '}
          <input
            type="number"
            value={seed}
            style={{ width: 90 }}
            onChange={(e) => setSeed(Number(e.target.value) >>> 0)}
          />
        </label>
        <button
          type="button"
          data-testid="start-button"
          disabled={!image || loading !== null}
          onClick={() => void start()}
        >
          Start
        </button>
        <button
          type="button"
          disabled={!progress}
          onClick={() => controllerRef.current?.zoomToFit()}
        >
          Zoom to fit
        </button>
        <button
          type="button"
          disabled={!progress}
          onClick={() => controllerRef.current?.togglePreview()}
        >
          Preview
        </button>
        {loading !== null && (
          <progress value={loading} max={1} data-testid="load-progress" style={{ width: 120 }} />
        )}
        {progress && (
          <span data-testid="status">
            {progress.complete
              ? `Completed ✓ ${progress.total} pieces${elapsed ? ` in ${elapsed} s` : ''}`
              : `${progress.connected} / ${progress.total} · ${Math.round(progress.fraction * 100)}% · ${snaps} snaps`}
          </span>
        )}
        {error && (
          <span role="alert" style={{ color: '#ff8a8a' }}>
            {error}
          </span>
        )}
      </div>
      <div
        ref={hostRef}
        data-testid="play-host"
        style={{ flex: 1, minHeight: 0, position: 'relative' }}
      />
    </div>
  );
}
