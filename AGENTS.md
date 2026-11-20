# Agent instructions

You are building **PicPuzzle**, a client-side jigsaw puzzle PWA. Read these before writing code:
- `docs/requirements.md`: what to build (IDs FR-x / NFR-x, priorities P0/P1/P2)
- `docs/specification.md`: how it works (algorithms, data model, edge cases)
- `docs/architecture.md`: stack, folders, module boundaries
- `docs/implementation-plan.md`: milestones. Work on **one milestone at a time**.

## Working rules
1. Implement only the current milestone. Don't build P1/P2 features early.
2. If the spec is unclear or seems wrong, choose the simplest reasonable option, record it in `docs/decisions.md` (date, context, decision, consequences) and mention it in your summary. Don't silently diverge from the spec.
3. Keep `src/game/geometry` and `src/game/model` **pure**: no DOM, Pixi or React imports. Write their tests alongside the code.
4. React never manipulates Pixi objects. Go through `GameController`.
5. All storage access goes through `src/storage/*` repos.
6. No network calls with user data. Don't add analytics, trackers or external CDNs. Bundle everything.
7. Ask before adding a dependency that isn't listed in architecture.md §1, unless it is under 10 KB gzipped and clearly justified in `decisions.md`.
8. Piece generation must stay deterministic for a given `(rows, cols, seed)`. Never change its output without bumping `generatorVersion` (spec §7).

## Commands
```
npm run dev          # local dev server
npm run build        # production build (must pass)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests
npm run test:e2e     # Playwright
```
Before saying a milestone is done, run `lint`, `typecheck`, `test` and `build`. All must pass.

## Code style
- TypeScript strict. No `any` without a comment explaining why. Prefer `type` imports.
- Small, named, exported pure functions in the game core. Use JSDoc on public functions with the units (world px, radians or quarter turns).
- Commit messages: Conventional Commits that reference requirement IDs, e.g. `feat(FR-3.4): multi-group snapping`.
- UI strings go through `t('key')` from milestone 5 onwards, even before translations exist.

## Done means
- The milestone's checklist and DoD in `implementation-plan.md` are met.
- Tests for new logic exist and pass.
- A short summary is given: what was built, decisions taken, known issues, and what to test manually on a device.
