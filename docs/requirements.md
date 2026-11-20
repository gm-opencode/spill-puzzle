# Requirements

Priorities: **P0** = MVP (must ship), **P1** = v1.1, **P2** = later / out of scope for now.
Each requirement has an ID. Reference IDs in commits and tests (e.g. `feat(FR-3.2): snap groups`).

---

## 1. Product goals

- G1: Any user can turn a personal photo into a playable jigsaw in under 15 seconds.
- G2: Dragging pieces feels smooth and satisfying on a mid-range phone.
- G3: Privacy by design: images and progress are stored only on the user's device.
- G4: Works offline after the first visit and can be installed to the home screen.

## 2. Users and platforms

- Casual players on mobile (primary) and desktop (secondary).
- Supported: latest 2 versions of Chrome/Edge (Android, desktop), Safari (iOS/iPadOS 17+, macOS), and Firefox (desktop).
- Input: touch (including pinch), mouse, trackpad, keyboard shortcuts on desktop.

---

## 3. Functional requirements

### FR-1 Image import
| ID | Pri | Requirement |
|---|---|---|
| FR-1.1 | P0 | User can pick an image from the device via a file picker (`image/*`), including the camera on mobile. |
| FR-1.2 | P0 | Supported formats: JPEG, PNG, WebP, GIF (first frame). HEIC/AVIF are supported where the browser can decode them. Otherwise a clear error is shown. |
| FR-1.3 | P0 | EXIF orientation is respected (photos are never sideways). |
| FR-1.4 | P0 | Large images are downscaled (see spec §2.3) before use and storage. |
| FR-1.5 | P0 | Images smaller than 400 px on the shortest side are rejected with a message. |
| FR-1.6 | P1 | Desktop: drag-and-drop an image onto the app and paste from the clipboard. |
| FR-1.7 | P1 | Optional crop step with aspect presets (Original, 1:1, 4:3, 3:4, 16:9). |
| FR-1.8 | P1 | Web Share Target: the user can share an image from another app (Android) directly into PicPuzzle. |

### FR-2 Puzzle creation
| ID | Pri | Requirement |
|---|---|---|
| FR-2.1 | P0 | User selects a difficulty preset: 12, 24, 48, 96, 150, 300 pieces (desktop also 500). |
| FR-2.2 | P0 | Rows and columns are computed so pieces are as close to square as possible for the image's aspect ratio. The actual piece count is shown (e.g. "~48 → 6×8 = 48"). |
| FR-2.3 | P0 | Pieces have classic jigsaw shapes (tabs and blanks), are deterministic from a seed, and vary slightly so they don't all look identical. |
| FR-2.4 | P0 | Border pieces have flat outer edges. |
| FR-2.5 | P0 | A progress indicator is shown while pieces are generated. Generation must not freeze the UI for more than 100 ms at a time. |
| FR-2.6 | P1 | "Rotation mode" toggle: pieces start at random 0/90/180/270° rotations. |

### FR-3 Gameplay
| ID | Pri | Requirement |
|---|---|---|
| FR-3.1 | P0 | Pieces start scattered around the play area without covering the target board area. |
| FR-3.2 | P0 | User can drag a piece or a connected group with touch or mouse. The dragged group is brought to the front. |
| FR-3.3 | P0 | Hit testing follows the piece's actual shape, not its bounding box. |
| FR-3.4 | P0 | On drop, if a group is close enough to a correctly adjacent piece or group, it snaps into place and merges. Connected pieces then move as one. |
| FR-3.5 | P0 | Snapping gives feedback: a short highlight and an optional subtle sound and haptic (`navigator.vibrate` where available). Sound can be muted. |
| FR-3.6 | P0 | Pan (drag empty space, or two fingers) and zoom (pinch, mouse wheel, +/- buttons) the play area. Zoom is clamped. A "fit to screen" button is provided. |
| FR-3.7 | P0 | A preview of the original image can be toggled. |
| FR-3.8 | P0 | Progress shown as "connected pieces / total" or a percentage, plus an elapsed timer that counts only while the puzzle is visible. |
| FR-3.9 | P0 | Completion is detected when all pieces form one group. A completion screen shows time and piece count and offers "New puzzle" and "Back to library". |
| FR-3.10 | P1 | In rotation mode: tap (no drag) on a piece or group rotates it 90° clockwise. Desktop: right-click or `R` while hovering. |
| FR-3.11 | P1 | Board frame: an outlined target area. A group snaps to the board when correctly positioned, and is then locked. Optional faint "ghost image" on the board. |
| FR-3.12 | P1 | "Edges only" filter that hides non-border pieces temporarily. |
| FR-3.13 | P1 | "Scatter" button that re-spreads loose (single, unlocked) pieces. |
| FR-3.14 | P2 | Undo of the last move. |

### FR-4 Persistence and library
| ID | Pri | Requirement |
|---|---|---|
| FR-4.1 | P0 | Puzzle definition, image and progress are saved in IndexedDB automatically (debounced, and when the app is hidden or closed). |
| FR-4.2 | P0 | Reopening the app shows a library of puzzles with thumbnail, piece count, progress % and last played date. Tapping one resumes exactly where the user left off. |
| FR-4.3 | P0 | User can delete a puzzle (with confirmation). This also deletes its image if no other puzzle uses it. |
| FR-4.4 | P0 | The app requests persistent storage (`navigator.storage.persist()`) after the first puzzle is created. |
| FR-4.5 | P1 | "Restart puzzle" (re-scatter with a new seed for positions, same cut). |
| FR-4.6 | P1 | "Play again with different difficulty" from an existing image. |
| FR-4.7 | P1 | Storage usage is shown in settings, and a warning appears when a quota error occurs. |

### FR-5 PWA
| ID | Pri | Requirement |
|---|---|---|
| FR-5.1 | P0 | Valid web app manifest (name, icons 192/512 + maskable, `display: standalone`, theme colour). |
| FR-5.2 | P0 | A service worker precaches the app shell. The app loads and is fully playable offline after the first visit. |
| FR-5.3 | P0 | When a new version is available, a non-blocking "Update available — reload" prompt is shown. Progress is never lost on update. |
| FR-5.4 | P1 | Custom install prompt button where `beforeinstallprompt` is supported, and an "Add to Home Screen" hint on iOS. |

### FR-6 Settings
| ID | Pri | Requirement |
|---|---|---|
| FR-6.1 | P0 | Sound on/off, haptics on/off. |
| FR-6.2 | P1 | Background colour of the play area (3–4 presets: dark, light, felt green, wood). |
| FR-6.3 | P1 | Language: English (default) and Norwegian Bokmål. Defaults to browser language. |

---

## 4. Non-functional requirements

| ID | Pri | Requirement |
|---|---|---|
| NFR-1 | P0 | **Performance:** 60 fps while dragging with 150 pieces on a mid-range phone (e.g. Pixel 6a / iPhone 12), and with 500 pieces on desktop. |
| NFR-2 | P0 | **Generation time:** 150 pieces ready in < 3 s on a mid-range phone. |
| NFR-3 | P0 | **Load:** first load < 3 s on a fast 4G connection. Initial JS < 350 KB gzipped (including the rendering library). Lighthouse PWA checks pass and Performance ≥ 90. |
| NFR-4 | P0 | **Privacy:** no network requests with user images or game data. No analytics or third-party trackers in the MVP. |
| NFR-5 | P0 | **Reliability:** after a crash or forced close, progress is lost for at most the last 2 seconds of interaction. |
| NFR-6 | P0 | **Memory:** no more than about 300 MB of memory in total on mobile for a 300-piece puzzle. Textures are released when leaving the play screen. |
| NFR-7 | P0 | **Accessibility:** all UI outside the canvas is keyboard accessible, labelled, and meets WCAG 2.1 AA contrast. It respects `prefers-reduced-motion`. Tap targets are ≥ 44×44 px. |
| NFR-8 | P0 | **Responsive:** works from 320 px wide up to 4K. Portrait and landscape are supported, and orientation changes don't lose state. |
| NFR-9 | P0 | **Code quality:** TypeScript strict mode, ESLint + Prettier, no `any` without a comment explaining why. |
| NFR-10 | P0 | **Testability:** pure game logic (geometry, snapping, layout, persistence mapping) has unit tests with ≥ 80% line coverage. Critical flows have end-to-end tests. |
| NFR-11 | P1 | **i18n:** all user-facing strings come from translation files. No hard-coded UI text. |
| NFR-12 | P0 | **Hosting:** the output is a static build deployable to any static host over HTTPS (Cloudflare Pages / Netlify / Vercel / GitHub Pages). |

---

## 5. Out of scope (MVP)

User accounts, cloud sync, multiplayer, sharing puzzles via link, leaderboards, payments and ads, AI/LLM features, native app-store builds.
Note: the architecture should not block adding these later (see architecture.md §7).

## 6. Acceptance criteria (MVP release)

1. On a phone, a user can pick a photo, choose 48 pieces and start playing within 15 seconds.
2. Pieces snap correctly. No false snaps occur between pieces that are not neighbours.
3. Completing the puzzle shows the completion screen with the correct time.
4. Closing the browser mid-game and reopening it (also while offline) resumes the exact layout.
5. The app installs to the home screen on Android Chrome and iOS Safari and runs offline.
6. All P0 unit and end-to-end tests pass in CI.
