/**
 * Dev-only page at `#/debug/shapes` (Milestone 1): draws every piece outline of a
 * sample grid on a 2D canvas so the generated shapes can be inspected.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeGrid,
  flattenPath,
  generatePieceShapes,
  type PathCommand,
  type PieceShape,
} from '../game/geometry';

const PIECE_COUNTS = [12, 24, 48, 96, 150, 300, 500];
const ASPECTS: Record<string, [number, number]> = {
  '4:3 (2048×1536)': [2048, 1536],
  '3:4 (1536×2048)': [1536, 2048],
  '16:9 (2048×1152)': [2048, 1152],
  '1:1 (1600×1600)': [1600, 1600],
  '21:9 (2048×878)': [2048, 878],
};

function toPath2D(commands: readonly PathCommand[]): Path2D {
  const path = new Path2D();
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        path.moveTo(cmd.x, cmd.y);
        break;
      case 'L':
        path.lineTo(cmd.x, cmd.y);
        break;
      case 'C':
        path.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case 'Z':
        path.closePath();
        break;
    }
  }
  return path;
}

function hue(shape: PieceShape): string {
  return `hsl(${(shape.id * 137.508) % 360} 55% 55% / 0.55)`;
}

export default function ShapesDebug() {
  const [count, setCount] = useState(48);
  const [aspect, setAspect] = useState(Object.keys(ASPECTS)[0] ?? '');
  const [seed, setSeed] = useState(12345);
  const [exploded, setExploded] = useState(false);
  const [showBounds, setShowBounds] = useState(false);
  const [showPolygon, setShowPolygon] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [w, h] = ASPECTS[aspect] ?? [2048, 1536];
  const grid = useMemo(() => computeGrid(w, h, count), [w, h, count]);
  const shapes = useMemo(() => generatePieceShapes(grid, seed), [grid, seed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const gap = exploded ? Math.max(grid.pw, grid.ph) * 0.35 : 0;
    const margin = Math.max(grid.pw, grid.ph) * 0.4;
    const worldW = w + gap * (grid.cols - 1) + margin * 2;
    const worldH = h + gap * (grid.rows - 1) + margin * 2;
    const cssW = Math.min(window.innerWidth - 32, 1400);
    const scale = cssW / worldW;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${worldH * scale}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(worldH * scale * dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1e1f24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const shape of shapes) {
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ctx.translate(margin + shape.col * gap, margin + shape.row * gap);
      const lw = 1.5 / scale;

      if (showBounds) {
        const b = shape.bounds;
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = lw;
        ctx.strokeRect(b.x, b.y, b.width, b.height);
      }

      const path = toPath2D(shape.outline);
      ctx.fillStyle = hue(shape);
      ctx.fill(path);
      ctx.strokeStyle = '#f2f2f4';
      ctx.lineWidth = lw;
      ctx.stroke(path);

      if (showPolygon) {
        ctx.fillStyle = '#ff5370';
        const r = 2.5 / scale;
        for (const p of flattenPath(shape.outline)) {
          ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
        }
      }
    }
  }, [shapes, grid, w, h, exploded, showBounds, showPolygon]);

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Debug: piece shapes</h1>
      <p style={{ margin: 0 }}>
        <a href="#/debug/bake" style={{ color: 'inherit' }}>
          Import and bake debug
        </a>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
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
          Image{' '}
          <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
            {Object.keys(ASPECTS).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Seed{' '}
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) >>> 0)}
            style={{ width: 120 }}
          />
        </label>
        <button type="button" onClick={() => setSeed((Math.random() * 2 ** 32) >>> 0)}>
          Random seed
        </button>
        <label>
          <input
            type="checkbox"
            checked={exploded}
            onChange={(e) => setExploded(e.target.checked)}
          />{' '}
          Exploded
        </label>
        <label>
          <input
            type="checkbox"
            checked={showBounds}
            onChange={(e) => setShowBounds(e.target.checked)}
          />{' '}
          Bounds
        </label>
        <label>
          <input
            type="checkbox"
            checked={showPolygon}
            onChange={(e) => setShowPolygon(e.target.checked)}
          />{' '}
          Hit polygon
        </label>
      </div>
      <p style={{ margin: 0, color: 'var(--muted)' }} data-testid="grid-info">
        ~{count} → {grid.rows} × {grid.cols} = {grid.rows * grid.cols} pieces · piece{' '}
        {grid.pw.toFixed(1)} × {grid.ph.toFixed(1)} px · seed {seed}
      </p>
      <canvas ref={canvasRef} data-testid="shapes-canvas" />
    </div>
  );
}
