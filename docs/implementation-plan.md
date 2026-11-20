# Implementation Plan

Work through the milestones in order. Each milestone ends in a working, committed state with its definition of done (DoD) met. Don't start the next milestone until the current DoD passes.

---

## Milestone 0 — Project setup
- [x] Vite + React + TS (strict) scaffold. ESLint, Prettier, Vitest, Playwright configured.
- [x] Folder structure as in architecture.md §2 (empty modules with TODO exports are fine).
- [x] `npm run dev | build | preview | lint | typecheck | test | test:e2e` scripts.
- [x] GitHub Actions CI running lint, typecheck, unit tests and build.
- [x] `docs/decisions.md` created (ADR-style log).

**DoD:** `npm run build` succeeds, CI is green, and a blank app renders "PicPuzzle".

## Milestone 1 — Geometry core (pure, tested)
- [x] `rng.ts`: seeded mulberry32.
- [x] `grid.ts`: `computeGrid(w, h, N)` (spec §3).
- [x] `edges.ts`: edge parameters and the Bézier edge path, forward and reversed (spec §4.1–4.2).
- [x] `outline.ts`: piece outline and bounds (spec §4.3–4.4).
- [x] `flatten.ts`: Bézier → polygon (spec §4.5).
- [x] A dev-only debug page `#/debug/shapes` that draws all outlines for a sample grid on a 2D canvas.

**Tests:** grid results for several aspect ratios and N values. The same seed gives identical output (snapshot). Neighbouring pieces share exactly the same edge points (reversed). Border edges are straight. Polygon points stay within the piece bounds.
**DoD:** unit tests pass, and the debug page shows clean interlocking shapes.

## Milestone 2 — Image import and baking
- [x] `importImage.ts` (spec §2): decode, EXIF orientation, downscale, WebP/JPEG encode, thumbnail, size validation.
- [x] `bake.worker.ts` + `atlas.ts`: clip, bevel, outline and shelf-pack into atlases (spec §5), with progress events.
- [x] Main-thread fallback when `OffscreenCanvas` is unavailable.

**Tests:** atlas packing (no overlaps, fits the max size), and validation rules. Bake 150 pieces on a mid-range device in < 3 s (manual check, log the timing).
**DoD:** the debug page can load a photo and show the baked atlas.

## Milestone 3 — Game model (pure, tested)
- [x] `types.ts`, `groups.ts`: create initial groups, `move`, `drop` with snap and multi-merge (spec §6.1), and completion detection.
- [x] `scatter.ts` (spec §6.6).
- [x] `progress.ts`.

**Tests:** snapping within and beyond the threshold. No snapping between non-neighbours or with different rotations. Multi-merge on one drop. The merged position follows the largest group. Completion. Scatter places no piece inside the board rect, and is deterministic per seed.
**DoD:** ≥ 90% coverage on `game/model`.

## Milestone 4 — Rendering and input
- [x] `engine.ts`: Pixi app lifecycle (lazy-loaded), resize handling, DPR clamp.
- [x] `pieceSprites.ts`: one container per group, sprites from atlas frames, polygon `hitArea`.
- [x] `input.ts`: drag a group, pan, pinch, wheel zoom, edge auto-pan, tap detection (spec §6.4).
- [x] `camera.ts`: clamped zoom, zoom-to-fit (spec §6.5).
- [x] `effects.ts`: lift on drag, snap animation and highlight, and the dragged-group shadow.
- [x] `GameController.ts` public API (architecture §3).

**DoD:** on the debug route, a photo becomes a playable puzzle that can be completed with mouse and touch. 60 fps with 150 pieces on a phone (check with Chrome remote DevTools).

## Milestone 5 — Screens and persistence
- [x] `storage/*` repos with `idb`. Schema per spec §7.
- [x] Hash router. Library, New puzzle and Play screens (spec §1). Completion overlay.
- [x] Autosave (debounced, on hide and pagehide), timer, resume, delete puzzle, request persistent storage.
- [x] Settings sheet: sound, haptics. Snap sound, haptics, confetti.
- [x] Error handling per spec §11.

**Tests:** repo unit tests with `fake-indexeddb`. E2E: `create-and-solve.spec.ts` uses a 12-piece puzzle. A test-only hook `window.__game.solveAllButOne()` can be used to speed it up; build it only when `import.meta.env.MODE === 'test'`. `resume.spec.ts` reloads mid-game and asserts the same group positions.
**DoD:** MVP acceptance criteria 1–4 (requirements §6) pass.

## Milestone 6 — PWA and polish
- [ ] `vite-plugin-pwa`: manifest, icons (including maskable), precache, update prompt (spec §8).
- [ ] iOS meta tags and the Add to Home Screen hint.
- [ ] Accessibility pass (NFR-7) and responsive pass (NFR-8).
- [ ] Lighthouse: PWA checks pass, Performance ≥ 90.
- [ ] E2E `offline.spec.ts`: load, go offline, reload, open a puzzle and play.
- [ ] Deploy to Cloudflare Pages (or another static host). Add a README section on deploying.

**DoD:** all P0 requirements met. MVP acceptance criterion 5 verified on a real Android and iOS device. **MVP release.**

## Milestone 7 — v1.1 (P1 features), one PR each
1. Rotation mode (FR-2.6, FR-3.10, spec §6.2)
2. Board frame snapping, locking and the ghost image (FR-3.11)
3. Edges-only filter and scatter button (FR-3.12, FR-3.13)
4. Crop step (FR-1.7), drag-drop and paste (FR-1.6)
5. Restart and replay at a different difficulty (FR-4.5, FR-4.6), storage info (FR-4.7)
6. i18n with English + Norwegian Bokmål (FR-6.3, NFR-11), background presets (FR-6.2)
7. Install button (FR-5.4) and Web Share Target (FR-1.8)

---

## Test strategy summary

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | geometry, model, scatter, grid, repos (`fake-indexeddb`), image validation |
| Component | Vitest + Testing Library | DifficultyPicker, PuzzleCard, dialogs |
| E2E | Playwright (Chromium desktop, Pixel 7 emulation, WebKit iPhone emulation) | create → solve, resume, delete, offline, update prompt |
| Manual | Real devices | 60 fps drag, pinch feel, memory on a 300-piece puzzle, install flow on iOS and Android |

Test fixtures: `tests/fixtures/` contains a landscape JPEG with EXIF rotation 6, a portrait PNG, a 300×300 image (too small) and a corrupt file.
