# Architecture

## 1. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript 5 (strict) | Safety for geometry and state code |
| Build | Vite | Fast, first-class PWA plugin |
| UI shell | React 19 | Screens, menus and overlays. Agents know it well. Keep it thin. |
| Rendering | PixiJS v8 (WebGL, Canvas fallback) | Handles hundreds of draggable sprites at 60 fps |
| Styling | CSS Modules + CSS custom properties | No runtime cost |
| State (UI) | Zustand | Tiny. Shared between React and the game engine. |
| Storage | IndexedDB via `idb` | Blobs plus structured data, offline |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest, service worker, update prompt |
| Worker | Native module worker + `OffscreenCanvas`; `comlink` for RPC | Piece baking off the main thread |
| i18n | Small custom `t()` with JSON files (P1) | Avoid heavy libraries |
| Unit tests | Vitest + `fake-indexeddb` | Fast and Vite-native |
| E2E tests | Playwright (Chromium + WebKit, mobile emulation) | Real pointer and touch flows |
| Lint/format | ESLint (typescript-eslint) + Prettier | |
| CI | GitHub Actions: lint → typecheck → unit → build → e2e | |
| Hosting | Cloudflare Pages (or any static host) | Free, HTTPS, global CDN |

No backend. No database server. No LLM API.

## 2. Folder structure

```
/
├─ AGENTS.md, CLAUDE.md, README.md
├─ docs/                     requirements.md, specification.md, architecture.md, implementation-plan.md, decisions.md
├─ public/                   icons/, sounds/, robots.txt
├─ src/
│  ├─ main.tsx               bootstraps React, registers the service worker
│  ├─ app/                   App.tsx, router.ts (hash router), store.ts (Zustand)
│  ├─ screens/
│  │  ├─ library/            LibraryScreen.tsx, PuzzleCard.tsx
│  │  ├─ new/                NewPuzzleScreen.tsx, DifficultyPicker.tsx, CropView.tsx (P1)
│  │  └─ play/               PlayScreen.tsx, Toolbar.tsx, CompletionOverlay.tsx, PreviewOverlay.tsx
│  ├─ components/            Button, Sheet, Toast, ProgressBar, ConfirmDialog …
│  ├─ game/                  ← framework-agnostic. NO React imports here.
│  │  ├─ geometry/           grid.ts, edges.ts, outline.ts, flatten.ts, rng.ts
│  │  ├─ model/              types.ts, groups.ts (merge, snap, rotate), scatter.ts, progress.ts
│  │  ├─ render/             engine.ts (Pixi app lifecycle), camera.ts, input.ts, pieceSprites.ts, effects.ts
│  │  ├─ bake/               bake.worker.ts, bakeClient.ts, atlas.ts
│  │  └─ GameController.ts   public API used by PlayScreen
│  ├─ image/                 importImage.ts (decode, orient, downscale, encode, thumbnail)
│  ├─ storage/               db.ts, puzzlesRepo.ts, imagesRepo.ts, settingsRepo.ts, migrations.ts
│  ├─ audio/                 sfx.ts
│  ├─ i18n/                  t.ts, en.json, nb.json
│  └─ styles/                tokens.css, global.css
├─ tests/
│  ├─ unit/                  mirrors src/game, src/storage, src/image
│  └─ e2e/                   create-and-solve.spec.ts, resume.spec.ts, offline.spec.ts
├─ vite.config.ts, tsconfig.json, playwright.config.ts, .eslintrc.cjs
└─ .github/workflows/ci.yml
```

## 3. Module boundaries

```
React screens ──▶ app/store (Zustand) ◀── GameController ──▶ game/render (Pixi)
      │                                          │
      ▼                                          ▼
  storage/*  ◀──────── save/load ──────────  game/model (pure functions)
      ▲                                          ▲
  image/importImage                          game/geometry (pure functions)
                                                 ▲
                                          game/bake (worker)
```

Rules:
1. **`game/geometry` and `game/model` are pure TypeScript**: no DOM, no Pixi, no React. They are fully unit-tested and deterministic given a seed.
2. **`game/render`** owns Pixi objects. It reads the model and applies changes through model functions. It never stores game truth in sprites.
3. **`GameController`** is the only entry point the UI uses:
   ```ts
   class GameController {
     static async create(canvasHost: HTMLElement, meta: PuzzleMeta, image: Blob, state?: PuzzleState, onProgress?: (p: number) => void): Promise<GameController>;
     zoomToFit(): void; togglePreview(): void; setEdgesOnly(on: boolean): void; scatter(): void;
     getState(): PuzzleState;
     on(event: 'change' | 'snap' | 'complete', cb: (...a: any[]) => void): () => void;
     destroy(): void; // frees all GPU textures and listeners
   }
   ```
4. **React never touches Pixi objects.** Communication goes through controller methods and events.
5. **Storage** is accessed only via the repos in `storage/`. Screens and the controller never call `idb` directly.

## 4. Data flow: create a puzzle

1. NewPuzzleScreen → `importImage(file)` → `{ blob, thumbBlob, width, height }`.
2. `computeGrid(width, height, N)` → rows × cols shown to the user.
3. Start → `imagesRepo.put`, then `puzzlesRepo.create(meta)` with a random 32-bit `seed`.
4. Navigate to `#/play/:id`. PlayScreen loads meta, image and state (none for a new puzzle) and creates a `GameController`.
5. The controller generates outlines from the seed, sends `{imageBitmap, outlines, atlasSize}` to the worker → receives atlases → builds sprites → `initialScatter(seed)` → renders.
6. Each drop → `model.drop()` → `snap`/`complete` events → debounced `puzzlesRepo.saveState()`.

## 5. Data flow: resume

Load meta, image and state → regenerate outlines (deterministic) → bake → apply groups from the saved state → restore the camera → continue the timer from `elapsedMs`.

## 6. Performance notes

- Re-render only when something changes. Pixi's ticker can stay on, but avoid per-frame allocations.
- One `Container` per group. Moving a group moves a single container, not N sprites.
- Texture atlases keep draw calls low (target < 10 draw calls for 300 pieces).
- `hitArea` polygons are created once per piece and shared.
- Use `resolution: Math.min(devicePixelRatio, 2)` for the Pixi renderer.
- Lazy-load Pixi and the game module (`import()`) so the library screen loads fast (NFR-3).

## 7. Future extension points (not in the MVP)

- **Accounts and sync:** add a `SyncAdapter` interface next to the repos. Supabase (Auth + Postgres + Storage) is the suggested backend. The data model already uses uuids and `updatedAt` for last-write-wins.
- **Share a puzzle:** upload the image to object storage (e.g. Cloudflare R2), and share `{imageUrl, rows, cols, seed}`. Determinism makes the receiver's cut identical.
- **AI features:** call through a serverless function (Cloudflare Worker) so API keys never reach the client. For example: generate an image from a prompt, or suggest a title.
- **Leaderboards:** a times-per-seed table in the same backend.
