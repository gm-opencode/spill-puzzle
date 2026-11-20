# PicPuzzle — Photo Jigsaw PWA (working name)

A Progressive Web App that turns any photo the user owns into a jigsaw puzzle and lets them solve it with touch or mouse. Fully client-side: no account, no backend, works offline, and images never leave the device.

## Documentation index

| File | Purpose | Read when |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` | Instructions for AI coding agents (Codex / Claude Code) | Always, first |
| `docs/requirements.md` | What the app must do (functional + non-functional), with IDs and priorities | Before building any feature |
| `docs/specification.md` | How each feature works: screens, algorithms, data model, edge cases | While implementing |
| `docs/architecture.md` | Tech stack, folder structure, module boundaries, data flow | When creating or moving files |
| `docs/implementation-plan.md` | Ordered milestones, tasks, and definition of done, plus the test strategy | To pick the next piece of work |

## Scope summary

- **MVP (P0):** upload an image → choose a piece count → generate jigsaw-shaped pieces → drag, snap and merge → detect completion → autosave and resume → installable, offline PWA.
- **v1.1 (P1):** piece rotation mode, board/frame snapping with ghost image, edge-piece filter, puzzle library management, Norwegian translation, Web Share Target.
- **Later (P2):** accounts, cloud sync, sharing puzzles via link, leaderboards, AI image generation. These are explicitly **out of scope** for the MVP.

## How to use these docs with an agent

1. Copy the contents of this folder into the root of an empty repo (AGENTS.md, CLAUDE.md and README.md at the root, the rest under `docs/`).
2. Prompt: *"Read AGENTS.md, then implement Milestone 1 from docs/implementation-plan.md. Stop when its definition of done is met."*
3. Review the result, then continue milestone by milestone. Smaller steps give much better results than "build the whole app".
