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

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev          # http://localhost:5173 (add -- --host to open it on a phone on the same network)
npm run lint && npm run typecheck && npm run test:coverage && npm run build
npm run test:e2e     # Playwright: Chromium, Pixel 7, WebKit iPhone, plus the offline/PWA project
```

Dev-only debug pages: `#/debug/shapes`, `#/debug/bake`, `#/debug/play`.

## Deploying

The app is a static site: `npm run build` writes everything to `dist/`, including the service
worker (`sw.js`) and the web app manifest. It must be served over HTTPS (or `localhost`) for the
service worker and installation to work. No server code or rewrites are needed (hash routing).

### Cloudflare Pages (recommended)

1. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, and pick this
   repository.
2. Build command: `npm run build`. Build output directory: `dist`. Environment variable:
   `NODE_VERSION=22`.
3. Deploy. `public/_headers` is copied to `dist/` and makes Cloudflare revalidate `sw.js`,
   `index.html` and the manifest on every load, while hashed assets are cached for a year.

Or from a terminal with [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

```bash
npm run build
npx wrangler pages deploy dist --project-name picpuzzle
```

### Netlify

Build command `npm run build`, publish directory `dist`. `_headers` works as on Cloudflare.

### GitHub Pages

Pages serves the site under `/<repository>/`, so build with that base path:

```bash
BASE_PATH=/spill-puzzle/ npm run build
```

Then publish `dist/` (for example with the `actions/upload-pages-artifact` and
`actions/deploy-pages` actions, after enabling Pages with "GitHub Actions" as the source in the
repository settings). GitHub Pages ignores `_headers`; that's fine, because browsers check the
service worker for updates without using the HTTP cache.

### After deploying

- Open the site once online, then reload: it now works offline (FR-5.2).
- Android Chrome offers "Install app"; on iOS Safari use Share → Add to Home Screen (the app shows
  this hint once).
- When a new version is deployed, open pages show an "Update available — Reload" toast; reloading
  saves the current game first (FR-5.3).

## How to use these docs with an agent

1. Copy the contents of this folder into the root of an empty repo (AGENTS.md, CLAUDE.md and README.md at the root, the rest under `docs/`).
2. Prompt: *"Read AGENTS.md, then implement Milestone 1 from docs/implementation-plan.md. Stop when its definition of done is met."*
3. Review the result, then continue milestone by milestone. Smaller steps give much better results than "build the whole app".
