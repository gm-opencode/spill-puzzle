# Decision log

Record any decision that deviates from or clarifies the spec.

| # | Date | Decision | Context | Consequences |
|---|---|---|---|---|
| 1 | 2026-11-20 | Fully client-side app, no backend in the MVP | Privacy, zero hosting cost, offline support | Sync and sharing need a backend later (architecture §7) |
| 2 | 2026-11-20 | Game state stored as groups with a shared puzzle-origin position | Snapping becomes a simple origin-distance check | Pieces in a group can never be misaligned |
| 3 | 2026-11-20 | Piece shapes regenerated from seed rather than stored | Small saves, enables future sharing by seed | The generator must stay deterministic (versioned) |
