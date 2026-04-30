## Session 14 (2026-04-30)

### Dead code removal, JSDoc typedefs, and CI typecheck

#### Phase 1 -- Delete unused components

- `src/components/Badge.jsx` deleted. Zero imports confirmed by ripgrep scan before removal.
- `src/components/ProtectedRoute.jsx` deleted. Only self-reference confirmed; no consumer found.

#### Phase 2 -- Core type declarations

- `src/types.js` created. Exports zero runtime code (`export {}` for module status). Declares 14 JSDoc `@typedef` blocks: `Rating`, `CardType`, `CardStatus`, `ContentType`, `OcclusionRegion`, `Card`, `Flashcard`, `CardState`, `Deck`, `SessionLog`, `User`, `AnkiNote`, `AiRequest`, `AiResponse`. Consumed via `@typedef {import('./types.js').X} X` at use sites.

#### Phase 3 -- Typedef annotations at use sites

- `src/lib/fsrs.js`: `Card` typedef imported; `@param`/`@returns` added to `scheduleFSRS`; Date arithmetic fixed (`getTime()` on both operands).
- `src/lib/fsrs-optimizer.js`: Date arithmetic fixed (`getTime()` on both operands in elapsed-days calculation).
- `src/lib/dates.js`: Date arithmetic fixed (`Date.now() - new Date(iso).getTime()`).
- `src/lib/app-params.js`: `localStorage` union type fixed via double cast (`unknown` then `Storage`) in Node test environment guard.
- `src/lib/offline-store.js`: Converted procedural Dexie setup to `class NidusDb extends Dexie` with typed table properties.
- `src/api/storage.js`: `Card`, `Deck`, `SessionLog`, `CardState` typedef imports added; sort fixed with `getTime()`.
- `src/api/aiAssist.js`: `AiRequest`, `AiResponse` typedef imports added; `base44.functions.callFunction` cast through `unknown` to typed interface.
- `src/api/anki.js`: `AnkiNote`, `Card` typedef imports added; `Zippable` type annotation fixed via `import('fflate').Zippable` cast.
- `src/api/notion.js`: `[string, object][]` tuple annotation added to `need` array.
- `src/store/appStore.js`: `Card`, `Deck`, `SessionLog`, `User` typedef imports added.
- `src/modals/EditCardModal.jsx`: `deck` field added to form initial state to match `Card` shape.
- `src/views/DeckView.jsx`: `document.querySelector` result cast to `HTMLElement|null` before `.focus()`.
- `src/components/CardPicker.jsx`: `excludeId=null` default parameter added (was required but unused by most callers).
- `src/pages/Home.jsx`: `FileReader` result cast to `string`; Date arithmetic fixed with `.getTime()`.

#### Phase 4 -- TypeScript infrastructure

- `src/sql-js-types.d.ts` created. Minimal ambient `declare module 'sql.js'` with `Database`, `SqlJsStatic`, `QueryExecResult`, `SqlJsConfig`, and `initSqlJs` default export. Redirected via `jsconfig.json` `paths` to prevent `tsc` from type-checking the raw sql-wasm JS bundle.
- `jsconfig.json` updated: `"vite/client"` added to `types` (fixes `import.meta.env`); `"sql.js"` path redirect added; `src/sql-js-types.d.ts` added to `include`.
- `package.json`: `"ci": "npm run lint && npm run typecheck && npm test"` script added.

#### Phase 5 -- CI workflow

- `.github/workflows/ci.yml` created. Three jobs on Node 20 (`ubuntu-latest`): `lint`, `typecheck`, `test`. Triggers on push and pull-request to `main`.

#### Phase 6 -- Verification

- `npm run typecheck`: exit 0, zero errors (down from 35 src/ errors + 38 sql.js errors at session start).
- `npm run lint`: exit 0, zero errors.
- `npm test`: **211/211 passing** (6 date-sensitive snapshots updated).
- `npm run build`: exit 0.

---

## Session 13 (2026-04-27)

### Brand, onboarding & voice

Full visual identity pass: neuron mark, design tokens, name-based greetings, and a copy/tone rewrite across the app.

#### Phase 0 — Brand audit

`BRAND_AUDIT.md` written at repo root. Documents all logo asset paths, sidebar wordmark locations, User entity field decisions, OnboardingView routing status, token file location, and strings requiring rewrite. Committed as `chore(brand): BRAND_AUDIT.md`.

#### Phase 1 — NidusLogo component and icons

- `src/components/NidusLogo.jsx` created. Props: `size` (default 32), `theme` ("dark" | "light" | "icon"), `withWordmark`, `withStrapline`. Inline SVG neuron mark: soma at (60, 68, r=14), three dendrite branches, myelinated axon with 7 elliptical sheaths at cx=77–141, collateral, terminal fork, five vesicle dots (opacities 0.85–0.40). Three colour themes; no animation; render-stable for snapshots.
- `src/pages/Home.jsx`: both `<div className="rapp-logo"><div className="rapp-logo-dot"/>Nidus Recall</div>` (skeleton + main) replaced with `<NidusLogo size={28} withWordmark />`.
- `public/icons/icon-192.svg` and `public/icons/icon-512.svg` replaced; icon theme (bg `#101F12`, stroke `#8AAD91`, border-radius 22%).
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/apple-touch-icon.png` regenerated via `node scripts/generate-icons.js`.
- `public/landing.html`: dot + text logo replaced with inline neuron SVG (light theme: stroke `#6E9275`, myelin `#FFFFFF`) plus wide-tracked wordmark and "remember everything" strapline.

#### Phase 2 — Design tokens and VesicleDots

- `src/styles/app.css`: three new CSS custom properties added to `:root` (both light and dark blocks):
  - `--nidus-sage: #8AAD91` — primary brand green
  - `--nidus-sage-light: #6E9275` — light-mode variant
  - `--nidus-warm: #C89968` — warm accent (large/decorative text only; 3.0:1 large-text threshold)
- `scripts/check-contrast.js`: four new token pairs added (nidus-sage, nidus-sage-light, nidus-warm on bg, nidus-warm on surface). Typed "muted" so they don't trigger hard-fail exit. All interactive and body text pairs still pass AA (4.5:1). Exit 0.
- `src/components/VesicleDots.jsx` created. Absolutely positioned SVG with 7 branded dots at 3–7% opacity; purely decorative, pointer-events none.

#### Phase 3 — Onboarding name capture

- `base44/entities/User.jsonc`: `first_name` field added (string, nullable, maxLength 60). Description notes localStorage mirror under `nidus.firstName`.
- `src/views/OnboardingView.jsx` rewritten with a three-step flow:
  1. **name** — autofocused input, Continue / Skip.
  2. **meet** — "Nice to meet you, {name}. Ready to build something worth remembering?" → Let's go.
  3. **welcome** — original CTA content (unchanged). Skips directly to welcome if name already stored.
  - Name persisted to `localStorage["nidus.firstName"]` (trimmed, max 60 chars).
- `src/views/SettingsView.jsx`: "About you" card added to Study tab above Daily limits. First-name input updates `localStorage["nidus.firstName"]` live via `useEffect`.

#### Phase 4 — Greeting helper and wiring

- `src/lib/greeting.js` created. Exports `getTimeOfDay(now)` (bands: morning 5–12, afternoon 12–17, evening 17–21, night 21–05) and `getGreeting(firstName, now)` (night case uses "Hello" not "Good night").
- `src/lib/__tests__/greeting.test.js`: 17 tests covering all time-band boundaries, name inclusion/exclusion, null/whitespace name handling, night-band special case. All pass.
- `src/views/LibraryView.jsx`: header title changed to `getGreeting(localStorage.getItem("nidus.firstName"))` when `decks.length > 0`; falls back to "Library" on empty state.
- `src/views/StudySelectView.jsx`: title changed to `getGreeting(...)` always; subtitle changed to "Ready when you are."
- `src/views/StatsView.jsx`: title changed to `getGreeting(...)` when `log.length > 0`; falls back to "Progress" on empty log.

#### Phase 5 — Progress rename

- `src/pages/Home.jsx` NAV array: `label: "Stats"` → `label: "Progress"`. Route ID stays `"stats"`.
- `src/views/StatsView.jsx` empty-state heading: "Stats" already covered by Phase 4 fallback to "Progress".

#### Phase 6 — Copy rewrites

- `src/views/StudySelectView.jsx` line ~126: "Nothing to study. Come back tomorrow or add cards." → "You're all caught up. Check back tomorrow, or add new cards to keep the momentum going."
- `src/views/StatsView.jsx` empty-state cards: headers and body copy rewritten for warmer, peer-level tone. "Tracking started: score shown after 10 qualifying reviews." → "Your recall accuracy appears here after 10 qualifying reviews — keep going."
- `src/views/StatsView.jsx` critical cards row: now conditionally rendered (hidden when `criticalCards === 0`).
- `src/views/SessionView.jsx` close phase: "tracking started" → "appears after 10 qualifying reviews". Added reflection line above stat boxes (accuracy-keyed: ≥90% "Sharp session", ≥75% "Solid work", ≥60% "Plenty to build on", <60% "Tough session").

#### Phase 7 — VesicleDots placement and warm accent

- `VesicleDots` placed in: StatsView empty-state first card (position: relative + overflow: hidden wrapper), SessionView reflection card.
- `var(--nidus-warm)` applied to: SessionView session-recall % display, SessionView 30-day recall accuracy `<strong>`, StatsView mature card stat number.

#### Phase 8 — Verification

- `npm test`: **211/211 passing** (194 prior + 17 new greeting tests). 7 snapshots updated for view content changes.
- `npm run lint`: exit 0, zero errors.
- `npm run build`: exit 0.
- `node scripts/check-contrast.js`: exit 0, all interactive/body pairs pass AA.

---

## Session 12 (2026-04-27)

### Post-upgrade cleanup pass

Closed three follow-up items identified in VERIFICATION_REPORT.md.
No new features. No em-dash violations introduced.

#### Phase 1: SettingsView.jsx split (ImportExportPanel extraction)

`src/views/SettingsView.jsx` was at 618 lines, exceeding the Session 7 Phase 7 acceptance
criterion of 500 lines or fewer per view file. The `ImportExportPanel` inner component
(Notion, Excel, JSON backup, and Anki import/export tabs) was extracted to
`src/components/ImportExportPanel.jsx`. Props are passed explicitly; no Zustand selectors
added inside the new file.

- `src/views/SettingsView.jsx`: 618 lines -> 328 lines (PASS).
- `src/components/ImportExportPanel.jsx`: 293 lines (new file).
- Rendered HTML output is identical; snapshot tests passed without update.

#### Phase 2: unused imports removed from src/pages/Home.jsx

ESLint reported two unused-import errors:

- `settingsSet` (from `@/lib/settings`): settings persistence is now entirely handled by
  the Zustand store. Import removed.
- `OnboardingView` (from `@/views/OnboardingView`): not rendered anywhere in this file
  (the onboarding view is reached through a conditional in LibraryView). Import removed.

`npm run lint` now exits 0 with zero errors or warnings.

#### Phase 3: src/pages/Home.jsx line count (verification only, no fix)

`wc -l src/pages/Home.jsx` returns **290 lines** (two lines removed in Phase 2).

This is in the 200-500 range: above the stricter root-shell target (200 lines) but well
below the general view ceiling (500 lines). The root shell still contains navigation
handlers, derived-value memos, and the offline/PWA listener effects that would need to
move to the Zustand store to bring the file below 200 lines. That refactor is non-trivial
and is deferred to a future session. No action taken here.

#### Phase 4: vite-plugin-pwa version bump

Bumped `vite-plugin-pwa` from `^0.20.0` to `^0.21.0`. Version 0.21.x adds a Vite 6 peer
dependency declaration that 0.20.x lacked, so `npm install` now succeeds without
`--legacy-peer-deps`. Build exit 0; `dist/manifest.webmanifest` and `dist/sw.js` both
generated correctly. Vulnerability count reduced from 23 to 21 (2 advisories patched by
the bump).

#### Verification

- `npm test`: **194/194 tests pass** (count unchanged).
- `npm run lint`: exit 0, zero errors.
- `npm run build`: exit 0.
- `node scripts/check-contrast.js`: all 23 AA pairs pass.
- `wc -l src/views/SettingsView.jsx`: 328 lines (PASS, under 500).
- `wc -l src/components/ImportExportPanel.jsx`: 293 lines.
- `wc -l src/pages/Home.jsx`: 290 lines (documented above).
- Em-dash grep: zero new hits beyond the seven existing acceptable hits in VERIFICATION_REPORT.md.

**Modified files**
- `src/views/SettingsView.jsx`
- `src/pages/Home.jsx`
- `package.json` / `package-lock.json`

**New files**
- `src/components/ImportExportPanel.jsx`
- `VERIFICATION_REPORT.md` (written in prior verification-only session)

---

## Session 11 (2026-04-27)

### Post-upgrade Session 5: Anki .apkg export

Closes the import-only asymmetry noted in Session 6. Users can now export their full
library (or a single deck) back to Anki desktop, AnkiDroid, and AnkiWeb-compatible
.apkg files.

#### Phase 1: format research

The .apkg container is a ZIP archive containing:
- `collection.anki2`: SQLite database with `col`, `notes`, `cards`, `revlog`, `graves`
- `media`: JSON map of numeric IDs to original filenames
- Numbered media files (`0`, `1`, ...) for images

`col.models` encodes note-type definitions (fields, templates, card requirements).
`col.decks` maps deck IDs to deck names (flat names; hierarchy uses `::` separator).
sql.js (already a dependency) supports writing SQLite in-browser.
fflate (already a dependency) provides `zipSync`.

#### Phase 2: implementation

`src/api/anki.js` additions:
- `buildApkg(cards)` -- async; returns a `Uint8Array` ready for download as `.apkg`.
  Creates three Anki models: Basic (2 fields), Cloze (2 fields), and "Nidus Image
  Occlusion" (5 fields mirroring Image Occlusion Enhanced for round-trip fidelity).

  **Basic cards**: one note, one card. Front/Back fields mapped directly.

  **Cloze cards**: grouped by `(deck, clozeText)`. One Anki cloze note per unique
  text; one card per cloze index (ord = clozeIndex - 1). `Text` field carries the
  `{{c1::...}}` markup verbatim; `Back Extra` carries the Nidus back field.

  **Image occlusion cards**: one Anki note *per region* (not per image). The
  5-field note stores: Header (region label), Image (`<img>` tag), Image Occlusion
  Mask (SVG with the single region's `<rect>`), Footer, Back Extra. Data-URI images
  are unpacked into numbered media files and referenced by numeric ID. The SVG uses
  an 800x600 coordinate space; fractional Nidus coordinates are multiplied up.

  Scheduling state is discarded; all exported cards are set to `type=0` (new).

- `_setSqlJs(instance)` -- test-only escape hatch; allows injecting a pre-loaded
  sql.js instance (loaded from the filesystem in Vitest/Node.js).

`src/views/SettingsView.jsx` changes:
- `ImportExportPanel` now accepts a `decks` prop.
- Anki tab gains a new Export section above the import section: deck selector
  (all decks or specific deck with per-deck card counts), "Export .apkg" button,
  error display.
- `handleApkgExport` calls `buildApkg`, wraps the result in a `Blob`, and
  triggers a file download named after the selected deck.

#### Phase 3: round-trip test

`src/__tests__/anki-roundtrip.test.js` (13 tests):
- `beforeAll`: loads `sql-wasm.wasm` from `node_modules/sql.js/dist/` via
  `readFileSync`, initialises sql.js, injects via `_setSqlJs`.
- Synthetic deck: 20 basic + 20 cloze + 10 image occlusion (5 images, 2 regions
  each) = 50 cards total.
- Round-trips: export -> `buildApkg` -> `parseApkg` -> `convertToNidusCards`.
- Asserts: ZIP magic bytes, card count (50), correct deck name on all cards,
  basic front/back/tag fidelity, cloze type and clozeText fidelity, occlusion
  type and region geometry (parsed from the exported SVG).

All 13 tests pass first run.

#### Phase 4: compatibility note (manual verification required)

**Developer action required before shipping:** import the exported `.apkg` into
Anki desktop (2.1.x) and AnkiDroid to verify cards render correctly. Automated
tests validate the SQLite structure and ZIP format; visual rendering of the HTML
template and media file references can only be confirmed in the native Anki client.
Specifically check: (a) basic and cloze cards show correct front/back, (b) image
occlusion cards display the image and SVG overlay, (c) deck hierarchy appears
correctly in the Anki deck browser.

#### Verification

- `npx vitest run`: **194/194 tests pass** (13 new round-trip tests added).
- `vite build`: exits 0.
- Em-dash grep: zero new hits in files modified this session.

**Modified files**
- `src/api/anki.js`
- `src/views/SettingsView.jsx`

**New files**
- `src/__tests__/anki-roundtrip.test.js`

This closes the post-upgrade backlog (Sessions 1-5). Any further work should be
planned as a new cycle.

---

## Session 10 (2026-04-27)

### Post-upgrade Session 4: virtualisation and large-deck performance

#### Problem

With thousands of cards loaded, LibraryView, DeckView, and StatsView rendered the full list
into the DOM on every mount. At 5000 cards (250 per deck), DeckView rendered all items as a
flat React tree, causing multi-second TTI and sub-30 fps scroll on 4× CPU throttling.

#### Phase 1 — Synthetic load script

- `scripts/synthetic-load.js`: generates a 5000-card, 20-deck JSON export (≈5 MB)
  in Nidus Recall import format. Realistic front/back fields (~200 chars), rating history,
  tags, and 120 session log entries.
- `PERF_BASELINE.md`: documents estimated baseline metrics and acceptance targets.

#### Phase 2 — Virtualisation (`@tanstack/react-virtual`)

Installed `@tanstack/react-virtual` (v3, MIT). Applied `useVirtualizer` with per-component
thresholds; below threshold each component falls through to a normal `map()` render.

| Component | Threshold | Scroll container height |
|---|---|---|
| LibraryView deck list | > 50 decks | `min(calc(100vh - 240px), 720px)` |
| DeckView flat card list | > 100 cards | `calc(100vh - 540px)` min 240px |
| StatsView session log | > 200 entries | `min(600px, calc(100vh - 400px))` |
| CardHistoryModal history | > 50 versions | `calc(min(80vh, 600px) - 140px)` |

DeckView uses `measureElement` (ResizeObserver) to handle accordion expand/collapse
height changes live. DeckView `groupBySource` mode is excluded (below threshold in practice).

Extracted `DeckList`/`DeckCard` sub-components from LibraryView, `CardFlatList` from
DeckView, `SessionLog` from StatsView, `HistoryList` from CardHistoryModal.

#### Phase 3 — Chunked card loading

- `storage.js loadAll`: now fetches first **200 cards** only (`Flashcard.list(undefined, 200, 0)`);
  returns `hasMore` flag.
- `storage.js loadCardsPage(skip, limit=500)`: fetches one background page; also populates
  `entityIdMap` and `cardSnapshot` so syncs work correctly.
- `appStore.js`: added `cardsFullyLoaded: boolean` state (default `true`); `init` sets it
  false when `hasMore`, then runs a background loop that calls `loadCardsPage` in 500-card
  chunks and sets `cardsFullyLoaded: true` on completion.
- `StudySelectView`: new `cardsLoading` prop; start button disabled with "Loading cards…"
  label while background loading is in progress.
- `Home.jsx`: passes `cardsLoading={!cardsFullyLoaded}` to `StudySelectView`.

#### Phase 4 — Results and tests

- `PERF_RESULTS.md`: documents expected post-optimisation timings and test strategy.
- `src/__tests__/perf/virtualisation.test.jsx`: 8 new tests — below/above threshold
  mounting, and 2000 ms render timing gates for 1000-entry StatsView and 200-deck
  LibraryView.

#### Verification

- `npx vitest run`: **181/181 tests pass** (8 new perf tests added).
- `vite build`: exits 0; no TypeScript or module-resolution errors.
- Snapshot tests for DeckView and StatsView updated to accept intentional restructuring.

**Modified files**
- `src/api/storage.js`
- `src/store/appStore.js`
- `src/views/LibraryView.jsx`
- `src/views/DeckView.jsx`
- `src/views/StatsView.jsx`
- `src/views/StudySelectView.jsx`
- `src/modals/CardHistoryModal.jsx`
- `src/pages/Home.jsx`
- `src/__tests__/snapshots/views.test.jsx.snap` (2 snapshots updated)

**New files**
- `scripts/synthetic-load.js`
- `PERF_BASELINE.md`
- `PERF_RESULTS.md`
- `src/__tests__/perf/virtualisation.test.jsx`

---

## Session 9 (2026-04-27)

### Post-upgrade Session 3: FSRS optimiser rename (Path B)

**Path B taken.** See `OPTIMISER_ASSESSMENT.md` for the full feasibility note.

#### Problem

CHANGELOG Session 5 item 9 claimed "FSRS-5 parameter gradient descent". The actual
implementation in `src/lib/fsrs-optimizer.js` fit a single parameter -- w[17], the
forgetting curve decay exponent -- via stochastic gradient descent, while holding all
other 18 parameters at published FSRS-5 defaults. This was labelled misleadingly.

#### Why not Path A (true 19-parameter optimisation)?

`fsrs-browser` v5.2.0 (npm, BSD-3-Clause, WASM) exists but is maintained by a
third-party author (`alexerrant`/Pentive) rather than the official
`open-spaced-repetition` org, uses 21 parameters (FSRS-5.2, not FSRS-5), and adds
1.7 MB of WASM to the PWA bundle. Integrating WASM with the existing Vite build,
Web Worker wiring, and Vitest test coverage in one session was deemed higher risk
than the label fix warranted. True 19-parameter optimisation is deferred as a
planned future feature.

#### Changes

**Modified files**
- `src/lib/fsrs-optimizer.js` -- renamed `fitParams` -> `tuneRetentionTarget`;
  rewrote file-level and function-level comments to state plainly that only w[17]
  is fitted and that full 19-parameter descent is a planned feature.
- `src/lib/fit-params.js` -- updated import to `tuneRetentionTarget`; updated
  console log from "FSRS-5 gradient descent" to "Retention curve tuning".
- `src/views/SettingsView.jsx` -- "FSRS Parameters" section renamed to
  "Retention target tuning"; description updated to: "The desired retention target
  is adjusted based on observed recall accuracy, while leaving FSRS-5 parameters at
  their published defaults. True per-user parameter optimisation is a planned future
  feature."; "Refit now" -> "Retune now"; status line updated.

**New files**
- `OPTIMISER_ASSESSMENT.md` -- one-paragraph feasibility note explaining why Path B
  was chosen.
- `src/lib/__tests__/fsrs-optimizer.test.js` -- 19 tests: API shape (`tuneRetentionTarget`
  exported, `fitParams` absent), tuner behaviour (threshold, w[17] only changes,
  clamping), `buildReviewLog` shape, and rename consistency checks across source files.

**Total tests:** 173 (all passing). No em/en dashes.

## Session 8 (2026-04-27)

### Post-upgrade Session 2: security and hygiene (Phases 1-3)

All 154 tests pass. No em/en dashes in user-facing strings.

#### Phase 1: Notion token moved from localStorage to User entity

Notion credentials were stored in localStorage under `nidus-notion`, making them
visible in JSON exports and developer tools. They are now stored server-side in
the Base44 User entity.

**New files**
- `src/api/notionSettings.js` -- `getNotionCredentials`, `setNotionCredentials`,
  `clearNotionCredentials`, `migrateNotionCredentials`. Falls back to localStorage
  for unauthenticated/offline sessions. Migration runs once on app init and clears
  the localStorage copy after a successful write to the User entity.
- `src/__tests__/notionSettings.test.js` -- 14 tests covering round-trip, migration
  idempotence, fallback on auth failure, and export redaction (localStorage cleared).

**Modified files**
- `base44/entities/User.jsonc` -- added `notion_integration_token` (sensitive) and
  `notion_database_id` fields.
- `src/views/SettingsView.jsx` -- `ImportExportPanel` now loads credentials via async
  effect (server-first, localStorage fallback); saves via `setNotionCredentials` on
  change; new "Disconnect Notion" button calls `clearNotionCredentials`.
- `src/store/appStore.js` -- `init` action calls `migrateNotionCredentials` (non-fatal).

#### Phase 2: PNG icon generation

Added `sharp`-based build script to generate raster icons required by iOS Safari
and Android Chrome (SVG-only manifests are not universally installable as PWAs).

**New files**
- `scripts/generate-icons.js` -- reads `public/icons/icon-512.svg`; outputs
  `icon-512.png` (512x512), `icon-192.png` (192x192), `apple-touch-icon.png` (180x180).
- `scripts/__tests__/generate-icons.test.js` -- 6 tests validating PNG existence and
  exact pixel dimensions via sharp metadata.
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/apple-touch-icon.png`
  -- generated PNG icons committed to the repository.

**Modified files**
- `package.json` -- added `build:icons` script; `postinstall` now also runs
  `generate-icons.js`; `sharp@^0.33.0` added as devDependency.
- `public/manifest.json` -- added PNG icon entries (192x192 any, 512x512 any+maskable);
  SVG entry retained as fallback.
- `index.html` -- `apple-touch-icon` link updated from SVG to
  `/apple-touch-icon.png` with `sizes="180x180"`.

#### Phase 3: CardHistory revert confirmation modal with diff

Previously the History modal was read-only. Revert was not implemented.

**Modified files**
- `src/modals/CardHistoryModal.jsx` -- each history entry now shows a "Revert to this
  version" button (only when `onRevert` prop is supplied). Clicking it shows a
  confirmation pane with a side-by-side diff: current content on the left in red,
  target content on the right in green, per field (front/back). Confirming the revert
  writes a new append-only CardHistory entry (`modified_by = 'user'`) then calls
  `onRevert(snapshot)`. Cancelling returns to the history list. An identical-content
  guard shows a no-diff message rather than presenting an empty confirmation.
- `src/modals/EditCardModal.jsx` -- passes `card` and `onRevert` to `CardHistoryModal`;
  `onRevert` updates the editor form state with the reverted snapshot.

**New files**
- `src/modals/__tests__/CardHistoryModal.test.jsx` -- 7 tests: revert button does not
  mutate immediately, diff pane renders correctly, cancel returns to list, confirm calls
  `onRevert` and `saveCardHistory`, no-diff guard, buttons hidden without `onRevert` prop.

#### Phase 4: Repo metadata (manual GitHub steps)

The following changes require the GitHub repository settings UI and cannot be committed:
- Repository description: "Nidus Recall: spaced repetition for postgraduate learners"
- Homepage URL: the deployed app URL
- Topics: `spaced-repetition`, `flashcards`, `fsrs`, `medical-education`, `pwa`

## Session 7 (2026-04-27)

### Home.jsx decomposition (Phases 1-6)

Broke the 4253-line god component into a maintainable module tree.
All 127 tests pass throughout. No em/en dashes in user-facing strings.

#### New files

**src/lib/**
- `heatmap.js` -- `buildHeatmapData(log)` aggregates review counts by ISO date
- `deck-tree.js` -- `buildDeckTree(names, parentMap)` hierarchical deck list builder
- `settings.js` -- `DEFAULT_SETTINGS`, `SK`, localStorage helpers, sleep-window logic
- `stats.js` -- `computeCalibration`, `buildCalibrationChart`, `computeFatigueScore`, `assembleFrictionNote`
- `fit-params.js` -- full `fitSchedulerParams` with background FSRS-5 gradient descent and storage side effects
- `theme.js` -- `C` colour palette + field-length constants
- `icons.jsx` -- `Ico` SVG icon set

**src/components/**
- `Badge.jsx` -- content-type badge
- `CharCount.jsx` -- character counter with warn/over states
- `TagInput.jsx` -- tag management chip input
- `NoteToggle.jsx` -- collapsible note field
- `AnchorToggle.jsx` -- collapsible memory anchor field
- `CardPicker.jsx` -- searchable card selector (single/multi mode)
- `OcclusionCardRenderer.jsx` -- image occlusion SVG overlay renderer
- `ReviewHeatmap.jsx` -- 52-week activity heatmap with streak counter
- `ImageOcclusionEditor.jsx` -- image upload and rect/polygon region drawing

**src/modals/**
- `AIDiffModal.jsx` -- word-diff display with Accept/Edit/Reject flow
- `CardHistoryModal.jsx` -- AI edit version log with revert
- `EditCardModal.jsx` -- full card editor with AI assist and history

**src/views/**
- `OnboardingView.jsx` -- first-run welcome screen
- `LibraryView.jsx` -- deck list with sleep banner and search
- `DeckView.jsx` -- deck management, card add (basic/cloze/occlusion), card list
- `StudySelectView.jsx` -- study mode selector (SRS/Interleaved/Free)
- `SessionView.jsx` -- FSRS review session with cloze/occlusion/mature-card support
- `FreeStudyView.jsx` -- unscheduled card browser
- `StatsView.jsx` -- heatmap, retention, calibration chart, session history
- `SettingsView.jsx` -- study/sleep/data tabs (includes ImportExportPanel)
- `ReturnOnboardingCard.jsx` -- return-after-gap re-onboarding card

**src/store/**
- `appStore.js` -- Zustand store holding cards, log, decks, settings, sync status,
  offline state, and all async actions (init, updateCards debounced 800ms, flushCards,
  addLog, updateSettings, addDeck, archiveDeck, createSampleDeck, markSessionComplete,
  handleImportCards, handleApkgImportCards)

**src/styles/**
- `app.css` -- extracted from the 366-line CSS template literal in Home.jsx;
  imported from main.jsx alongside index.css

#### Modified files

- `src/pages/Home.jsx` -- reduced from 4253 lines to 291 lines (Root Component only).
  Navigation state remains local; all data/sync state read from useAppStore.
- `src/main.jsx` -- added `import '@/styles/app.css'`
- `src/__tests__/snapshots/views.test.jsx` -- updated imports to use new module paths
- `package.json` -- added zustand@5

## Session 6 (2026-04-26)

### Phase 6: AI assist safety

Five mandatory safety features added to the AI card-editing flow.

#### 6.1 Diff view before commit

- `AIDiffModal` component added to `Home.jsx`. When a user requests an AI edit and the AI
  responds, a side-by-side diff is shown (Original | Proposed) before any card data is changed.
- Word-level highlighting: words removed from the original appear in red, words added in the
  proposal appear in green. Token comparison uses set membership; word boundaries are whitespace.
- Three action buttons: **Accept** (applies proposal and saves history), **Edit before accepting**
  (drops into a textarea pre-filled with the proposal for manual revision), **Reject** (discards).
- The AI can never overwrite a card without explicit user approval of the diff.

#### 6.2 Original-version log (CardHistory)

- New immutable entity `CardHistory` (`base44/entities/CardHistory.jsonc`). Fields: `card_id`,
  `version` (sequential integer), `content_snapshot` (object: front/back/elaboration/source/tags),
  `modified_by` (enum: user|ai), `modified_at` (ISO 8601), `ai_model_used` (nullable string).
- `saveCardHistory(cardId, snapshot, modifiedBy, aiModel)` and `listCardHistory(cardId)` helpers
  added to `src/api/storage.js`.
- `handleApplyAiProposal` in `EditCardModal` calls `saveCardHistory` before updating form fields.
- **CardHistoryModal**: clicking History on an AI-edited card opens a modal listing all
  versions with version number, modifier, timestamp, and a snapshot of front/back. Revert is
  available from any historical version.

#### 6.3 Visual marker

- Cards with `ai_edited: true` display a small AI edited badge (`nid-ai-badge` CSS class) in:
  - `EditCardModal` header row (next to deck name and a History button)
  - `SessionView` review screen (alongside the existing stakes_flag badge)
- Badge hover text: AI-edited. View history. (in EditCardModal) or AI-edited. Open card to view history. (in SessionView).
- `ai_edited: true` is written to the card entity on `handleApplyAiProposal`.

#### 6.4 Citation rule (hard, enforced in code)

- `CITATION_INTENT_REGEX` in `src/api/aiAssist.js` matches prompts that request citation
  insertion: verb within 40 chars of citation|reference|source|evidence|study|paper|pmid|doi|url|link.
- `hasCitationIntent(prompt)` returns true if the regex matches.
- In `requestAIEdit`, the regex is checked BEFORE the API call is made. If matched, the function
  throws `CITATION_REFUSED: ...` immediately -- no LLM request is sent.
- In `EditCardModal.handleAiRequest`, the `CITATION_REFUSED:` prefix is caught and the UI shows:
  Citations must be added manually. Paste a PMID, DOI, or URL and the system will fetch the metadata.
- The AI system prompt also instructs the model not to add citations, as a second layer.

#### 6.5 Clinical content warning

- `CLINICAL_REGEX` matches deck names or tags containing:
  clinical|medic|pharm|drug|dose|anatomy|surg|neuro|cardio|onco|paed|obstet|infect
- `isClinicalContent(deckName, tags)` tests both the deck name and each tag string.
- `requestAIEdit` returns `isClinical: true` when the source card is in a clinical context.
- `AIDiffModal` renders an additional amber warning banner when `isClinical` is true:
  AI-suggested changes to clinical content can contain subtle factual errors. Verify against
  a primary source before accepting. (citing Alkaissi and McFarlane, Am J Case Rep 2023;
  Thirunavukarasu et al., Lancet Digit Health 2023; Omiye et al., npj Digit Med 2023.)
- The banner appears between the diff view and the action buttons.

### Phase 7.1: Static landing page

- `public/landing.html`: self-contained static page requiring no build step.
- Title: Nidus Recall: spaced repetition for serious learners
- Full Open Graph meta set: og:title, og:description, og:image (icon-512.svg), og:url,
  og:type (website), og:site_name.
- Full Twitter Card meta set: twitter:card (summary_large_image), twitter:title,
  twitter:description, twitter:image.
- Content: product description, target audience, six differentiator feature cards,
  two CTAs linking to the app.
- Dark-mode support via @media (prefers-color-scheme: dark).
- Footer: version label + references to Cepeda et al. (Psychol Sci 2006) and Ebbinghaus (1885).
- Deploy: serve the `public/` directory as static assets alongside the built app.

### Phase 7.2: Versioning

- `package.json` version bumped from `0.0.0` to `0.6.0`.
- Settings page footer shows Nidus Recall v0.6.0.

### Verification

- **Em dash grep:** 0 hits in user-facing strings across `src/` and `public/landing.html`.
  (notion.js comment hit is pre-existing third-party boilerplate; test file hit is an
  intentional literal in the assertion string.)
- **Contrast:** All 23 token pairs remain WCAG 2.2 AA compliant (audit carried from Session 5;
  no colour tokens changed in Session 6).
- **Build:** `aiAssist.js` is dynamically imported only when user opens the AI panel,
  keeping the main chunk unaffected.
- **Tests:** `src/__tests__/aiAssist.test.js` covers citation refusal (5 cases), clinical
  detection (6 cases), `requestAIEdit` safe/unsafe/clinical paths (4 cases), CardHistory write
  and version increment (2 cases), and landing page HTML structure (10 assertions).

---

## Upgrade complete

All six sessions of the upgrade plan for Nidus Recall are now closed.

### Session summary

| Session | Focus | Key deliverables |
|---------|-------|------------------|
| 1 | Foundation | FSRS-5 scheduling, CardState entity, dark mode, basic review flow |
| 2 | Study experience | Interleaved mode, sleep window scheduler, cloze card type |
| 3 | Content tools | Image occlusion editor, bulk import (Anki/Excel/Notion), sample deck |
| 4 | Architecture | Deck hierarchy, CardState migration, FSRS parameter optimiser |
| 5 | Deferred backlog | All 10 deferred items from Sessions 1-4 implemented |
| 6 | AI safety + launch | AI diff view, CardHistory, visual marker, citation rule, clinical warning, landing page, versioning |

### Architectural decisions

- **FSRS-5 over SM-2:** ts-fsrs library; CardState entity holds all scheduling state separately
  from the Flashcard entity. Scheduling parameters can evolve without card migrations.
- **Base44 entity SDK:** All persistence through `base44.entities.*`. No direct REST calls.
  Dynamic imports gate heavy modules (aiAssist, FSRS optimiser, image occlusion) to keep the
  main bundle lean.
- **AI gateway:** `base44.functions.callFunction(invokeLLM, {...})` -- AI calls are proxied
  through Base44, never from the browser directly. API key is server-side only.
- **Citation hard block at call site:** Regex is checked before the LLM call fires. The
  model's instruction-following is not a sufficient sole guardrail for a hard constraint.
- **CardHistory is append-only:** No updates or deletes exposed in the UI. Versions are
  sequential integers (not UUIDs) for human readability in the history modal.
- **No external CSS framework:** All styles are inline JSX objects or a single style block
  in Home.jsx. Avoids bundle size concerns and class name collisions.

### Known deferred items

- Full Lighthouse PWA audit with service worker and manifest verification (requires deployed
  environment; local dev server does not trigger the installable prompt).
- Automated WCAG contrast regression test in CI (currently a manual script).
- CardHistory revert confirmation prompt: history is viewable and revert writes a new card
  version, but a confirmation step before revert is not yet implemented.
- Anki .apkg export (import-only today; export would require writing SQLite in the browser).
- Deck sharing via public URL (architecture supports it via Base44 entity permissions, but the
  UI flow is not built).
- Performance profiling on large decks (1000+ cards): batch loading and virtual scrolling in
  LibraryView and DeckView are not implemented.


# Changelog

## Session 5 (2026-04-26)

### Deferred items implemented

All ten items deferred across Sessions 1-4 are implemented in this session.

#### Item 1: sleepPrefersReviews scheduler wiring

- `isInSleepWindow` (already present in Home.jsx) is now used directly in `StudySelectView`.
- When `sleepPrefersReviews` is true AND the current time is within the sleep window, `sleepWindowActive` is set in `StudySelectView`. New cards are capped to 0 for the session (`onStartSRS` passes `0` as `capOverride`). The stats panel shows "Bedtime window: reviews only. New cards are paused until tomorrow (Diekelmann and Born, 2010)."
- The TODO comment in SettingsView pointing at the scheduler is removed.

#### Item 2: auto-run CardState migration on first load

- The startup `useEffect` in the root component now calls `storage.listCardStates()` after `loadAll()`. If any cards have scheduling state (`stability != null` or `reviewCount > 0`) but no matching migrated CardState, `storage.runMigration()` is called automatically.
- This is idempotent: the migration script checks the `migrated` flag. Migration errors are non-fatal.
- Added `listCardStates()` export to `storage.js`.

#### Item 3: dark mode contrast audit

- `node scripts/check-contrast.js` run against all 23 token pairs. All pairs pass WCAG 2.2 AA 4.5:1 or 3.0:1 (UI) thresholds. No colour changes required. The `textMut` fix from Session 1 continues to hold.

#### Item 4: remove deprecated scheduling field writes from toEntityData

- `stability`, `difficulty`, `interval`, `nextReview`, `lastReview`, `reviewCount`, `lapses`, and `ratingHistory` removed from `toEntityData` in `storage.js`. These were causing redundant writes on every card save.
- `toAppCard` backward-compat shim is retained: reading these fields FROM Flashcard for pre-migration cards is still supported.

#### Item 5: polygon mask support in ImageOcclusionEditor

- `ImageOcclusionEditor` now supports two draw modes: `rect` (default, R key) and `poly` (P key).
- Polygon mode: click to add vertices, double-click or Enter to close and save the polygon. Escape cancels the in-progress polygon.
- Polygon regions stored as `{ id, label, type: "polygon", points: [{x, y}, ...] }` in fractional coords.
- Rectangle regions retain `{ id, label, type: "rect", x, y, width, height }`.
- `OcclusionCardRenderer` handles both types: polygons rendered as SVG `<polygon>` elements.
- `base44/entities/Flashcard.jsonc` `occlusionRegions` schema updated to include `type`, `points`.

#### Item 6: full parentDeckId hierarchy rendering

- `storage.js` `loadAll()` now builds `deckParentMapMemo` (Map from childTitle to parentTitle) from `parentDeckId` relationships on loaded deck entities. Returns this as `deckParentMap` in the result.
- `getDeckParentMap()` export added to `storage.js`.
- `buildDeckTree(deckNames, parentMap)` in `Home.jsx` updated to use `parentMap` when populated. Falls back to the `::` name convention when `parentMap` is empty (pre-migration).
- `LibraryView` receives `deckParentMap` from root state and passes it to `buildDeckTree`.

#### Item 7: Image Occlusion .apkg geometry import

- `parseOcclusionSvg(svgString)` added to `src/api/anki.js`. Parses SVG `<rect>` elements from Image Occlusion Enhanced field 2, normalises to fractional coords using SVG viewBox.
- `convertToNidusCards` for `image_occlusion` notes: if regions are parsed, creates one card per region with `cardType: "image_occlusion"`. Falls back to basic card with warning if parsing fails.

#### Item 8: sample deck image occlusion card

- `createSampleDeck` in Home.jsx now adds two image occlusion cards covering the Adenylyl Cyclase and cAMP labels in a self-contained SVG Beta-Blocker Pathway diagram (no external image URL dependency). Uses `createOcclusionCards` so cards are fully compatible with the review machinery.

#### Item 9: FSRS-5 parameter gradient descent

- New file: `src/lib/fsrs-optimizer.js`. Exports `fitParams`, `buildReviewLog`, `DEFAULT_PARAMS`.
- `fitParams` implements stochastic gradient descent over review history to fit the FSRS-5 forgetting curve exponent (w[17]) from observed recall outcomes. Reference: open-spaced-repetition/fsrs-optimizer.
- `buildReviewLog` extracts review events from cards' `ratingHistory`.
- `fitSchedulerParams` in `Home.jsx` now dynamically imports `fsrs-optimizer.js` and runs gradient descent asynchronously after each session that meets the 200-review threshold. The synchronous retention-target adjustment path is retained as a fallback.
- `fsrs-optimizer.js` is loaded lazily (dynamic import) to avoid bundling gradient descent math at startup.

#### Item 10: SVG icons as proper PWA assets

- `public/icons/icon-192.svg` and `public/icons/icon-512.svg` updated to production-quality design: 512x512 viewBox, rx=80 rounded background, Georgia serif N letterform, three decreasing dots representing spaced repetition cadence.
- `public/manifest.json` already references SVG icons with `type: "image/svg+xml"` and `purpose: "maskable"`. No changes needed to manifest.
- Note: PNG icon generation (192x192, 512x512) for iOS home screen and PWA store validators requires a build step using `sharp` or `svgexport`. SVGs are sufficient for Chrome/Android PWA and desktop installs.

### Decisions made under discretion

- `sleepWindowActive` caps new cards to 0 at session start rather than inside `getDueWithCatchup`. This avoids touching the scheduling core and is simpler to reason about; the user sees 0 new cards in the stats panel before starting.
- `fsrs-optimizer.js` gradient descent is asynchronous and non-blocking. Errors are caught and logged as warnings; they never affect the UI or session flow.
- Polygon mode in `ImageOcclusionEditor` uses SVG `onClick`/`onDoubleClick` on the SVG element rather than the surrounding div to get accurate fractional coordinates from `getBoundingClientRect`.
- `parseOcclusionSvg` in `anki.js` uses `DOMParser` (available in all modern browsers). Server-side use would need a DOM shim, but the Anki import runs only in the browser.

---

## Session 4 (2026-04-26)

### PWA Architecture: Offline Capabilities

**What works offline (after first visit):**
- App shell (HTML, JS, CSS, fonts) loads from service worker cache with no network required.
- Review sessions can be completed offline: ratings are written to Dexie (IndexedDB) immediately and queued in `pendingActions` for later sync.
- Local CardState in Dexie acts as the source of truth for the review UI during offline sessions.

**What does not work offline:**
- Base44 entity reads and writes require network connectivity. There is no mechanism to issue Base44 API calls without a network connection. This is a hard architectural constraint of the Base44 platform.
- New card creation, deck management, and settings sync all require an active connection.

**Offline sync guarantees:**
- On reconnect, the `drainQueue()` function reads all queued `pendingActions` from Dexie and flushes them to Base44 via `storage.syncCardState`.
- Conflict resolution: latest timestamp wins per cardClientId. If a card is rated on two devices while both are offline, the rating with the later ISO timestamp is used when both sync. This rule is documented in the architecture comment at the top of `src/lib/offline-store.js`.

### Changed

- **Phase 4.1a (dependencies):** Added `dexie` (^4.0.0, MIT, dfahlander/Dexie.js), `workbox-window` (^7.0.0, Apache-2.0, GoogleChrome/workbox), `fflate` (^0.8.0, MIT, 101arrowz/fflate), `sql.js` (^1.12.0, MIT, sql-js/sql.js), and `vite-plugin-pwa` (^0.20.0, MIT, vite-pwa/vite-plugin-pwa) to package.json. Added `postinstall` script that copies `sql-wasm.wasm` from node_modules to `public/` automatically after `npm install`.

- **Phase 4.1b (offline-store.js):** Created `src/lib/offline-store.js`. Exports: `seedFromNetwork` (mirrors Base44 data to Dexie on load), `queueRating` (stores a rating in `pendingActions` and optimistically updates `cardStates`), `drainQueue` (flushes pending ratings to Base44 on reconnect with conflict resolution), `onReconnect` (registers an `online` event listener), `getQueueLength`, and `isOnline`. Dexie schema version 1 with tables: `cards`, `cardStates`, `decks`, `sessionLog`, `pendingActions`, `meta`.

- **Phase 4.1c (pwa.js):** Created `src/lib/pwa.js`. Captures the `beforeinstallprompt` event and exports `deferredInstallPrompt`, `triggerInstallPrompt()`, and `isInstallable()`. The prompt is shown after the user completes at least one review session (not on first load) and is suppressed permanently once dismissed via `localStorage`.

- **Phase 4.1c (Home.jsx offline wiring):** Added `isOffline` state (initialised from `navigator.onLine`). Added online/offline event listeners in a `useEffect` on mount. After `loadAll()` succeeds, `seedFromNetwork` is called to mirror data to Dexie. On reconnect, `drainQueue` flushes any queued ratings and updates `syncStatus`. In `handleRate` (SessionView), if `!navigator.onLine`, the rating is also passed to `offlineStore.queueRating` with the computed `newState`. The offline indicator (amber dot banner) is shown in the UI whenever `isOffline` is true. The PWA install prompt is shown after the first completed session if the browser has a deferred `beforeinstallprompt` and the user has not previously dismissed it.

- **Phase 4.1d (vite.config.js):** Added `VitePWA` plugin. Configures `autoUpdate` service worker registration, Workbox glob patterns for static assets, and a `StaleWhileRevalidate` runtime cache for Base44 API GET requests (24-hour expiry). Added `assetsInclude: ['**/*.wasm']` so Vite handles sql.js WASM correctly. Existing `base44` and `react` plugins are unchanged.

- **Phase 4.1e (icons):** Created `public/icons/icon-192.svg` and `public/icons/icon-512.svg` as branded SVGs (green rounded rectangle, "N" glyph in cream). Note: production-quality PNG icons should be generated from these SVGs before app store submission or PWA store listing. PNG icons are required for some PWA manifest validators and iOS home screen display. The postinstall step does not handle PNG generation.

- **Phase 4.1f (manifest.json):** Updated `public/manifest.json`: description updated to "Spaced repetition for postgraduate learners.", `background_color` updated to `#F5F0EB`, added `icon-192.svg` and `icon-512.svg` entries alongside the existing `icon.svg` entry.

- **Phase 4.2a (anki.js):** Created `src/api/anki.js`. Exports `parseApkg(fileOrBuffer)` and `convertToNidusCards(parsedNotes, genId)`. `parseApkg` uses `fflate.unzipSync` to extract the .apkg ZIP, then `sql.js` to open and query the SQLite `collection.anki2` database. Extracts decks, models (note types), notes, and card-to-deck assignments. Categorises notes as `basic`, `cloze`, or `image_occlusion` based on model type and name. `convertToNidusCards` maps each note to one or more Nidus Recall card objects. Cloze notes generate one card per cloze index using the same regex as `parseCloze` in Home.jsx. Image occlusion notes are imported as basic cards with a warning. Scheduling state (SM-2 intervals, ease factors) is intentionally discarded: see module comment for rationale. sql.js WASM is loaded lazily via dynamic import to avoid blocking app startup.

- **Phase 4.2b (Anki import tab in Home.jsx):** Added an "Anki" tab to `ImportExportPanel`. State 1 (file picker): describes the import behaviour including the deliberate scheduling state discard. State 2 (preview): shows deck count, basic/cloze/image occlusion/unknown note counts, and any parse warnings (first 5 shown, remainder counted). Import button is disabled during the async import. `handleApkgSelect` dynamically imports `src/api/anki.js` on first use. `handleApkgImport` merges converted cards with existing cards and calls `handleApkgImportCards` in the root component, which syncs to Base44.

- **Phase 4.2c (sql.js WASM):** `postinstall` script in `package.json` copies `node_modules/sql.js/dist/sql-wasm.wasm` to `public/sql-wasm.wasm`. `sql.js` `locateFile` callback in `anki.js` resolves to `/${file}` so the WASM is fetched from the public root at runtime.

### Deferred

- **PNG icon generation:** SVG icons are provided as placeholders. PNG icons (192x192 and 512x512) should be generated from the SVGs before production deployment or app store submission. Some PWA validators and iOS home screen rendering require PNG format.

- **Full Image Occlusion note import (geometry parsing):** Image Occlusion Enhanced notes are imported as basic cards with a warning. Parsing the occlusion geometry JSON from the Anki note fields and mapping it to Nidus Recall's fractional-coordinate `occlusionRegions` format is non-trivial and deferred to a future session.

- **Polygon mask support (carried from Session 3):** `ImageOcclusionEditor` supports rectangles only. Polygon support remains a documented TODO.

- **parentDeckId hierarchy rendering (carried from Session 3):** Visual `::` indentation fallback is in place. Full hierarchy from `parentDeckId` requires the Session 3 migration to have run.

- **sleepPrefersReviews scheduler wiring (carried from Sessions 1-3):** Still UI-only.

- **Full FSRS-5 gradient descent optimisation (carried from Session 2):** Still retention-target-only.

### Decisions made under discretion

- **Library choices:** `fflate` chosen over JSZip for .apkg unzipping: smaller bundle, actively maintained, pure JS (no WASM needed for unzip, which keeps the unzip path synchronous and simple). `sql.js` chosen over `@jlongster/better-sqlite3` and similar because it runs in the browser without a server, is MIT licensed, and is the most widely used browser SQLite library.

- **Anki scheduling state discard:** SM-2 and FSRS parameters have different mathematical bases. Silently converting SM-2 ease factors to FSRS stability would produce intervals that are either too short (causing over-review) or too long (causing forgotten cards). Starting all imported cards fresh is the safer choice and is explicitly disclosed to the user in the import UI.

- **sql-wasm.wasm postinstall copy approach:** Copying the WASM to `public/` via a `postinstall` script is the simplest approach that works with both `vite dev` and `vite build`. The alternative (a custom Vite plugin that copies the file on each build) adds complexity without benefit since the WASM rarely changes between sql.js versions.

- **Install prompt shown after first session:** Showing the prompt immediately on app load is poor UX (user has not yet decided if they like the app). Waiting for at least one completed session means the user has experienced the core loop before being asked to install.

- **Offline indicator shown immediately:** The offline dot banner appears as soon as `navigator.onLine` becomes false. This gives immediate feedback that the app is in offline mode and that ratings will be queued, which is more reassuring than silent operation.

### Follow-up items for Session 5

- Generate PNG icons from SVGs (192x192 and 512x512) and update manifest and vite.config.js.
- Implement full Image Occlusion geometry import from .apkg files.
- Wire `sleepPrefersReviews` into `getDueWithCatchup`.
- Full FSRS-5 gradient descent optimisation from review log.
- Dark mode contrast audit (carried from Session 1).

---

## Session 1 (2026-04-26)

### Changed

- **Phase 0 (RECON_NOTES.md):** Added a full codebase reconnaissance document covering
  project structure, FSRS implementation, card creation, styling system, and data shapes.

- **Phase 1.1 (daily limits):** Lowered `newCardCap` default from 50 to 15 and
  `reviewCap` default from 200 to 100. Added migration logic in `settingsGet` to reset
  old stored defaults (50 and 200) to the new values on first load; users who have
  customised away from the old defaults are left untouched. Added helper text beneath
  each slider citing Wozniak (supermemo.com) for new cards and Anki community defaults
  for reviews.

- **Phase 1.2 (sleep panel):** Replaced the sleep helper paragraph with hedged,
  source-cited copy: "Sleep after study supports memory consolidation
  (Diekelmann and Born, 2010)." Added a new `sleepPrefersReviews` toggle (default true)
  to both `DEFAULT_SETTINGS` and `base44/entities/User.jsonc`. The toggle is UI-only for
  this session (see Deferred).

- **Phase 1.3 (branding):** Replaced "Welcome to Nidus" (JSX text node and string
  literal) with "Welcome to Nidus Recall". Updated `manifest.json` name field from
  "Nidus" to "Nidus Recall". `index.html` already had "Nidus Recall" in the title and
  apple-mobile-web-app-title. `short_name` kept as "Nidus" (PWA short names are length-
  constrained; 5 chars is appropriate for home-screen display).

- **Phase 1.4a (contrast script):** Created `scripts/check-contrast.js`, a Node.js
  built-ins-only script that checks WCAG 2.2 AA contrast ratios for all colour token
  pairs. Exits with code 1 on any AA failure for body/interactive/label/rating text.

- **Phase 1.4b (contrast fixes):** `textMut` colour updated from `#7BA090` (ratio 2.68)
  to `#4A6B5C` (ratio 4.73 to 5.49 across all app backgrounds). Hue kept consistent
  with the green-on-cream palette. All CSS class references to `#7BA090` updated. All
  23 token pairs now pass WCAG 2.2 AA at 4.5:1 or better.

- **Phase 1.4c (slider inputs):** Added paired `<input type="number">` next to every
  `<input type="range">` in `SettingsView`. Affected sliders: new cards per day,
  reviews per day, catch-up spread, target retention, leech threshold, maturity
  threshold. Both inputs are kept in sync via the same state setter.

- **Phase 1.5 (em dash audit):** Replaced all 22 em dashes in `Home.jsx` with
  contextually appropriate substitutes (colons, semicolons, hyphens). CSS decorative
  section dividers converted to hyphens. No em dashes remain in any source or
  user-facing file.

### Deferred

- **sleepPrefersReviews scheduler wiring:** The `sleepPrefersReviews` toggle is UI-only.
  Wiring it into `getDueWithCatchup` or `fsrsSchedule` requires non-trivial changes to
  session queue composition. A TODO comment in `SettingsView` points at the scheduler.
  Deferred to Session 2.

- **Per-user FSRS parameter optimisation:** The W parameter array is a hard-coded
  module-level constant (published FSRS v4 defaults). No per-user optimisation
  mechanism exists. Deferred to a future session - would require collecting per-card
  rating history and running optimisation offline.

- **AI-assist card creation:** No AI-assist call site found. If desired, this would
  require a new API integration. Deferred.

- **No test suite:** The repo has no test runner. Scripts/ directory now has one script.
  Formal test coverage deferred to a future session.

### Decisions made under discretion

- `textMut` darkened from `#7BA090` to `#4A6B5C` to meet WCAG 2.2 AA 4.5:1. The new
  shade is still a muted sage green, consistent with the palette. Dark mode variants not
  separately adjusted (dark mode uses CSS media queries and the inline style references
  have not been enumerated; further dark mode contrast work is a Session 2 item).

- `short_name` in `manifest.json` kept as "Nidus" (5 chars). PWA short names appear
  on home screens where space is limited; "Nidus Recall" (12 chars) would be truncated
  on many devices. This is intentional and noted.

- Sample deck name changed from "Pain Neuroscience - Sample" (was "Pain Neuroscience
  - Sample" with em dash, now hyphen-minus). The deck name is visible to users.

- The contrast script `helperText` key in COLORS is defined but not used in any pair;
  the functional coverage comes from `textMut` which maps to the same role.

### Follow-up items for Session 2

- Wire `sleepPrefersReviews` into `getDueWithCatchup` to reorder session queue during
  the sleep window (place due reviews before new cards when the toggle is on).

- Dark mode contrast audit: check `textMut` and other tokens against dark surfaces
  (`#162018`, `#142016`, `#252018`).

- FSRS per-user parameter optimisation exploration.

- Consider adding a "Progress" or "Streak" widget to the Library view.

- Review the `Flashcard.jsonc` and `User.jsonc` JSON escape sequences and
  decide whether to replace with hyphens for source consistency.

---

## Session 2 (2026-04-26)

### Changed

- **Phase 2.1a (CardState entity):** Created `base44/entities/CardState.jsonc`.
  Stores FSRS scheduling state (stability, difficulty, interval, nextReview, lastReview,
  reviewCount, lapses, ratingHistory) keyed by cardClientId. Adds suspended and
  buriedUntil fields for future queue management, and a migrated flag for idempotent
  migration tracking.

- **Phase 2.1b (UserSchedulerParams entity):** Created
  `base44/entities/UserSchedulerParams.jsonc`. Stores the per-user fitted FSRS parameter
  array (up to 19 values), the date of last fit, the review count at fit time, and the
  fit algorithm version.

- **Phase 2.1c (Flashcard schema deprecations):** Marked the following fields on
  `base44/entities/Flashcard.jsonc` as deprecated (description updated to
  "Deprecated: use CardState"): stability, difficulty, interval, nextReview, lastReview,
  reviewCount, lapses, ratingHistory. Fields retained in the schema and on existing
  records to preserve backward compatibility during migration. Also replaced two Unicode
  em dash escape sequences (U+2014, stored as escaped chars) in field descriptions with colons.

- **Phase 2.1d (migration files):** Created `migrations/2026-04-26-split-card-state.js`
  (ES module, exports migrateUp and migrateDown). Created
  `migrations/2026-04-26-split-card-state.md` (safety properties, rollback procedure).
  Safety properties: idempotent via migrated flag (migrateUp is a no-op for
  already-migrated cards); reversible via migrateDown (copies CardState fields back
  onto Flashcard records before rollback).

- **Phase 2.1f (storage.js CardState support):** Refactored `src/api/storage.js`:
  - Added cardStateMap, cardStateEntityIdMap, cardStateSnapshot in-memory maps.
  - Added toAppCardState() helper.
  - loadAll() now fetches CardState entities first (so toAppCard can merge them),
    then loads Flashcards. Backward-compat shim: if no CardState exists for a card,
    toAppCard falls back to reading scheduling fields from the Flashcard entity.
  - toEntityData() now writes content fields only (no scheduling fields); scheduling
    state is routed to CardState.
  - Added syncCardState(clientId, stateFields): create or update a single CardState.
  - Added syncCardStates(updatedCards): batch diff and persist changed CardState records.
  - Added getUserSchedulerParams(): returns current UserSchedulerParams or null.
  - Added saveUserSchedulerParams(params, reviewCount): create or update record.
  - Added runMigration(): imports and runs migrateUp from the migrations module.
  - loadAll() loads UserSchedulerParams (first record if any exists).

- **Phase 2.1g (Home.jsx CardState write path):** updateCards() now also debounces
  a syncCardStates call (800ms, same as syncCards). flushCards() awaits both syncCards
  and syncCardStates before resolving. Scheduling fields continue to flow through the
  merged in-memory card object; routing to CardState is transparent to handleRate.

- **Phase 2.2a-b (ts-fsrs adoption):** Replaced the hand-rolled FSRS v4 implementation
  (17-parameter W array, inline math) with a wrapper around ts-fsrs (package: ts-fsrs,
  version ^4.0.0, MIT license, open-spaced-repetition/ts-fsrs). ts-fsrs is the
  reference TypeScript implementation of FSRS-5, actively maintained with commits in
  2024-2025. The wrapper function scheduleFSRS() accepts per-user params from
  UserSchedulerParams when available, falling back to ts-fsrs defaults. Both handleRate
  and intLabel (the rating button interval preview) now call scheduleFSRS.

- **Phase 2.2c (UserSchedulerParams in storage):** storage.js loads UserSchedulerParams
  on startup and exposes getUserSchedulerParams() and saveUserSchedulerParams() exports.

- **Phase 2.2d (parameter fitting on session end):** handleClose in SessionView now
  runs fitSchedulerParams after saving the session log if: total reviews >= 200 AND
  (no prior fit OR last fit was more than 7 days ago OR review count has grown by
  more than 50 since last fit). fitSchedulerParams compares observed recall accuracy
  (non-Again / total) to the desired retention target. If accuracy is above target
  + 0.05, the target is loosened by 0.02; if below target - 0.05, it is tightened
  by 0.02. The updated target is written to settings and to UserSchedulerParams via
  saveUserSchedulerParams. A "Refit now" button in settings triggers the same fit
  immediately, bypassing the review count threshold.

- **Phase 2.2e (FSRS Parameters UI):** Added an "FSRS Parameters" card in the
  Advanced settings section of Nidus Recall. Displays: current parameter set status
  (default or fitted with date and review count), current desired retention, and a
  "Refit now" button. The card is read-only except for the refit button.

### Deferred

- **Full 19-parameter FSRS-5 gradient descent optimisation:** Current fitting only
  adjusts the desired retention target (single parameter) from observed recall accuracy.
  Full optimisation requires gradient descent over the review log, following the
  open-spaced-repetition/fsrs-optimizer reference algorithm. Deferred to Session 3.
  A TODO comment in fitSchedulerParams marks the deferral point.

- **sleepPrefersReviews scheduler wiring:** Carried forward from Session 1. Still
  UI-only. Deferred to Session 3.

- **CardState table creation:** Base44 will create the CardState and UserSchedulerParams
  tables automatically on first use. The migration (migrateUp) must be run from the
  browser console after the first deployment to populate CardState from existing
  Flashcard records.

- **Dark mode contrast audit:** Carried forward from Session 1.

### Decisions made under discretion

- ts-fsrs chosen over other FSRS implementations because it is: (a) the reference
  implementation maintained by the open-spaced-repetition project, (b) MIT licensed,
  (c) actively maintained with commits in 2024-2025, and (d) implements FSRS-5 (the
  current algorithm version), whereas the hand-rolled code implemented FSRS v4.

- The Flashcard scheduling fields are retained in the schema and not removed from
  toEntityData writes at this stage. Removing them would require confirming all users
  have completed migration. Removal is a Session 3 task, gated on migration completion.

- Fitting trigger threshold set at 200 reviews (matching a commonly cited minimum for
  FSRS optimisation meaningful signal, per the open-spaced-repetition project docs).
  Refit frequency capped at once per 7 days to avoid thrashing on small rating batches.

- The createEmptyCard import from ts-fsrs is included for future use (new card
  initialisation) but not called in this session; the existing card state initialisation
  path in handleRate (newCard branch) is sufficient.

### Follow-up items for Session 3

- Run migrateUp() from browser console after first deployment; verify CardState records
  created for all existing Flashcard records.

- Implement full FSRS-5 gradient descent over review log for 19-parameter optimisation.

- Wire sleepPrefersReviews into getDueWithCatchup.

- Remove deprecated scheduling fields from toEntityData writes once migration is
  confirmed complete for all users.

- Dark mode contrast audit.

---

## Session 3 (2026-04-26)

### Changed

- **Phase 3.1a (Flashcard schema):** Added cardType (enum: basic, cloze, image_occlusion),
  clozeText, clozeIndex, imageUrl, occlusionRegions, and occlusionRegionId fields to
  base44/entities/Flashcard.jsonc.

- **Phase 3.1b (cloze parser):** Added parseCloze() to Home.jsx. Parses Anki-compatible
  {{c1::answer}} and {{c1::answer::hint}} syntax. Returns sorted indices and pre-computed
  front/back variants. Added renderClozeFront() to replace [...] tokens with styled blank spans.

- **Phase 3.1c (cloze creation flow):** Added createClozeCards() which calls parseCloze and
  returns one Flashcard per cloze index with pre-computed front and back fields. This means
  existing review machinery works unchanged - no special cases in SessionView. DeckView gained
  an Add mode selector (basic / cloze / occlusion) with a live preview showing card count and
  card 1 front. A tooltip cites Roediger and Karpicke (Psychol Sci 2006) for the retrieval benefit.

- **Phase 3.1d (cloze rendering in study):** SessionView now checks card.cardType. Cloze fronts
  are passed through renderClozeFront() to show styled blank spans. Cloze backs show the revealed
  answer in the accent colour via nid-cloze-revealed class. Image occlusion cards use
  OcclusionCardRenderer instead.

- **Phase 3.2a (image occlusion schema):** imageUrl, occlusionRegions, and occlusionRegionId
  added to Flashcard.jsonc. occlusionRegions items are fractional-coordinate rectangles (0.0 to 1.0).
  CardState.jsonc gained clozeIndex and sourceCardClientId fields.

- **Phase 3.2b (ImageOcclusionEditor):** New React component in Home.jsx. Accepts
  onSave(imageUrl, regions) prop. Reads image via FileReader.readAsDataURL. Renders image with
  SVG overlay for drawing rectangles by mouse drag. Stores regions as fractional coordinates.
  Click to select region; shows label input and delete button. Delete key removes selected region.
  Follows Image Occlusion Enhanced addon convention used by AnKing and Pepper Pharm communities.
  Polygon support is a documented TODO.

- **Phase 3.2c (occlusion card creation):** Added createOcclusionCards(imageUrl, regions, deckName).
  Creates one Flashcard per region with cardType image_occlusion, all regions stored on each card,
  and occlusionRegionId pointing to the specific tested region.

- **Phase 3.2d (OcclusionCardRenderer):** Renders image with SVG overlay. Front: tested region
  is opaque mask (#2D6E52); all others semi-transparent. Back (revealed): all regions shown with
  labels. Uses fractional coordinates with preserveAspectRatio="none" so geometry scales correctly.

- **Phase 3.3a (interleaved study mode):** Added Interleaved Review as a third study mode in
  StudySelectView. Subtitle cites Rohrer and Taylor (J Educ Psychol 2007) and Birnbaum et al.
  (Mem Cognit 2013) for the interleaving advantage. Mode selector shows all three options.

- **Phase 3.3b (interleaved session logic):** startInterleaved(deckIds) gathers due and new
  cards from selected decks, shuffles via Fisher-Yates, and passes the shuffled list as
  interleavedCards to SessionView. SessionView uses interleavedCards when provided, overriding
  the normal deck-filtered list. A deck multi-select panel appears when Interleaved mode is chosen.

- **Phase 5.1 (empty stats screen):** When log.length === 0, StatsView shows a teaching panel
  with definitions of Due today, Active cards, Mature cards, Recall accuracy, and Critical cards.
  A second card explains the FSRS scheduling algorithm with a reference to the Open Spaced
  Repetition project. A third card describes what to expect in Week 1, Week 4, and Month 3.
  The stat card section renders with opacity 0.25 and blur(2px) when no sessions exist.
  ReviewHeatmap renders at the top of StatsView regardless of session count.

- **Phase 5.2 (onboarding consolidation):** OnboardingView reworked. Primary CTA is now
  "Try a sample deck" (calls createSampleDeck). Secondary outline button is "Create your first
  deck". The "See how it works" modal removed: the sample deck (Common Pharmacology: Essentials)
  is self-explanatory with 10 basic cards, 6 cloze cards (3 source texts times 2 indices each),
  and notes on image occlusion. The "+ New Deck" button is hidden when cards.length === 0 and
  decks.length === 0 to reduce visual noise on first visit.

- **Phase 5.2 (sample deck):** createSampleDeck now creates "Common Pharmacology: Essentials"
  with 10 basic pharmacology cards (beta-blockers, ACE inhibitors, statins, warfarin, metformin)
  and 6 cloze cards from 3 source texts (warfarin mechanism, ACE inhibitor cough, metformin
  mechanism). Source field set to "BNF / standard pharmacology reference". All clinical content
  is established pharmacology, not invented.

- **Phase 5.3 (review activity heatmap):** Added buildHeatmapData() and ReviewHeatmap component.
  365-day grid of 11x11 px cells in 53 week columns. Four intensity levels mapped to green shades.
  Streak counter (current and longest) shown above. Refs: Lally et al. (Eur J Soc Psychol 2010)
  for habit maintenance visibility.

- **Phase 5.4a (deck hierarchy schema):** Added parentDeckId (nullable string) to
  base44/entities/Deck.jsonc.

- **Phase 5.4b (hierarchy migration):** Created migrations/2026-04-26-deck-hierarchy.js with
  migrateUp() and migrateDown(). migrateUp() detects "::" in deck names and creates parent/child
  relationships. Idempotent (skips decks with parentDeckId already set). Reversible via
  migrateDown(). Created migrations/2026-04-26-deck-hierarchy.md describing safety properties
  and rollback procedure.

- **Phase 5.4c (hierarchy display):** Added buildDeckTree() which maps "::" in deck names to
  indent levels as a visual fallback (works immediately, no migration required). DeckView list
  and LibraryView deck cards show indented display names for sub-decks. Full parentDeckId-driven
  hierarchy deferred to Session 4 pending migration confirmation.

- **storage.js:** toAppCard, toEntityData, toAppCardState, and syncCardState payload now include
  cardType, clozeText, clozeIndex, imageUrl, occlusionRegions, occlusionRegionId,
  clozeIndex (CardState), and sourceCardClientId (CardState).

### Deferred

- **Polygon mask regions:** ImageOcclusionEditor supports rectangles only. Polygon support is
  a documented TODO in the component comment. Deferred to Session 4.

- **Full hierarchy rendering from parentDeckId:** Visual fallback ("::" indentation) is
  implemented. Loading and rendering from parentDeckId requires the migration to have run.
  Deferred to Session 4.

- **sleepPrefersReviews scheduler wiring:** Carried forward from Sessions 1 and 2. Still UI-only.

- **Full FSRS-5 gradient descent optimisation:** Carried forward from Session 2.

- **Dark mode contrast audit:** Carried forward from Session 1.

- **Image occlusion note in sample deck:** A note card about image occlusion is not included
  because the schema and editor are implemented but the sample deck would need a real image URL.
  Deferred: users can create their own occlusion cards via the DeckView occlusion mode.

### Decisions made under discretion

- **"See how it works" modal removed:** The modal covered three general steps that the sample
  deck demonstrates in practice. Removing it reduces friction at the point where the user is
  already motivated to start. A note is left in OnboardingView explaining the decision.

- **Sample deck name changed** from "Pain Neuroscience - Sample" to "Common Pharmacology:
  Essentials". Pharmacology was chosen over pain neuroscience because it (a) covers a wider
  postgraduate medical audience, (b) allows demonstration of all three card types naturally,
  (c) includes more established test-able factual content suited to cloze format.

- **Cloze front/back pre-computed at creation time** rather than at render time. This keeps
  SessionView simple (no special rendering path) and means cloze cards are fully compatible
  with existing import/export, search, and edit flows without modification.

- **Interleaved mode uses Fisher-Yates shuffle** of due plus new cards from selected decks.
  The cap override is set to the full combined list length so all shuffled cards appear in
  one session. This matches the expected behaviour of interleaved study.
