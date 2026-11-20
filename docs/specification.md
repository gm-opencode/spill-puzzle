# Functional & Technical Specification

This document describes **how** each requirement in `requirements.md` is implemented. Where something is not specified here, choose the simplest solution that meets the requirement, and note it in `docs/decisions.md`.

---

## 1. Screens and navigation

Hash-based routing (`#/`, `#/new`, `#/play/:puzzleId`), so the app works on any static host and offline without server rewrites.

### 1.1 Library (`#/`)
- Header: app name and a settings icon.
- Primary button: **"New puzzle"**.
- Grid of puzzle cards, sorted by `updatedAt` (newest first). Each card shows a thumbnail, piece count, a progress bar with %, the last played time ("2 h ago"), and a "Completed ✓" badge if done.
- Card actions: tap → resume; overflow menu → Restart (P1), Delete.
- Empty state: an illustration and the text "Turn any photo into a puzzle" with a "Choose a photo" button.

### 1.2 New puzzle (`#/new`)
Step A: **Choose image**. This opens the file picker immediately when coming from the library button. On desktop, a drop zone is also shown (P1).
Step B: **Configure**:
- Image preview, with a crop UI in P1.
- Difficulty chips: 12 / 24 / 48 / 96 / 150 / 300 (/ 500 on desktop, i.e. when `pointer: fine` and the viewport is ≥ 1024 px). Default: 48.
- Under the chips: "6 × 8 = 48 pieces".
- Rotation toggle (P1).
- **"Start puzzle"** button → generation progress overlay → navigates to Play.

### 1.3 Play (`#/play/:id`)
- Full-screen canvas.
- Top bar (auto-hides while dragging on mobile): Back, title or progress ("23 / 48"), timer, menu.
- Floating bottom toolbar: Preview image, Zoom to fit, Edges only (P1), Scatter (P1), Ghost image (P1).
- Menu: Restart, Sound, Haptics, Background (P1).
- Completion overlay: confetti (unless `prefers-reduced-motion`), time, piece count, and buttons "New puzzle" / "Library". The completed image stays visible behind the overlay.

### 1.4 Settings (modal sheet)
Sound, haptics, background colour (P1), language (P1), storage used and "Delete all data" (with confirmation).

---

## 2. Image pipeline

### 2.1 Input
`<input type="file" accept="image/*">`. Do not set `capture`, so the user can choose between camera and gallery.

### 2.2 Decode
```ts
const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
```
- If decoding fails → show "This image format isn't supported on this device. Try a JPEG or PNG."
- Safari < 17 fallback: decode via an `<img>` element and an object URL. Modern browsers apply EXIF orientation to `<img>` automatically.

### 2.3 Normalise
- `maxSide = (navigator.deviceMemory ?? 4) < 4 ? 1600 : 2048`.
- If the longest side is greater than `maxSide`, scale down proportionally using an `OffscreenCanvas` (or a normal canvas) with `imageSmoothingQuality = 'high'`.
- Encode for storage: `canvas.convertToBlob({ type: 'image/webp', quality: 0.9 })`. Fall back to JPEG 0.9 if WebP encoding is not supported (check that the returned blob's `type` matches).
- Create a thumbnail: 320 px on the longest side, WebP 0.8.
- Reject the image if its shortest side is < 400 px (FR-1.5).

### 2.4 Crop (P1)
A crop rectangle in source pixels: `{x, y, w, h}`, stored on the puzzle. It is applied when the source is drawn into piece textures. The stored original image is not modified.

---

## 3. Grid calculation

Given a target count `N` and image aspect ratio `a = w / h`:
```
cols = max(2, round(sqrt(N * a)))
rows = max(2, round(N / cols))
```
Then try `cols ± 1` and `rows ± 1`. Choose the combination that minimises the score:
`|rows*cols - N| / N + |log((w/cols) / (h/rows))|` (count error plus how far the pieces are from square).
Piece size in image pixels: `pw = w / cols`, `ph = h / rows` (floating point).

**World units = image pixels.** The puzzle's top-left corner is at world origin `(0, 0)`, and its board spans `(0, 0)–(w, h)`.

---

## 4. Piece shape generation

### 4.1 Edges
- Horizontal internal edges: `(rows-1) × cols`. Vertical internal edges: `rows × (cols-1)`.
- Each internal edge gets parameters from a seeded PRNG (use mulberry32 with `puzzle.seed`):
  - `dir ∈ {+1, -1}`: which side the tab protrudes to.
  - `center ∈ [0.42, 0.58]`: tab position along the edge.
  - `size ∈ [0.18, 0.24]`: tab size relative to the edge length.
  - `neck ∈ [0.08, 0.11]`: half-width of the neck.
  - `j1, j2 ∈ [-0.03, 0.03]`: small waviness of the shoulders.
- Border edges are straight lines.

### 4.2 Edge curve
Define the edge in a local frame from `(0,0)` to `(1,0)`, with the tab protruding in `-y·dir`. Use the cubic Bézier sequence below (control points are relative to edge length L and scaled by `size`):

1. Shoulder: from `(0,0)` to `(center - neck, j1)`.
2. Neck in: a curve to the tab base, slightly pinched inwards.
3. Tab head: two cubics forming a rounded bulb with radius ≈ `size·0.5`, peaking at `(center, -size·dir)`.
4. Neck out, symmetrical to step 2.
5. Shoulder: to `(1, 0)` with `j2`.

Implement this as `edgePath(params, from, to, reversed): PathCommand[]` in `src/game/geometry/edges.ts`. The same edge is used by both neighbouring pieces: one traverses it forward, the other reversed. This guarantees a perfect fit.
A reference implementation for inspiration is the classic "Draradech jigsaw generator" approach (MIT). Do not copy code without keeping its licence.

### 4.3 Piece outline
For piece `(r, c)`, combine the edges clockwise: top (left→right), right (top→bottom), bottom (right→left), left (bottom→top). The result is a closed `PathCommand[]` in world coordinates.

### 4.4 Piece bounds
`pad = ceil(max(pw, ph) * 0.28)`, which covers the maximum tab protrusion and jitter.
The piece texture covers the rectangle `(c*pw - pad, r*ph - pad, pw + 2pad, ph + 2pad)`.

### 4.5 Hit area
Flatten the outline into a polygon with about 8 segments per Bézier, in piece-local coordinates. Use it as the Pixi `hitArea` (`Polygon`).

---

## 5. Texture baking

Done once per puzzle load, in a **Web Worker** with `OffscreenCanvas` when available. Otherwise it runs on the main thread in chunks via `requestIdleCallback` / `setTimeout(0)` batches of 10 pieces (FR-2.5).

For each piece:
1. Create a canvas the size of the piece bounds (§4.4).
2. `ctx.clip(outlinePath)` and draw the (cropped) source image with an offset, so the right part shows.
3. Bevel for a 3D look: stroke the outline with a 2 px line, light (`rgba(255,255,255,0.35)`) offset by (-1, -1) and dark (`rgba(0,0,0,0.35)`) offset by (1, 1), clipped to the shape.
4. Draw a thin dark outline (`rgba(0,0,0,0.25)`, 1 px).
5. Pack the pieces into texture atlases with a max size of 4096×4096 (2048 if `deviceMemory < 4`), using simple shelf packing. Return `ImageBitmap`s plus frame rectangles.

Main thread: create Pixi `Texture`s from the atlas frames. Report progress (0–100%) to the UI.
On leaving the Play screen: destroy the textures and atlas `ImageBitmap`s (NFR-6).

**Drop shadow:** use a single shared soft-shadow sprite, or a Pixi `DropShadowFilter`, applied only to the group currently being dragged. Never apply a filter to all pieces.

---

## 6. Game state model

The core idea is that **all state is groups**. Every piece always belongs to exactly one group, and a single loose piece is a group of size 1.

Because pieces within a group are always in their correct relative positions, a group is fully described by **where the puzzle origin would be** for that group, plus a rotation.

```ts
type PieceId = number; // index = r * cols + c

interface Group {
  id: number;
  x: number; y: number;      // world position of the puzzle origin (0,0) for this group
  rot: 0 | 1 | 2 | 3;        // quarter turns clockwise (P1; always 0 when rotation is off)
  pieces: PieceId[];
  z: number;                 // draw order; higher is on top
  locked: boolean;           // snapped to the board (P1)
}
```

World position of piece `(r, c)`'s top-left in group `g`:
`p = (g.x, g.y) + rotate((c*pw, r*ph), g.rot)`.

### 6.1 Snapping rule
Two groups A and B **fit** if and only if:
- `A.rot === B.rot`, **and**
- there is at least one pair of grid-adjacent pieces (one in A, one in B), **and**
- `dist((A.x, A.y), (B.x, B.y)) < snapThreshold`, where `snapThreshold = 0.22 * min(pw, ph)` in world units (independent of zoom).

On drop of group D:
1. Collect candidate groups: all groups containing a grid neighbour of any piece in D. Pre-compute the `neighbours(pieceId)` lookup.
2. Find candidates that fit. Merge **all** of them, so one drop can connect several groups.
3. The merged group takes the position of the **largest** group among those merged. If one of them is locked, it takes the locked group's position and stays locked.
4. Animate D into place over 120 ms (no animation with reduced motion), then play the snap feedback (FR-3.5).
5. Check the board snap (P1): if `rot === 0` and `dist((g.x, g.y), (0, 0)) < snapThreshold`, set `x = y = 0`, `locked = true` and z to the bottom layer.
6. If one group now contains all pieces → completion.

Optimisation: for 500 pieces this is O(pieces in D × 4) lookups, so no spatial index is needed for snapping.

### 6.2 Rotation (P1)
A tap (pointer down→up with < 6 px movement and < 250 ms) rotates the group 90° clockwise around the **centre of the tapped piece**. Recompute `(x, y)` so that piece's centre stays fixed in the world. After rotating, run the snap check as if the group had been dropped.
When rotation mode is off, a tap does nothing (it just brings the group to the front).

### 6.3 Z-order
On drag start: `group.z = ++maxZ`. Locked groups always render beneath unlocked groups.
In Pixi, each group is a `Container` holding piece `Sprite`s. Set `sortableChildren` on the world container and use `zIndex = locked ? z - 1e6 : z`.

### 6.4 Drag handling
- Use Pixi's federated pointer events. Track the active pointers.
- **One pointer on a piece** → drag its group. The offset is kept so the piece doesn't jump to the finger.
- **One pointer on empty space** → pan the camera.
- **Two pointers** → pinch-zoom and pan the camera (this cancels any group drag in progress and returns it to its drag-start position, unless it was already moved more than 20 px; in that case drop it where it is).
- Mouse wheel → zoom around the cursor. Ctrl+wheel (trackpad pinch) is treated the same way.
- Locked groups are not draggable. A pointer on them pans the camera.
- While dragging near the screen edge (within 40 px), auto-pan the camera.

### 6.5 Camera
- World container transform: scale `s` and translation `(tx, ty)`.
- `minScale` = fit the whole play area (board plus scatter area) on screen. `maxScale = 4 × fit-to-board scale`.
- "Zoom to fit" animates to fit the board plus the scattered pieces.
- The camera is stored in the save state, so it is restored on resume.

### 6.6 Initial scatter
- Board rectangle B = `(0, 0, w, h)`. Scatter area = B expanded by `max(w, h) * 0.6` on all sides, minus B itself.
- Place pieces in a jittered grid of slots across the scatter area, in random order (seeded). Cell size = `max(pw, ph) * 1.35`.
- If there are more pieces than slots, expand the scatter area by another cell ring and repeat.
- The play area is portrait-friendly: on portrait screens, favour slots above and below the board (weight 2:1).
- In rotation mode, give each group a random `rot`.

### 6.7 Edges-only filter (P1)
Hide (`visible = false`) groups of size 1 whose piece is not on the border. Groups that are hidden are also excluded from snap candidates while the filter is on.

---

## 7. Persistence (IndexedDB)

Use the `idb` library. Database `picpuzzle`, version 1.

| Store | Key | Value |
|---|---|---|
| `images` | `id` (uuid) | `{ id, blob, thumbBlob, width, height, mime, createdAt }` |
| `puzzles` | `id` (uuid) | `PuzzleMeta` (below) |
| `states` | `puzzleId` | `PuzzleState` (below) |
| `settings` | `'app'` | `{ sound, haptics, background, locale }` |

```ts
interface PuzzleMeta {
  id: string; imageId: string; title: string;
  rows: number; cols: number; seed: number;
  crop?: { x: number; y: number; w: number; h: number };
  rotation: boolean;
  createdAt: number; updatedAt: number;
  elapsedMs: number; progress: number; // 0..1 = (pieces - groupCount) / (pieces - 1)
  completedAt?: number;
  schemaVersion: 1;
}

interface PuzzleState {
  puzzleId: string;
  groups: Array<{ id: number; x: number; y: number; rot: number; z: number; locked: boolean; pieces: number[] }>;
  camera: { x: number; y: number; scale: number };
  schemaVersion: 1;
}
```

- Piece shapes are **not** stored. They are regenerated deterministically from `rows`, `cols` and `seed`. The generator's output must therefore be stable across versions. If the generator ever changes, bump a `generatorVersion` field and keep the old code path available.
- **Autosave:** debounced 1000 ms after each drop or rotation. Also save immediately on `visibilitychange → hidden` and `pagehide`. Write `states` and `puzzles` in a single transaction.
- **Timer:** accumulate time only while `document.visibilityState === 'visible'` and the Play screen is mounted.
- **Quota errors:** catch `QuotaExceededError` → show a toast suggesting the user delete old puzzles.
- **Migrations:** handled in `upgrade()` keyed by `schemaVersion`.

---

## 8. PWA

- Use `vite-plugin-pwa` with `registerType: 'prompt'` and Workbox `generateSW`.
- Precache: all build assets, icons and fonts. There are no runtime API caches, since there is no API.
- Manifest: `name: "PicPuzzle"`, `short_name: "PicPuzzle"`, `display: "standalone"`, `orientation: "any"`, `background_color` and `theme_color` matching the dark theme, icons 192/512, and a maskable 512.
- Update flow: when `onNeedRefresh` fires, show a toast "Update available" with a "Reload" button. Before reloading, flush the save.
- **Share Target (P1):** add to the manifest:
  `"share_target": { "action": "/share-target", "method": "POST", "enctype": "multipart/form-data", "params": { "files": [{ "name": "image", "accept": ["image/*"] }] } }`.
  The service worker intercepts the POST, stores the file in a temporary IndexedDB entry or Cache, and redirects to `#/new?shared=1`.
- iOS: add `apple-touch-icon` and `apple-mobile-web-app-capable` meta tags. Show an "Add to Home Screen" hint once, if running in iOS Safari outside standalone mode.

---

## 9. Feedback and audio

- Snap sound: a short click (< 10 KB, OGG + M4A), played through Web Audio. The `AudioContext` is unlocked on the first user gesture.
- Completion: a short chime and confetti (canvas-confetti, about 5 KB, or a small custom version).
- Haptics: `navigator.vibrate(10)` on snap, if haptics are enabled and the API exists (it is not available on iOS; ignore silently).
- Snap highlight: a 200 ms white glow tint on the merged group's pieces.

## 10. Visual design guidelines

- Default dark play area (`#1e1f24`), so most photos stand out. Light UI chrome with a translucent blurred toolbar.
- One accent colour for primary actions. System font stack.
- Pieces sit on the "table" with a subtle shadow. The dragged group lifts (scale 1.02 plus a stronger shadow).
- All animations use ≤ 200 ms ease-out and are disabled under `prefers-reduced-motion`.

## 11. Error handling

| Situation | Behaviour |
|---|---|
| Unsupported image | Inline error on the New screen, with the option to pick another image |
| Image too small | "Choose an image at least 400 px on each side." |
| WebGL unavailable | Pixi falls back to Canvas, or show "Your browser doesn't support graphics acceleration" |
| Out of memory during baking | Retry once with the atlas size halved and `maxSide` at 1200. Then show an error suggesting fewer pieces. |
| IndexedDB unavailable (e.g. some private modes) | Play works without saving. A banner says "Progress can't be saved in this browser mode." |
| Puzzle ID not found | Redirect to the library with a toast |

## 12. Keyboard shortcuts (desktop)

`Space`+drag = pan · `+` / `-` = zoom · `0` = fit · `P` = preview · `E` = edges only · `R` = rotate the hovered group · `Esc` = close an overlay.
