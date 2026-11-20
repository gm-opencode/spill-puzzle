/**
 * Dev-only page at `#/debug/bake` (Milestone 2): import a photo, bake its pieces
 * into atlases and show the result.
 */
import { useEffect, useRef, useState } from 'react';
import { bakeAtlases, disposeBakeResult, type BakeOutcome } from '../game/bake/bakeClient';
import { computeGrid, generatePieceShapes, type Grid } from '../game/geometry';
import { ImageImportError, importImage, type ImportedImage } from '../image/importImage';

const PIECE_COUNTS = [12, 24, 48, 96, 150, 300, 500];

interface Baked {
  outcome: BakeOutcome;
  grid: Grid;
  image: ImageBitmap;
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function BakeDebug() {
  const [imported, setImported] = useState<(ImportedImage & { ms: number; name: string }) | null>(
    null,
  );
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(150);
  const [forceMain, setForceMain] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [baked, setBaked] = useState<Baked | null>(null);
  const bakedRef = useRef<Baked | null>(null);

  const replaceBaked = (next: Baked | null) => {
    if (bakedRef.current) {
      disposeBakeResult(bakedRef.current.outcome);
      bakedRef.current.image.close();
    }
    bakedRef.current = next;
    setBaked(next);
  };

  useEffect(() => () => replaceBaked(null), []);
  useEffect(() => () => void (thumbUrl && URL.revokeObjectURL(thumbUrl)), [thumbUrl]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setImported(null);
    replaceBaked(null);
    const t0 = performance.now();
    try {
      const result = await importImage(file);
      const ms = performance.now() - t0;
      console.info(`[debug/bake] import ${file.name}: ${ms.toFixed(0)} ms`, result);
      setImported({ ...result, ms, name: file.name });
      setThumbUrl(URL.createObjectURL(result.thumbBlob));
    } catch (e) {
      setError(e instanceof ImageImportError ? `${e.code}: ${e.message}` : String(e));
    }
  }

  async function bake() {
    if (!imported) return;
    replaceBaked(null);
    setProgress(0);
    try {
      const image = await createImageBitmap(imported.blob);
      const grid = computeGrid(imported.width, imported.height, count);
      const shapes = generatePieceShapes(grid, 1);
      const outcome = await bakeAtlases(image, shapes, {
        forceMainThread: forceMain,
        onProgress: setProgress,
      });
      console.info(
        `[debug/bake] ${shapes.length} pieces baked in ${outcome.durationMs.toFixed(0)} ms (${outcome.mode})`,
      );
      replaceBaked({ outcome, grid, image });
    } catch (e) {
      setError(String(e));
    } finally {
      setProgress(null);
    }
  }

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Debug: import and bake</h1>
      <p style={{ margin: 0 }}>
        <a href="#/debug/shapes" style={{ color: 'inherit' }}>
          Shapes debug
        </a>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <label>
          Photo{' '}
          <input
            type="file"
            accept="image/*"
            data-testid="file-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
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
          <input
            type="checkbox"
            checked={forceMain}
            onChange={(e) => setForceMain(e.target.checked)}
          />{' '}
          Force main-thread fallback
        </label>
        <button
          type="button"
          disabled={!imported || progress !== null}
          onClick={() => void bake()}
          data-testid="bake-button"
        >
          Bake
        </button>
        <label>
          <input
            type="checkbox"
            checked={exploded}
            onChange={(e) => setExploded(e.target.checked)}
          />{' '}
          Exploded
        </label>
      </div>

      {error && (
        <p role="alert" data-testid="import-error" style={{ margin: 0, color: '#ff8a8a' }}>
          {error}
        </p>
      )}

      {imported && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {thumbUrl && <img src={thumbUrl} alt="Thumbnail" data-testid="thumbnail" />}
          <p style={{ margin: 0, color: 'var(--muted)' }} data-testid="import-info">
            {imported.name} → {imported.width}×{imported.height} {imported.mime},{' '}
            {kb(imported.blob.size)} · thumbnail {kb(imported.thumbBlob.size)} · import{' '}
            {imported.ms.toFixed(0)} ms
          </p>
        </div>
      )}

      {progress !== null && (
        <progress value={progress} max={1} data-testid="bake-progress" style={{ width: 300 }} />
      )}

      {baked && <BakedView baked={baked} exploded={exploded} />}
    </div>
  );
}

function BakedView({ baked, exploded }: { baked: Baked; exploded: boolean }) {
  const { outcome, grid } = baked;
  const atlasRefs = useRef<Array<HTMLCanvasElement | null>>([]);
  const assembledRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    outcome.atlases.forEach((bitmap, i) => {
      const canvas = atlasRefs.current[i];
      if (!canvas) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    });
  }, [outcome]);

  // Reassemble the pieces from the atlas at their world positions. A seamless
  // photo means the frames and world offsets are right.
  useEffect(() => {
    const canvas = assembledRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const gap = exploded ? Math.max(grid.pw, grid.ph) * 0.3 : 0;
    const pad = Math.max(grid.pw, grid.ph) * 0.3;
    canvas.width = Math.ceil(grid.width + gap * (grid.cols - 1) + 2 * pad);
    canvas.height = Math.ceil(grid.height + gap * (grid.rows - 1) + 2 * pad);
    ctx.fillStyle = '#1e1f24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    outcome.frames.forEach((f, id) => {
      const atlas = outcome.atlases[f.atlas];
      if (!atlas) return;
      const r = Math.floor(id / grid.cols);
      const c = id % grid.cols;
      ctx.drawImage(
        atlas,
        f.x,
        f.y,
        f.width,
        f.height,
        f.worldX + pad + c * gap,
        f.worldY + pad + r * gap,
        f.width,
        f.height,
      );
    });
  }, [outcome, grid, exploded]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0 }} data-testid="bake-info">
        {grid.rows}×{grid.cols} = {outcome.frames.length} pieces · baked in{' '}
        {outcome.durationMs.toFixed(0)} ms ({outcome.mode}) · {outcome.atlases.length} atlas
        {outcome.atlases.length === 1 ? '' : 'es'}:{' '}
        {outcome.atlases.map((a) => `${a.width}×${a.height}`).join(', ')}
      </p>
      <h2 style={{ margin: 0, fontSize: 16 }}>Reassembled from atlas</h2>
      <canvas
        ref={assembledRef}
        data-testid="assembled-canvas"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <h2 style={{ margin: 0, fontSize: 16 }}>Atlases</h2>
      {outcome.atlases.map((_, i) => (
        <canvas
          key={i}
          ref={(el) => {
            atlasRefs.current[i] = el;
          }}
          data-testid="atlas-canvas"
          style={{
            maxWidth: '100%',
            height: 'auto',
            background: 'repeating-conic-gradient(#3a3b42 0 25%, #2a2b31 0 50%) 0 0 / 24px 24px',
          }}
        />
      ))}
    </div>
  );
}
