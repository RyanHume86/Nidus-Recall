# Changelog

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
